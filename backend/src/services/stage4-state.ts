import {
  AgreementDTO,
  CoverageRowDTO,
  GetStage4StateResponse,
  ProposalCardDTO,
  Stage4NeedWalkthroughStatus,
  Stage4ProposalSourceLabel,
  Stage4QualityWarningDTO,
  Stage4CoverageAuditDTO,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4Phase,
  Stage4ProposalKind,
  Stage4SelectionDecision,
  Stage4SelectionDTO,
  Stage4ProposalStatus,
  Stage4WalkthroughDTO,
  Stage4WalkthroughPhase,
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
  source: string;
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

type Stage4WalkthroughStoredState = {
  phase?: Stage4WalkthroughPhase;
  currentNeedId?: string | null;
  coveredNeedIds?: string[];
  skippedNeedIds?: string[];
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

function getProposalSourceLabel(
  proposal: Stage4ProposalRow,
  userId: string,
  partnerUserId: string | null
): Stage4ProposalSourceLabel {
  if (proposal.createdByUserId === userId) return 'YOU';
  if (proposal.createdByUserId === partnerUserId) return 'PARTNER';
  if (proposal.source === 'AI_SUGGESTED') return 'AI';
  return 'UNKNOWN';
}

function getWalkthroughState(progressRows: Stage4ProgressRow[], userId: string): Stage4WalkthroughStoredState {
  const gates = progressRows.find((row) => row.userId === userId)?.gatesSatisfied;
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) return {};
  const value = (gates as Record<string, unknown>).stage4Walkthrough;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  return {
    phase:
      stored.phase === 'PARTNER_NEEDS' ||
      stored.phase === 'QUALITY_REVIEW' ||
      stored.phase === 'SUMMARY' ||
      stored.phase === 'MY_NEEDS'
        ? stored.phase
        : undefined,
    currentNeedId: typeof stored.currentNeedId === 'string' ? stored.currentNeedId : undefined,
    coveredNeedIds: Array.isArray(stored.coveredNeedIds)
      ? stored.coveredNeedIds.filter((id): id is string => typeof id === 'string')
      : [],
    skippedNeedIds: Array.isArray(stored.skippedNeedIds)
      ? stored.skippedNeedIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

function buildCoverageAudit(
  coverageRows: Stage4NeedCoverageRow[],
  userId: string,
  partnerUserId: string | null,
  declinedNeedIds: Set<string>
): Stage4CoverageAuditDTO {
  const rows = coverageRows.map((row): CoverageRowDTO => {
    const rowNeedId = row.needId ?? row.id;
    return {
      id: rowNeedId,
      label: row.needLabel,
      source: getSourceLabel(row.sourceUserId, userId, partnerUserId),
      coveringProposalIds: row.coveringProposalIds,
      note: row.note,
      userDeclinedToAddress: declinedNeedIds.has(rowNeedId),
    };
  });

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
  revealPartnerSelections: boolean,
  needLinks: Array<{ needId: string; needText: string }> = []
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
    sourceLabel: getProposalSourceLabel(proposal, userId, partnerUserId),
    ownerLabel:
      proposal.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT
        ? proposal.createdByUserId === userId
          ? 'You'
          : 'Partner'
        : undefined,
    needsAddressed:
      needLinks.length > 0
        ? needLinks.map((link) => {
            const coverage = linkedCoverage.find((row) => row.id === link.needId);
            return {
              id: link.needId,
              label: link.needText,
              coverage: coverage?.coverage ?? 'COVERED',
            };
          })
        : linkedCoverage.length > 0
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

function proposalMatchesNeed(proposal: ProposalCardDTO, needId: string, needLabel: string): boolean {
  const normalizedLabel = needLabel.toLowerCase();
  return proposal.needsAddressed.some((need) => {
    if (need.id && need.id === needId) return true;
    return need.label.toLowerCase() === normalizedLabel;
  });
}

function buildNeedStatus(args: {
  needId: string;
  phase: Stage4WalkthroughPhase;
  currentNeedId?: string | null;
  coveringProposalIds: string[];
  coveredIds: Set<string>;
  skippedIds: Set<string>;
}): Stage4NeedWalkthroughStatus {
  if (args.coveredIds.has(args.needId)) return 'covered';
  if (args.skippedIds.has(args.needId)) return 'skipped';
  if (args.currentNeedId === args.needId) return 'in_progress';
  if (args.coveringProposalIds.length === 0) return 'needs_options';
  return 'not_started';
}

function defaultCheckInDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString().slice(0, 10);
}

function buildQualityWarnings(proposals: ProposalCardDTO[]): Stage4QualityWarningDTO[] {
  const warnings: Stage4QualityWarningDTO[] = [];
  for (const proposal of proposals.filter((item) => item.myDecision === Stage4SelectionDecision.WILLING)) {
      const vague =
        !proposal.duration ||
        !proposal.measureOfSuccess ||
        /\b(communicate better|be better|try harder|more supportive|more present)\b/i.test(
          proposal.description
        );
      if (!vague) continue;
      warnings.push({
        proposalId: proposal.id,
        description: proposal.description,
        warning: 'This may be hard to check later. You can still continue for now.',
        suggestedRevision: 'Make it concrete: who does what, when, and how you will know it happened.',
      });
    }
  return warnings;
}

function buildWalkthrough(args: {
  coverageRows: Stage4NeedCoverageRow[];
  proposalCards: ProposalCardDTO[];
  userId: string;
  partnerUserId: string | null;
  stored: Stage4WalkthroughStoredState;
}): Stage4WalkthroughDTO {
  const coveredIds = new Set(args.stored.coveredNeedIds ?? []);
  const skippedIds = new Set(args.stored.skippedNeedIds ?? []);
  const toNeed = (row: Stage4NeedCoverageRow) => {
    const id = row.needId ?? row.id;
    return {
      id,
      label: row.needLabel,
      source: getSourceLabel(row.sourceUserId, args.userId, args.partnerUserId) as 'YOU' | 'PARTNER' | 'UNKNOWN',
      status: 'not_started' as Stage4NeedWalkthroughStatus,
      coveringProposalIds: row.coveringProposalIds,
    };
  };

  const ownRows = args.coverageRows
    .filter((row) => row.sourceUserId === args.userId)
    .map(toNeed);
  const partnerRows = args.coverageRows
    .filter((row) => row.sourceUserId !== args.userId)
    .map(toNeed);

  const ownRemaining = ownRows.find((need) => !coveredIds.has(need.id) && !skippedIds.has(need.id));
  const partnerRemaining = partnerRows.find((need) => !coveredIds.has(need.id) && !skippedIds.has(need.id));
  const phase =
    args.stored.phase ??
    (ownRemaining ? 'MY_NEEDS' : partnerRemaining ? 'PARTNER_NEEDS' : 'QUALITY_REVIEW');
  const phaseNeeds = phase === 'PARTNER_NEEDS' ? partnerRows : ownRows;
  const currentNeedId =
    args.stored.currentNeedId && phaseNeeds.some((need) => need.id === args.stored.currentNeedId)
      ? args.stored.currentNeedId
      : phase === 'MY_NEEDS'
        ? ownRemaining?.id
        : phase === 'PARTNER_NEEDS'
          ? partnerRemaining?.id
          : null;

  const ownNeeds = ownRows.map((need) => ({
    id: need.id,
    label: need.label,
    source: need.source,
    status: buildNeedStatus({
      needId: need.id,
      phase,
      currentNeedId,
      coveringProposalIds: need.coveringProposalIds,
      coveredIds,
      skippedIds,
    }),
  }));
  const partnerNeeds = partnerRows.map((need) => ({
    id: need.id,
    label: need.label,
    source: need.source,
    status: buildNeedStatus({
      needId: need.id,
      phase,
      currentNeedId,
      coveringProposalIds: need.coveringProposalIds,
      coveredIds,
      skippedIds,
    }),
  }));

  const currentNeed =
    phase === 'MY_NEEDS'
      ? ownNeeds.find((need) => need.id === currentNeedId) ?? null
      : phase === 'PARTNER_NEEDS'
        ? partnerNeeds.find((need) => need.id === currentNeedId) ?? null
        : null;
  const currentIndex = currentNeed
    ? Math.max(0, phaseNeeds.findIndex((need) => need.id === currentNeed.id))
    : 0;
  const currentLabel = currentNeed?.label ?? '';
  const proposalsForCurrent = currentNeed
    ? args.proposalCards.filter((proposal) =>
        proposalMatchesNeed(proposal, currentNeed.id, currentLabel)
      )
    : [];

  const group = (
    key: Stage4WalkthroughDTO['proposalGroups'][number]['key'],
    title: string,
    proposals: ProposalCardDTO[],
    readOnly = false
  ) => ({ key, title, proposals, readOnly });

  const proposalGroups =
    phase === 'PARTNER_NEEDS'
      ? [
          group(
            'partner_may_do',
            'Things your partner may do themselves',
            proposalsForCurrent.filter(
              (proposal) =>
                proposal.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT &&
                proposal.sourceLabel === 'PARTNER'
            ),
            true
          ),
          group(
            'shared_options',
            'Things you could do together',
            proposalsForCurrent.filter((proposal) => proposal.kind === Stage4ProposalKind.SHARED_PROPOSAL)
          ),
          group(
            'your_prior_suggestions',
            'Things you already suggested',
            proposalsForCurrent.filter((proposal) => proposal.sourceLabel === 'YOU')
          ),
        ]
      : [
          group(
            'you_suggested',
            'Options you suggested',
            proposalsForCurrent.filter((proposal) => proposal.sourceLabel === 'YOU')
          ),
          group(
            'partner_suggested',
            'Options your partner suggested',
            proposalsForCurrent.filter((proposal) => proposal.sourceLabel === 'PARTNER')
          ),
          group(
            'ai_suggested',
            'MWF ideas',
            proposalsForCurrent.filter((proposal) => proposal.sourceLabel === 'AI')
          ),
        ];

  return {
    phase,
    currentNeed,
    currentIndex,
    totalInPhase: phaseNeeds.length,
    ownNeeds,
    partnerNeeds,
    proposalGroups,
    qualityWarnings: buildQualityWarnings(args.proposalCards),
    defaultCheckInDate: defaultCheckInDate(),
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
    declinations,
    proposalNeedLinks,
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
    prisma.stage4NeedDeclination.findMany({
      where: { sessionId, userId },
      select: { needId: true },
    }) as Promise<{ needId: string }[]>,
    prisma.strategyProposalNeed.findMany({
      where: { proposal: { sessionId } },
      select: {
        proposalId: true,
        needId: true,
        need: { select: { need: true } },
      },
    }) as Promise<Array<{ proposalId: string; needId: string; need: { need: string } | null }>>,
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
  const linksByProposal = new Map<string, Array<{ needId: string; needText: string }>>();
  for (const link of proposalNeedLinks) {
    const text = link.need?.need;
    if (!text) continue;
    const arr = linksByProposal.get(link.proposalId) ?? [];
    arr.push({ needId: link.needId, needText: text });
    linksByProposal.set(link.proposalId, arr);
  }
  const proposalCards = activeProposals.map((proposal) =>
    buildProposalCard(
      proposal,
      userId,
      partnerUserId,
      selections,
      coverageRows,
      revealPartnerSelections,
      linksByProposal.get(proposal.id) ?? []
    )
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
    walkthrough: buildWalkthrough({
      coverageRows,
      proposalCards,
      userId,
      partnerUserId,
      stored: getWalkthroughState(progressRows ?? [], userId),
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
    coverageAudit: buildCoverageAudit(
      coverageRows,
      userId,
      partnerUserId,
      new Set(declinations.map((d) => d.needId))
    ),
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
