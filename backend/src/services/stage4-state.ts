import {
  AgreementDTO,
  CoverageRowDTO,
  GetStage4StateResponse,
  ProposalCardDTO,
  Stage4CoverageAuditDTO,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4Phase,
  Stage4ProposalKind,
  Stage4SelectionDecision,
  Stage4SelectionDTO,
  Stage4ProposalStatus,
  TendingPreviewDTO,
  UnaddressedNeedDTO,
} from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';

type SessionForStage4 = {
  id: string;
  status: string;
  relationship: {
    members: Array<{ userId: string; joinedAt: Date }>;
  };
};

type Stage4ProposalRow = {
  id: string;
  description: string;
  needsAddressed: string[];
  duration: string | null;
  measureOfSuccess: string | null;
  kind: Stage4ProposalKind;
  status: Stage4ProposalStatus;
  createdByUserId: string | null;
  updatedAt: Date;
};

type Stage4SelectionRow = {
  proposalId: string;
  userId: string;
  decision: Stage4SelectionDecision;
  note: string | null;
  selectedAt: Date;
  updatedAt: Date;
};

type Stage4NeedCoverageRow = {
  id: string;
  needId: string | null;
  needLabel: string;
  sourceUserId: string | null;
  coverageStatus: string;
  coveringProposalIds: string[];
  note: string | null;
  updatedAt: Date;
};

type Stage4ClosureRow = {
  kind: Stage4ClosureKind;
  reason: Stage4ClosureReason;
  summary: string;
  sharedAgreementIds: string[];
  individualProposalIds: string[];
  openNeedIds: string[];
  closedAt: Date;
  checkInAt: Date | null;
};

type Stage4ProgressRow = {
  userId: string;
  gatesSatisfied: unknown;
};

type AgreementRow = {
  id: string;
  proposalId: string | null;
  description: string;
  type: AgreementDTO['type'];
  duration: string | null;
  measureOfSuccess: string | null;
  status: AgreementDTO['status'];
  agreedByA: boolean;
  agreedByB: boolean;
  agreedAt: Date | null;
  followUpDate: Date | null;
};

type TendingEntryRow = {
  id: string;
  type: NonNullable<TendingPreviewDTO['nextEntry']>['type'];
  status: NonNullable<TendingPreviewDTO['nextEntry']>['status'];
  agreementId: string | null;
  scheduledFor: Date | null;
  openedAt: Date | null;
  completedAt: Date | null;
  summary: string | null;
};

export class Stage4StateNotFoundError extends Error {
  constructor() {
    super('Session not found');
    this.name = 'Stage4StateNotFoundError';
  }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function getPartnerId(session: SessionForStage4, userId: string): string | null {
  return session.relationship.members.find((member) => member.userId !== userId)?.userId ?? null;
}

function getSourceLabel(
  sourceUserId: string | null,
  userId: string,
  partnerUserId: string | null
): CoverageRowDTO['source'] {
  if (!sourceUserId) return 'UNKNOWN';
  if (sourceUserId === userId) return 'YOU';
  if (sourceUserId === partnerUserId) return 'PARTNER';
  return 'UNKNOWN';
}

function buildCoverageAudit(
  coverageRows: Stage4NeedCoverageRow[],
  userId: string,
  partnerUserId: string | null
): Stage4CoverageAuditDTO {
  const rows = coverageRows.map((row): CoverageRowDTO => ({
    id: row.needId ?? row.id,
    label: row.needLabel,
    source: getSourceLabel(row.sourceUserId, userId, partnerUserId),
    coveringProposalIds: row.coveringProposalIds,
    note: row.note,
  }));

  const byStatus = (status: string) =>
    rows.filter((_, index) => coverageRows[index].coverageStatus === status);

  const updatedAt = coverageRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  return {
    covered: byStatus('COVERED'),
    partial: byStatus('PARTIAL'),
    open: byStatus('OPEN'),
    updatedAt: iso(updatedAt),
  };
}

function buildUnaddressedNeeds(
  coverageRows: Stage4NeedCoverageRow[],
  userId: string,
  partnerUserId: string | null
): UnaddressedNeedDTO[] {
  return coverageRows
    .filter((row) => row.coverageStatus === 'OPEN')
    .map((row) => ({
      id: row.needId ?? row.id,
      label: row.needLabel,
      source: getSourceLabel(row.sourceUserId, userId, partnerUserId),
      note: row.note ?? 'Still open',
    }));
}

function buildProposalCard(
  proposal: Stage4ProposalRow,
  userId: string,
  partnerUserId: string | null,
  selections: Stage4SelectionRow[],
  coverageRows: Stage4NeedCoverageRow[],
  revealPartnerSelections: boolean
): ProposalCardDTO {
  const mySelection = selections.find(
    (selection) => selection.proposalId === proposal.id && selection.userId === userId
  );
  const partnerSelection = partnerUserId
    ? selections.find(
        (selection) => selection.proposalId === proposal.id && selection.userId === partnerUserId
      )
    : undefined;

  const linkedCoverage = coverageRows
    .filter(
      (row) =>
        row.coveringProposalIds.includes(proposal.id) &&
        (row.coverageStatus === 'COVERED' || row.coverageStatus === 'PARTIAL')
    )
    .map((row) => ({
      id: row.needId ?? row.id,
      label: row.needLabel,
      coverage: row.coverageStatus as 'COVERED' | 'PARTIAL',
    }));

  return {
    id: proposal.id,
    kind: proposal.kind,
    description: proposal.description,
    ownerLabel:
      proposal.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT
        ? proposal.createdByUserId === userId
          ? 'You'
          : 'Partner'
        : undefined,
    needsAddressed: linkedCoverage.length > 0
      ? linkedCoverage
      : proposal.needsAddressed.map((label) => ({
          label,
          coverage: 'COVERED',
        })),
    duration: proposal.duration,
    measureOfSuccess: proposal.measureOfSuccess,
    status: proposal.status,
    myDecision: mySelection?.decision,
    partnerDecisionVisible: revealPartnerSelections ? partnerSelection?.decision : undefined,
  };
}


function hasSubmittedSelectionGate(progressRows: Stage4ProgressRow[], userId: string | null): boolean {
  if (!userId) return false;

  const progress = progressRows.find((row) => row.userId === userId);
  const gates = progress?.gatesSatisfied;
  return Boolean(
    gates &&
      typeof gates === 'object' &&
      !Array.isArray(gates) &&
      (gates as Record<string, unknown>).selectionSubmitted === true
  );
}

function buildAgreementDTO(agreement: AgreementRow, userIsA: boolean): AgreementDTO {
  return {
    id: agreement.id,
    strategyId: agreement.proposalId,
    description: agreement.description,
    type: agreement.type,
    duration: agreement.duration,
    measureOfSuccess: agreement.measureOfSuccess,
    status: agreement.status,
    agreedByMe: userIsA ? agreement.agreedByA : agreement.agreedByB,
    agreedByPartner: userIsA ? agreement.agreedByB : agreement.agreedByA,
    agreedAt: iso(agreement.agreedAt),
    followUpDate: iso(agreement.followUpDate),
  };
}

function derivePhase(args: {
  closure: Stage4ClosureRow | null;
  agreements: AgreementRow[];
  coverageRows: Stage4NeedCoverageRow[];
  mySelections: Stage4SelectionRow[];
  partnerSelections: Stage4SelectionRow[];
  mySelectionSubmitted: boolean;
  partnerSelectionSubmitted: boolean;
}): Stage4Phase {
  if (args.closure?.kind === Stage4ClosureKind.SHARED_AGREEMENT) {
    return Stage4Phase.CLOSED_SHARED_AGREEMENT;
  }

  if (args.closure?.kind === Stage4ClosureKind.NO_SHARED_AGREEMENT) {
    return Stage4Phase.CLOSED_NO_SHARED_AGREEMENT;
  }

  if (args.agreements.some((agreement) => agreement.status === 'PROPOSED')) {
    return Stage4Phase.CLOSING;
  }

  if (args.mySelectionSubmitted && args.partnerSelectionSubmitted) {
    return Stage4Phase.OUTCOME_REVIEW;
  }

  if (
    args.mySelectionSubmitted ||
    args.partnerSelectionSubmitted ||
    args.mySelections.length > 0 ||
    args.partnerSelections.length > 0
  ) {
    return Stage4Phase.SELECTION;
  }

  if (args.coverageRows.length > 0) {
    return Stage4Phase.COVERAGE_REVIEW;
  }

  return Stage4Phase.INVENTORY_BUILDING;
}

function buildTendingPreview(
  closure: Stage4ClosureRow | null,
  tendingEntries: TendingEntryRow[]
): TendingPreviewDTO | null {
  if (!closure && tendingEntries.length === 0) return null;

  const nextEntry = tendingEntries[0] ?? null;

  return {
    nextEntry: nextEntry
      ? {
          id: nextEntry.id,
          type: nextEntry.type,
          status: nextEntry.status,
          agreementId: nextEntry.agreementId,
          scheduledFor: iso(nextEntry.scheduledFor),
          openedAt: iso(nextEntry.openedAt),
          completedAt: iso(nextEntry.completedAt),
          summary: nextEntry.summary,
        }
      : null,
    scheduledCount: tendingEntries.filter((entry) => entry.status === 'SCHEDULED').length,
    openCount: tendingEntries.filter((entry) => entry.status === 'OPEN').length,
    passiveReentryAvailable: Boolean(closure),
  };
}

export async function getStage4State(
  sessionId: string,
  userId: string
): Promise<GetStage4StateResponse> {
  const session = (await prisma.session.findFirst({
    where: {
      id: sessionId,
      relationship: {
        members: {
          some: { userId },
        },
      },
    },
    include: {
      relationship: {
        include: {
          members: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
    },
  })) as SessionForStage4 | null;

  if (!session) {
    throw new Stage4StateNotFoundError();
  }

  const partnerUserId = getPartnerId(session, userId);
  const userIsA = session.relationship.members[0]?.userId === userId;

  const [
    proposals,
    selections,
    coverageRows,
    closure,
    agreements,
    tendingEntries,
    progressRows,
  ] = await Promise.all([
    prisma.strategyProposal.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<Stage4ProposalRow[]>,
    prisma.stage4ProposalSelection.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<Stage4SelectionRow[]>,
    prisma.stage4NeedCoverage.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<Stage4NeedCoverageRow[]>,
    prisma.stage4Closure.findUnique({
      where: { sessionId },
    }) as Promise<Stage4ClosureRow | null>,
    prisma.agreement.findMany({
      where: { sharedVessel: { sessionId } },
      orderBy: { agreedAt: 'desc' },
    }) as Promise<AgreementRow[]>,
    prisma.tendingEntry.findMany({
      where: { sessionId },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    }) as Promise<TendingEntryRow[]>,
    prisma.stageProgress.findMany({
      where: { sessionId, stage: 4 },
      select: { userId: true, gatesSatisfied: true },
    }) as Promise<Stage4ProgressRow[]>,
  ]);

  const mySelections = selections.filter((selection) => selection.userId === userId);
  const partnerSelections = selections.filter((selection) => selection.userId === partnerUserId);
  const activeProposals = proposals.filter((proposal) => proposal.status === Stage4ProposalStatus.ACTIVE);
  // "Submitted" must be an explicit act now (POST /stage4/share-selections),
  // not an implicit consequence of having decided on every proposal. Otherwise
  // partners would see each others' stances mid-deliberation.
  const mySelectionSubmitted = hasSubmittedSelectionGate(progressRows ?? [], userId);
  const partnerSelectionSubmitted = hasSubmittedSelectionGate(progressRows ?? [], partnerUserId);
  const revealPartnerSelections = mySelectionSubmitted && partnerSelectionSubmitted;
  const proposalCards = activeProposals.map((proposal) =>
    buildProposalCard(proposal, userId, partnerUserId, selections, coverageRows, revealPartnerSelections)
  );
  const unaddressedNeeds = buildUnaddressedNeeds(coverageRows, userId, partnerUserId);
  const agreementsDTO = agreements.map((agreement) => buildAgreementDTO(agreement, userIsA));
  const closedIndividualIds = new Set(closure?.individualProposalIds ?? []);
  const openNeedIds = new Set(closure?.openNeedIds ?? []);

  const latestInventoryUpdate = proposals.reduce<Date | null>((latest, proposal) => {
    if (!latest || proposal.updatedAt > latest) return proposal.updatedAt;
    return latest;
  }, null);

  return {
    phase: derivePhase({
      closure,
      agreements,
      coverageRows,
      mySelections,
      partnerSelections,
      mySelectionSubmitted,
      partnerSelectionSubmitted,
    }),
    inventory: {
      sharedProposals: proposalCards.filter(
        (proposal) => proposal.kind === Stage4ProposalKind.SHARED_PROPOSAL
      ),
      individualCommitments: proposalCards.filter(
        (proposal) => proposal.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT
      ),
      unaddressedNeeds,
      removedProposalCount: proposals.filter((proposal) => proposal.status === Stage4ProposalStatus.REMOVED).length,
      updatedAt: iso(latestInventoryUpdate) ?? new Date(0).toISOString(),
    },
    coverageAudit: buildCoverageAudit(coverageRows, userId, partnerUserId),
    mySelections: mySelections.map((selection): Stage4SelectionDTO => ({
      proposalId: selection.proposalId,
      decision: selection.decision,
      note: selection.note,
      selectedAt: selection.selectedAt.toISOString(),
      updatedAt: selection.updatedAt.toISOString(),
    })),
    partnerSelections: revealPartnerSelections
      ? partnerSelections.map((selection): Stage4SelectionDTO => ({
          proposalId: selection.proposalId,
          decision: selection.decision,
          note: selection.note,
          selectedAt: selection.selectedAt.toISOString(),
          updatedAt: selection.updatedAt.toISOString(),
        }))
      : [],
    mySelectionStatus: mySelectionSubmitted ? 'SUBMITTED' : 'NOT_STARTED',
    partnerSelectionStatus: partnerSelectionSubmitted ? 'SUBMITTED' : 'NOT_STARTED',
    outcome: closure
      ? {
          kind: closure.kind,
          reason: closure.reason,
          summary: closure.summary,
          agreements: agreementsDTO.filter((agreement) =>
            closure.sharedAgreementIds.includes(agreement.id)
          ),
          individualCommitments: proposalCards.filter((proposal) => closedIndividualIds.has(proposal.id)),
          openNeeds: unaddressedNeeds.filter((need) => need.id && openNeedIds.has(need.id)),
          closedAt: closure.closedAt.toISOString(),
          checkInAt: closure.checkInAt ? closure.checkInAt.toISOString() : null,
        }
      : null,
    tendingPreview: buildTendingPreview(closure, tendingEntries),
  };
}
