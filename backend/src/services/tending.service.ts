import { Prisma } from '@prisma/client';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingCheckinDTO,
  TendingCheckinEntryOutcomeInput,
  TendingCheckinNeedOutcomeInput,
  TendingCheckinOrientations,
  TendingCoordinationCycleDTO,
  TendingCoordinationStatus,
  TendingEntryDTO,
  TendingEntryOutcomeDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
  TendingFollowThroughStatus,
  TendingHelpfulnessStatus,
  TendingNeedOutcomeDTO,
  TendingNeedResolutionStatus,
  TendingNextAction,
  TendingReminderDTO,
  TendingReminderInput,
  TendingReminderScope,
  TendingResponseDTO,
} from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { publishSessionEvent } from './realtime';

type Tx = Prisma.TransactionClient;

type AgreementForScheduling = {
  id: string;
  description: string;
  followUpDate: Date | null;
};

type TendingEntryWithResponses = {
  id: string;
  sessionId: string;
  agreementId: string | null;
  type: TendingEntryType;
  scope: TendingEntryScope;
  ownerUserId: string | null;
  optedInShared: boolean;
  status: TendingEntryStatus;
  scheduledFor: Date | null;
  openedAt: Date | null;
  completedAt: Date | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  responses: Array<{
    id: string;
    tendingEntryId: string;
    userId: string;
    checkinId: string | null;
    status: string;
    reflection: string | null;
    continueChoice: ContinueChoice | null;
    submittedAt: Date;
  }>;
  entryOutcomes?: Array<{
    id: string;
    checkinId: string;
    tendingEntryId: string;
    responseId: string | null;
    userId: string;
    followThroughStatus: any;
    helpfulnessStatus: any | null;
    blockerCategories: any[];
    whatHappened: string | null;
    helpedNeed: string | null;
    blockerNote: string | null;
    stillWorthTrying: boolean | null;
    createdAt: Date;
  }>;
  reminders?: Array<{
    id: string;
    sessionId: string;
    checkinId: string | null;
    tendingEntryId: string | null;
    userId: string;
    scope: any;
    remindAt: Date;
    cadence: string | null;
    note: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export class TendingNotFoundError extends Error {
  constructor() {
    super('Tending entry not found');
    this.name = 'TendingNotFoundError';
  }
}

export class TendingForbiddenError extends Error {
  constructor() {
    super('User is not a member of this session');
    this.name = 'TendingForbiddenError';
  }
}

export class TendingInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TendingInvalidStateError';
  }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toResponseDTO(response: TendingEntryWithResponses['responses'][number]): TendingResponseDTO {
  return {
    id: response.id,
    tendingEntryId: response.tendingEntryId,
    userId: response.userId,
    checkinId: response.checkinId ?? null,
    status: response.status,
    reflection: response.reflection,
    continueChoice: response.continueChoice,
    submittedAt: response.submittedAt.toISOString(),
  };
}

function toEntryOutcomeDTO(outcome: NonNullable<TendingEntryWithResponses['entryOutcomes']>[number]): TendingEntryOutcomeDTO {
  return {
    id: outcome.id,
    checkinId: outcome.checkinId,
    tendingEntryId: outcome.tendingEntryId,
    responseId: outcome.responseId,
    userId: outcome.userId,
    followThroughStatus: outcome.followThroughStatus,
    helpfulnessStatus: outcome.helpfulnessStatus,
    blockerCategories: outcome.blockerCategories,
    whatHappened: outcome.whatHappened,
    helpedNeed: outcome.helpedNeed,
    blockerNote: outcome.blockerNote,
    stillWorthTrying: outcome.stillWorthTrying,
    createdAt: outcome.createdAt.toISOString(),
  };
}

function toReminderDTO(reminder: NonNullable<TendingEntryWithResponses['reminders']>[number]): TendingReminderDTO {
  return {
    id: reminder.id,
    sessionId: reminder.sessionId,
    checkinId: reminder.checkinId,
    tendingEntryId: reminder.tendingEntryId,
    userId: reminder.userId,
    scope: reminder.scope as TendingReminderScope,
    remindAt: reminder.remindAt.toISOString(),
    cadence: reminder.cadence,
    note: reminder.note,
    status: reminder.status,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

function toEntryDTO(entry: TendingEntryWithResponses, userId: string): TendingEntryDTO {
  const myResponse = entry.responses.find((response) => response.userId === userId) ?? null;
  const latestOutcome = (entry.entryOutcomes ?? [])
    .filter((outcome) => outcome.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

  return {
    id: entry.id,
    sessionId: entry.sessionId,
    agreementId: entry.agreementId,
    type: entry.type,
    scope: entry.scope,
    ownerUserId: entry.ownerUserId,
    optedInShared: entry.optedInShared,
    status: entry.status,
    scheduledFor: iso(entry.scheduledFor),
    openedAt: iso(entry.openedAt),
    completedAt: iso(entry.completedAt),
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    myResponse: myResponse ? toResponseDTO(myResponse) : null,
    responseCount: entry.responses.length,
    latestOutcome: latestOutcome ? toEntryOutcomeDTO(latestOutcome) : null,
    reminders: (entry.reminders ?? [])
      .filter((reminder) => reminder.userId === userId || reminder.scope === TendingReminderScope.SHARED)
      .map(toReminderDTO),
  };
}

async function assertSessionMember(sessionId: string, userId: string) {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      relationship: { members: { some: { userId } } },
    },
    include: {
      relationship: {
        include: {
          members: { select: { userId: true } },
        },
      },
    },
  });

  if (!session) throw new TendingNotFoundError();
  return session;
}

function buildScheduledSummary(agreement: AgreementForScheduling): string {
  return `Check in on the shared agreement: ${agreement.description}`;
}

export async function scheduleSharedAgreementTendingEntries(
  tx: Tx,
  sessionId: string,
  agreements: AgreementForScheduling[],
  now = new Date()
): Promise<string[]> {
  const createdIds: string[] = [];

  for (const agreement of agreements) {
    if (!agreement.followUpDate) continue;

    const entry = await tx.tendingEntry.create({
      data: {
        sessionId,
        agreementId: agreement.id,
        type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
        scope: TendingEntryScope.SHARED,
        status:
          agreement.followUpDate <= now
            ? TendingEntryStatus.OPEN
            : TendingEntryStatus.SCHEDULED,
        scheduledFor: agreement.followUpDate,
        openedAt: agreement.followUpDate <= now ? now : null,
        summary: buildScheduledSummary(agreement),
      },
    });
    createdIds.push(entry.id);
  }

  return createdIds;
}

type IndividualCommitmentForScheduling = {
  proposalId: string;
  ownerUserId: string;
  description: string;
};

function buildIndividualCommitmentSummary(commitment: IndividualCommitmentForScheduling): string {
  return `Check in on your individual commitment: ${commitment.description}`;
}

export async function scheduleIndividualCommitmentTendingEntries(
  tx: Tx,
  sessionId: string,
  commitments: IndividualCommitmentForScheduling[],
  scheduledFor: Date,
  now = new Date()
): Promise<string[]> {
  const createdIds: string[] = [];
  for (const commitment of commitments) {
    const isDue = scheduledFor <= now;
    const entry = await tx.tendingEntry.create({
      data: {
        sessionId,
        type: TendingEntryType.SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN,
        scope: TendingEntryScope.INDIVIDUAL,
        ownerUserId: commitment.ownerUserId,
        optedInShared: false,
        status: isDue ? TendingEntryStatus.OPEN : TendingEntryStatus.SCHEDULED,
        scheduledFor,
        openedAt: isDue ? now : null,
        summary: buildIndividualCommitmentSummary(commitment),
      },
    });
    createdIds.push(entry.id);
  }
  return createdIds;
}

export async function listTendingEntries(sessionId: string, userId: string): Promise<TendingEntryDTO[]> {
  await assertSessionMember(sessionId, userId);

  const entries = (await prisma.tendingEntry.findMany({
    where: {
      sessionId,
      OR: [
        { scope: TendingEntryScope.SHARED },
        { scope: TendingEntryScope.INDIVIDUAL, ownerUserId: userId },
        { scope: TendingEntryScope.INDIVIDUAL, optedInShared: true },
      ],
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    include: { responses: true, entryOutcomes: true, reminders: true },
  })) as TendingEntryWithResponses[];

  return entries.map((entry) => toEntryDTO(entry, userId));
}

export async function setIndividualEntryShare(args: {
  entryId: string;
  userId: string;
  optedInShared: boolean;
}): Promise<TendingEntryDTO> {
  const entry = await getEntryForUser(args.entryId, args.userId);
  if (entry.scope !== TendingEntryScope.INDIVIDUAL) {
    throw new TendingInvalidStateError('Only INDIVIDUAL entries can be shared');
  }
  if (entry.ownerUserId !== args.userId) {
    throw new TendingForbiddenError();
  }

  await prisma.tendingEntry.update({
    where: { id: args.entryId },
    data: { optedInShared: args.optedInShared },
  });

  try {
    await publishSessionEvent(entry.sessionId, 'notification.pending_action', {
      kind: args.optedInShared ? 'tending_entry_shared' : 'tending_entry_unshared',
      tendingEntryId: args.entryId,
      ownerUserId: args.userId,
    }, args.userId);
  } catch (error) {
    logger.warn('[tending] Failed to publish share-toggle event', { entryId: args.entryId, error });
  }

  const updated = await getEntryForUser(args.entryId, args.userId);
  return toEntryDTO(updated, args.userId);
}

async function getEntryForUser(entryId: string, userId: string) {
  const entry = (await prisma.tendingEntry.findFirst({
    where: {
      id: entryId,
      session: { relationship: { members: { some: { userId } } } },
    },
    include: {
      responses: true,
      session: {
        include: {
          relationship: {
            include: {
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  })) as (TendingEntryWithResponses & {
    session: { relationship: { members: Array<{ userId: string }> } };
  }) | null;

  if (!entry) throw new TendingNotFoundError();
  return entry;
}

export async function submitTendingResponse(args: {
  entryId: string;
  userId: string;
  status: string;
  reflection?: string;
  continueChoice?: ContinueChoice;
}): Promise<TendingEntryDTO> {
  const entry = await getEntryForUser(args.entryId, args.userId);
  if (entry.scope === TendingEntryScope.INDIVIDUAL && entry.ownerUserId !== args.userId) {
    throw new TendingForbiddenError();
  }
  if (entry.status === TendingEntryStatus.SCHEDULED) {
    throw new TendingInvalidStateError('Tending entry is not open yet');
  }
  if (entry.status === TendingEntryStatus.CANCELLED || entry.status === TendingEntryStatus.EXPIRED) {
    throw new TendingInvalidStateError('Tending entry is no longer accepting responses');
  }

  const now = new Date();
  const memberCount = entry.scope === TendingEntryScope.INDIVIDUAL
    ? 1
    : entry.session.relationship.members.length;
  await prisma.$transaction(async (tx) => {
    await tx.tendingResponse.upsert({
      where: {
        tendingEntryId_userId: {
          tendingEntryId: args.entryId,
          userId: args.userId,
        },
      },
      create: {
        tendingEntryId: args.entryId,
        userId: args.userId,
        status: args.status,
        reflection: args.reflection,
        continueChoice: args.continueChoice,
        submittedAt: now,
      },
      update: {
        status: args.status,
        reflection: args.reflection,
        continueChoice: args.continueChoice,
        submittedAt: now,
      },
    });

    const responseCount = await tx.tendingResponse.count({
      where: { tendingEntryId: args.entryId },
    });

    await tx.tendingEntry.update({
      where: { id: args.entryId },
      data: {
        status:
          responseCount >= memberCount
            ? TendingEntryStatus.COMPLETED
            : TendingEntryStatus.PARTIAL,
        completedAt: responseCount >= memberCount ? now : null,
      },
    });
  });

  await publishSessionEvent(entry.sessionId, 'notification.pending_action', {
    kind: 'tending_response_submitted',
    tendingEntryId: args.entryId,
    submittedBy: args.userId,
  }, args.userId);

  const updated = await getEntryForUser(args.entryId, args.userId);
  return toEntryDTO(updated, args.userId);
}

async function buildReentrySummary(sessionId: string, userId: string, intent?: string): Promise<string> {
  const [closure, sharedVessel, openNeeds] = await Promise.all([
    prisma.stage4Closure.findUnique({ where: { sessionId } }),
    prisma.sharedVessel.findUnique({
      where: { sessionId },
      include: {
        agreements: {
          where: { status: 'AGREED' },
          orderBy: { agreedAt: 'desc' },
        },
      },
    }),
    prisma.stage4NeedCoverage.findMany({
      where: { sessionId, coverageStatus: { in: ['OPEN', 'PARTIAL'] } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const individualIds = closure?.individualProposalIds ?? [];
  const commitments = individualIds.length > 0
    ? await prisma.strategyProposal.findMany({
        where: { id: { in: individualIds } },
        orderBy: { updatedAt: 'desc' },
      })
    : [];

  const lines = [
    'Passive Tending re-entry context.',
    closure ? `Stage 4 closed as ${closure.kind}: ${closure.summary}` : null,
    intent ? `User intent: ${intent}` : null,
    sharedVessel?.agreements.length
      ? `Shared agreements: ${sharedVessel.agreements.map((agreement) => agreement.description).join('; ')}`
      : null,
    commitments.length
      ? `Individual commitments: ${commitments.map((proposal) => proposal.description).join('; ')}`
      : null,
    openNeeds.length
      ? `Still-open needs: ${openNeeds.map((need) => need.needLabel).join('; ')}`
      : null,
  ];

  return lines.filter(Boolean).join('\n');
}

export async function createPassiveReentry(args: {
  sessionId: string;
  userId: string;
  intent?: string;
}): Promise<TendingEntryDTO> {
  const session = await assertSessionMember(args.sessionId, args.userId);
  if (session.status !== 'RESOLVED') {
    throw new TendingInvalidStateError('Passive Tending re-entry requires a resolved session');
  }

  const now = new Date();
  const summary = await buildReentrySummary(args.sessionId, args.userId, args.intent);
  const entry = (await prisma.tendingEntry.create({
    data: {
      sessionId: args.sessionId,
      type: TendingEntryType.USER_INITIATED_REENTRY,
      status: TendingEntryStatus.OPEN,
      openedAt: now,
      summary,
    },
    include: { responses: true, entryOutcomes: true, reminders: true },
  })) as TendingEntryWithResponses;

  return toEntryDTO(entry, args.userId);
}

export async function publishPartnerInvolvingReentryChoice(args: {
  sessionId: string;
  userId: string;
  tendingEntryId: string;
}): Promise<void> {
  await publishSessionEvent(args.sessionId, 'notification.pending_action', {
    kind: 'tending_reentry_partner_action_requested',
    tendingEntryId: args.tendingEntryId,
    createdBy: args.userId,
  }, args.userId);
}

/**
 * Stage 4 Phase 5 — submit the structured three-orientation check-in covering all
 * currently-open Tending entries on a session in one shot. Returns the affected entries
 * and metadata about the chosen forward path.
 *
 * Scope decision (documented in PR): partial-closure resolutions target TendingEntry
 * rather than Agreement so individual commitments can be partially closed too.
 */
const DEFAULT_EXTENSION_DAYS = 28;
const DEFAULT_SHARED_RESPONSE_DEADLINE_DAYS = 14;

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export type SubmitTendingCheckinResult = {
  entries: TendingEntryDTO[];
  checkin?: TendingCheckinDTO;
  coordinationCycle?: TendingCoordinationCycleDTO;
  newSessionId?: string;
  continueChoice: ContinueChoice;
  nextScheduledFor?: Date | null;
};

function toCoordinationCycleDTO(cycle: {
  id: string;
  sessionId: string;
  status: any;
  entryIds: string[];
  participantUserIds: string[];
  submittedUserIds: string[];
  responseDeadlineAt: Date;
  resolvedAt: Date | null;
  resultSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TendingCoordinationCycleDTO {
  return {
    id: cycle.id,
    sessionId: cycle.sessionId,
    status: cycle.status as TendingCoordinationStatus,
    entryIds: cycle.entryIds,
    participantUserIds: cycle.participantUserIds,
    submittedUserIds: cycle.submittedUserIds,
    responseDeadlineAt: cycle.responseDeadlineAt.toISOString(),
    resolvedAt: iso(cycle.resolvedAt),
    resultSummary: cycle.resultSummary,
    createdAt: cycle.createdAt.toISOString(),
    updatedAt: cycle.updatedAt.toISOString(),
  };
}

function nextActionFromChoice(choice: ContinueChoice): TendingNextAction {
  switch (choice) {
    case ContinueChoice.FULL_CLOSURE:
      return TendingNextAction.FULL_CLOSURE;
    case ContinueChoice.EXTEND:
      return TendingNextAction.EXTEND;
    case ContinueChoice.NEW_PROCESS:
      return TendingNextAction.NEW_PROCESS;
    case ContinueChoice.PARTIAL_CLOSURE:
      return TendingNextAction.PARTIAL_CLOSURE;
    case ContinueChoice.ANOTHER_ROUND:
      return TendingNextAction.REOPEN_STRATEGY_WORK;
  }
}

export function recommendTendingNextAction(args: {
  continueChoice: ContinueChoice;
  entryOutcomes?: TendingCheckinEntryOutcomeInput[];
  needOutcomes?: TendingCheckinNeedOutcomeInput[];
}): TendingNextAction {
  const hasStillOpenNeed = (args.needOutcomes ?? []).some((outcome) =>
    outcome.resolutionStatus === TendingNeedResolutionStatus.STILL_OPEN ||
    outcome.resolutionStatus === TendingNeedResolutionStatus.CHANGED
  );
  const hasWeakFollowThrough = (args.entryOutcomes ?? []).some((outcome) =>
    outcome.followThroughStatus === TendingFollowThroughStatus.DID_NOT_HAPPEN ||
    outcome.helpfulnessStatus === TendingHelpfulnessStatus.DID_NOT_HELP ||
    outcome.stillWorthTrying === false
  );
  const hasPartialFollowThrough = (args.entryOutcomes ?? []).some((outcome) =>
    outcome.followThroughStatus === TendingFollowThroughStatus.PARTLY_HAPPENED ||
    outcome.helpfulnessStatus === TendingHelpfulnessStatus.PARTLY_HELPED ||
    (outcome.blockerCategories?.length ?? 0) > 0
  );
  const hasOnlyResolvedNeeds =
    (args.needOutcomes?.length ?? 0) > 0 &&
    args.needOutcomes!.every((outcome) => outcome.resolutionStatus === TendingNeedResolutionStatus.RESOLVED);

  if (hasStillOpenNeed && hasWeakFollowThrough) {
    return TendingNextAction.REOPEN_STRATEGY_WORK;
  }
  if (hasStillOpenNeed || hasPartialFollowThrough) {
    return TendingNextAction.ADJUST_COMMITMENT;
  }
  if (hasOnlyResolvedNeeds && args.continueChoice === ContinueChoice.FULL_CLOSURE) {
    return TendingNextAction.FULL_CLOSURE;
  }
  return nextActionFromChoice(args.continueChoice);
}

function buildEntryReflection(args: {
  baseReflection: string;
  entryId: string;
  whatWorkedNote?: string;
  supportNote?: string;
  outcome?: TendingCheckinEntryOutcomeInput;
}): string | null {
  const lines = [
    args.baseReflection || null,
    args.whatWorkedNote ? `Entry note - what worked: ${args.whatWorkedNote}` : null,
    args.supportNote ? `Entry note - more support: ${args.supportNote}` : null,
    args.outcome?.whatHappened ? `What actually happened: ${args.outcome.whatHappened}` : null,
    args.outcome?.helpedNeed ? `Need impact: ${args.outcome.helpedNeed}` : null,
    args.outcome?.blockerNote ? `Blocker: ${args.outcome.blockerNote}` : null,
    args.outcome?.note ? `Entry note: ${args.outcome.note}` : null,
  ];

  return lines.filter(Boolean).join('\n') || null;
}

function toNeedOutcomeDTO(outcome: {
  id: string;
  checkinId: string;
  sessionId: string;
  needId: string | null;
  needLabel: string;
  sourceUserId: string | null;
  resolutionStatus: any;
  note: string | null;
  changedNeedLabel: string | null;
  nextAction: any;
  createdAt: Date;
}): TendingNeedOutcomeDTO {
  return {
    id: outcome.id,
    checkinId: outcome.checkinId,
    sessionId: outcome.sessionId,
    needId: outcome.needId,
    needLabel: outcome.needLabel,
    sourceUserId: outcome.sourceUserId,
    resolutionStatus: outcome.resolutionStatus,
    note: outcome.note,
    changedNeedLabel: outcome.changedNeedLabel,
    nextAction: outcome.nextAction as TendingNextAction | null,
    createdAt: outcome.createdAt.toISOString(),
  };
}

function buildNewProcessHandoffSummary(args: {
  reflection: string;
  entryOutcomes?: TendingCheckinEntryOutcomeInput[];
  needOutcomes?: TendingCheckinNeedOutcomeInput[];
}): string {
  const lines = [
    'Prior Tending handoff for linked new process.',
    args.reflection || null,
  ];

  for (const outcome of args.entryOutcomes ?? []) {
    lines.push([
      `Entry ${outcome.tendingEntryId}: ${outcome.followThroughStatus}`,
      outcome.helpfulnessStatus ? `helpfulness=${outcome.helpfulnessStatus}` : null,
      outcome.blockerCategories?.length ? `blockers=${outcome.blockerCategories.join(', ')}` : null,
      outcome.whatHappened ? `what happened=${outcome.whatHappened}` : null,
      outcome.helpedNeed ? `need impact=${outcome.helpedNeed}` : null,
    ].filter(Boolean).join('; '));
  }

  for (const outcome of args.needOutcomes ?? []) {
    lines.push([
      `Need "${outcome.needLabel}": ${outcome.resolutionStatus}`,
      outcome.changedNeedLabel ? `changed to "${outcome.changedNeedLabel}"` : null,
      outcome.note ? `note=${outcome.note}` : null,
    ].filter(Boolean).join('; '));
  }

  return lines.filter(Boolean).join('\n');
}

export async function submitTendingCheckin(args: {
  sessionId: string;
  userId: string;
  orientations: TendingCheckinOrientations;
  entryOutcomes?: TendingCheckinEntryOutcomeInput[];
  needOutcomes?: TendingCheckinNeedOutcomeInput[];
  reminders?: TendingReminderInput[];
  nextAction?: TendingNextAction;
  resolvedEnoughOverride?: boolean;
  resolvedEnoughOverrideNote?: string;
  now?: Date;
}): Promise<SubmitTendingCheckinResult> {
  const now = args.now ?? new Date();
  const session = await assertSessionMember(args.sessionId, args.userId);

  const openEntries = (await prisma.tendingEntry.findMany({
    where: {
      sessionId: args.sessionId,
      status: { in: [TendingEntryStatus.OPEN, TendingEntryStatus.PARTIAL] },
      OR: [
        { scope: TendingEntryScope.SHARED },
        { scope: TendingEntryScope.INDIVIDUAL, ownerUserId: args.userId },
      ],
    },
    include: { responses: true, entryOutcomes: true, reminders: true },
  })) as TendingEntryWithResponses[];

  if (openEntries.length === 0) {
    throw new TendingInvalidStateError('No open Tending entries to check in on');
  }

  const choice = args.orientations.whatComesNext.continueChoice;
  const nextAction = args.nextAction
    ?? args.orientations.whatComesNext.nextAction
    ?? recommendTendingNextAction({
      continueChoice: choice,
      entryOutcomes: args.entryOutcomes,
      needOutcomes: args.needOutcomes,
    });
  const entryOutcomeByEntryId = new Map(
    (args.entryOutcomes ?? []).map((outcome) => [outcome.tendingEntryId, outcome])
  );
  const openEntryIds = new Set(openEntries.map((entry) => entry.id));
  const sharedEntries = openEntries.filter((entry) => entry.scope === TendingEntryScope.SHARED);
  const hasSharedEntry = sharedEntries.length > 0;
  const sharedEntryIds = sharedEntries.map((entry) => entry.id).sort();
  const participantUserIds = session.relationship.members.map((member) => member.userId).sort();
  for (const outcome of args.entryOutcomes ?? []) {
    if (!openEntryIds.has(outcome.tendingEntryId)) {
      throw new TendingInvalidStateError('Entry outcome references a non-open Tending entry');
    }
  }
  for (const reminder of [
    ...(args.reminders ?? []),
    ...(args.orientations.whatComesNext.reminders ?? []),
  ]) {
    if (reminder.tendingEntryId && !openEntryIds.has(reminder.tendingEntryId)) {
      throw new TendingInvalidStateError('Reminder references a non-open Tending entry');
    }
    if (reminder.scope === TendingReminderScope.SHARED) {
      const linkedEntry = reminder.tendingEntryId
        ? openEntries.find((entry) => entry.id === reminder.tendingEntryId)
        : null;
      if (!linkedEntry || linkedEntry.scope !== TendingEntryScope.SHARED) {
        throw new TendingInvalidStateError('Shared reminders require a shared Tending entry');
      }
    }
  }
  if (choice === ContinueChoice.FULL_CLOSURE && !args.resolvedEnoughOverride) {
    const unresolvedNeeds = (args.needOutcomes ?? []).filter(
      (outcome) => outcome.resolutionStatus !== TendingNeedResolutionStatus.RESOLVED
    );
    if (unresolvedNeeds.length > 0) {
      throw new TendingInvalidStateError(
        'Full closure requires submitted needs to be resolved or an explicit resolved-enough override'
      );
    }
  }
  const reflection = [
    args.orientations.whatWorked.reflection
      ? `What worked: ${args.orientations.whatWorked.reflection}`
      : null,
    args.orientations.whereMoreSupport.reflection
      ? `Where more support: ${args.orientations.whereMoreSupport.reflection}`
      : null,
    args.resolvedEnoughOverride
      ? `Resolved-enough override: ${args.resolvedEnoughOverrideNote ?? 'User explicitly chose to proceed.'}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  let nextScheduledFor: Date | null = null;
  let newSessionId: string | undefined;
  let checkinDTO: TendingCheckinDTO | undefined;
  let coordinationCycleDTO: TendingCoordinationCycleDTO | undefined;

  await prisma.$transaction(async (tx) => {
    let coordinationCycle: {
      id: string;
      sessionId: string;
      status: any;
      entryIds: string[];
      participantUserIds: string[];
      submittedUserIds: string[];
      responseDeadlineAt: Date;
      resolvedAt: Date | null;
      resultSummary: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;

    if (hasSharedEntry) {
      const existingCycle = await tx.tendingCoordinationCycle.findFirst({
        where: {
          sessionId: args.sessionId,
          status: { in: [TendingCoordinationStatus.WAITING_FOR_PARTNER, TendingCoordinationStatus.READY_TO_RESOLVE] },
          entryIds: { hasEvery: sharedEntryIds },
        },
        orderBy: { createdAt: 'desc' },
      });
      const submittedUserIds = Array.from(new Set([
        ...((existingCycle?.submittedUserIds as string[] | undefined) ?? []),
        args.userId,
      ])).sort();
      const allSubmitted = participantUserIds.every((id) => submittedUserIds.includes(id));

      if (existingCycle) {
        coordinationCycle = await tx.tendingCoordinationCycle.update({
          where: { id: existingCycle.id },
          data: {
            submittedUserIds,
            status: allSubmitted
              ? TendingCoordinationStatus.READY_TO_RESOLVE
              : TendingCoordinationStatus.WAITING_FOR_PARTNER,
            resultSummary: allSubmitted
              ? 'All participants have submitted; shared Tending choices are ready for coordinated resolution.'
              : 'Shared Tending choices are being held privately until the partner submits or the response window expires.',
          },
        });
      } else {
        coordinationCycle = await tx.tendingCoordinationCycle.create({
          data: {
            sessionId: args.sessionId,
            createdByUserId: args.userId,
            status: allSubmitted
              ? TendingCoordinationStatus.READY_TO_RESOLVE
              : TendingCoordinationStatus.WAITING_FOR_PARTNER,
            entryIds: sharedEntryIds,
            participantUserIds,
            submittedUserIds,
            responseDeadlineAt: addDays(now, DEFAULT_SHARED_RESPONSE_DEADLINE_DAYS),
            resultSummary: 'Shared Tending choices are being held privately until the partner submits or the response window expires.',
          },
        });
      }
      coordinationCycleDTO = toCoordinationCycleDTO(coordinationCycle);
    }

    const createdCheckin = await tx.tendingCheckin.create({
      data: {
        sessionId: args.sessionId,
        userId: args.userId,
        coordinationCycleId: coordinationCycle?.id,
        nextAction,
        continueChoice: choice,
        reflectionSummary: reflection || null,
        submittedAt: now,
      },
    });

    // 1) Persist a TendingResponse for each open entry that the user can respond to.
    const responseIds: Record<string, string> = {};
    for (const entry of openEntries) {
      if (entry.scope === TendingEntryScope.INDIVIDUAL && entry.ownerUserId !== args.userId) {
        continue;
      }
      const entryOutcome = entryOutcomeByEntryId.get(entry.id);
      const upserted = await tx.tendingResponse.upsert({
        where: {
          tendingEntryId_userId: {
            tendingEntryId: entry.id,
            userId: args.userId,
          },
        },
        create: {
          tendingEntryId: entry.id,
          userId: args.userId,
          checkinId: createdCheckin.id,
          status: 'CHECKIN',
          reflection: buildEntryReflection({
            baseReflection: reflection,
            entryId: entry.id,
            whatWorkedNote: args.orientations.whatWorked.perEntryNotes?.[entry.id],
            supportNote: args.orientations.whereMoreSupport.perEntryNotes?.[entry.id],
            outcome: entryOutcome,
          }),
          continueChoice: choice,
          submittedAt: now,
        },
        update: {
          checkinId: createdCheckin.id,
          status: 'CHECKIN',
          reflection: buildEntryReflection({
            baseReflection: reflection,
            entryId: entry.id,
            whatWorkedNote: args.orientations.whatWorked.perEntryNotes?.[entry.id],
            supportNote: args.orientations.whereMoreSupport.perEntryNotes?.[entry.id],
            outcome: entryOutcome,
          }),
          continueChoice: choice,
          submittedAt: now,
        },
      });
      responseIds[entry.id] = upserted.id;

      if (entryOutcome) {
        await tx.tendingEntryOutcome.upsert({
          where: {
            checkinId_tendingEntryId: {
              checkinId: createdCheckin.id,
              tendingEntryId: entry.id,
            },
          },
          create: {
            checkinId: createdCheckin.id,
            tendingEntryId: entry.id,
            responseId: upserted.id,
            userId: args.userId,
            followThroughStatus: entryOutcome.followThroughStatus,
            helpfulnessStatus: entryOutcome.helpfulnessStatus,
            blockerCategories: entryOutcome.blockerCategories ?? [],
            whatHappened: entryOutcome.whatHappened,
            helpedNeed: entryOutcome.helpedNeed,
            blockerNote: entryOutcome.blockerNote ?? entryOutcome.note,
            stillWorthTrying: entryOutcome.stillWorthTrying,
          },
          update: {
            responseId: upserted.id,
            followThroughStatus: entryOutcome.followThroughStatus,
            helpfulnessStatus: entryOutcome.helpfulnessStatus,
            blockerCategories: entryOutcome.blockerCategories ?? [],
            whatHappened: entryOutcome.whatHappened,
            helpedNeed: entryOutcome.helpedNeed,
            blockerNote: entryOutcome.blockerNote ?? entryOutcome.note,
            stillWorthTrying: entryOutcome.stillWorthTrying,
          },
        });
      }
    }

    const createdNeedOutcomes = [];
    for (const needOutcome of args.needOutcomes ?? []) {
      createdNeedOutcomes.push(await tx.tendingNeedOutcome.create({
        data: {
          checkinId: createdCheckin.id,
          sessionId: args.sessionId,
          needId: needOutcome.needId,
          needLabel: needOutcome.needLabel,
          sourceUserId: needOutcome.sourceUserId,
          resolutionStatus: needOutcome.resolutionStatus,
          note: needOutcome.note,
          changedNeedLabel: needOutcome.changedNeedLabel,
          nextAction: needOutcome.nextAction,
        },
      }));
    }

    const reminderInputs = [
      ...(args.reminders ?? []),
      ...(args.orientations.whatComesNext.reminders ?? []),
    ];
    const createdReminders = [];
    for (const reminder of reminderInputs) {
      createdReminders.push(await tx.tendingReminder.create({
        data: {
          sessionId: args.sessionId,
          checkinId: createdCheckin.id,
          tendingEntryId: reminder.tendingEntryId,
          userId: args.userId,
          scope: reminder.scope,
          remindAt: new Date(reminder.remindAt),
          cadence: reminder.cadence,
          note: reminder.note,
        },
      }));
    }

    checkinDTO = {
      id: createdCheckin.id,
      sessionId: createdCheckin.sessionId,
      userId: createdCheckin.userId,
      coordinationCycleId: createdCheckin.coordinationCycleId ?? null,
      nextAction: createdCheckin.nextAction as TendingNextAction | null,
      continueChoice: createdCheckin.continueChoice as ContinueChoice | null,
      reflectionSummary: createdCheckin.reflectionSummary,
      submittedAt: createdCheckin.submittedAt.toISOString(),
      createdAt: createdCheckin.createdAt.toISOString(),
      needOutcomes: createdNeedOutcomes.map(toNeedOutcomeDTO),
      reminders: createdReminders.map(toReminderDTO),
    };

    if (hasSharedEntry) {
      for (const entry of sharedEntries) {
        await tx.tendingEntry.update({
          where: { id: entry.id },
          data: { status: TendingEntryStatus.PARTIAL },
        });
      }
    }

    const entriesToTransition = hasSharedEntry
      ? openEntries.filter((entry) => entry.scope === TendingEntryScope.INDIVIDUAL)
      : openEntries;

    // 2) Apply path-specific state transitions. Shared entries are held for the
    // coordination resolver; individual entries still advance immediately.
    switch (choice) {
      case ContinueChoice.ANOTHER_ROUND: {
        if (entriesToTransition.length === 0) break;
        // Reopen Stage 4 strategy work. Keep coverage/declination history as
        // context; clear only terminal closure/selection gates that block a new
        // Stage 4 pass.
        const stillOpenNeedIds = (args.needOutcomes ?? [])
          .filter((outcome) =>
            outcome.resolutionStatus === TendingNeedResolutionStatus.STILL_OPEN ||
            outcome.resolutionStatus === TendingNeedResolutionStatus.CHANGED ||
            outcome.resolutionStatus === TendingNeedResolutionStatus.NOT_SURE
          )
          .map((outcome) => outcome.needId)
          .filter((needId): needId is string => Boolean(needId));
        await tx.stage4Closure.deleteMany({ where: { sessionId: args.sessionId } });
        await tx.stage4ProposalSelection.deleteMany({ where: { sessionId: args.sessionId } });
        // Clear selectionSubmitted gates on every member's stage-4 progress.
        const progress = await tx.stageProgress.findMany({
          where: { sessionId: args.sessionId, stage: 4 },
        });
        for (const row of progress) {
          const gates = (row.gatesSatisfied as Record<string, unknown> | null) ?? {};
          delete gates.selectionSubmitted;
          gates.tendingReopen = {
            checkinId: createdCheckin.id,
            stillOpenNeedIds,
            reopenedAt: now.toISOString(),
          };
          await tx.stageProgress.update({
            where: { id: row.id },
            data: { gatesSatisfied: gates as Prisma.InputJsonValue },
          });
        }
        // Close out current Tending entries so a fresh inventory cycle can run.
        for (const entry of entriesToTransition) {
          await tx.tendingEntry.update({
            where: { id: entry.id },
            data: { status: TendingEntryStatus.COMPLETED, completedAt: now },
          });
        }
        await tx.session.update({
          where: { id: args.sessionId },
          data: { status: 'ACTIVE' },
        });
        break;
      }
      case ContinueChoice.EXTEND: {
        if (entriesToTransition.length === 0) break;
        nextScheduledFor = addDays(now, DEFAULT_EXTENSION_DAYS);
        const allNeedsResolved =
          (args.needOutcomes?.length ?? 0) > 0 &&
          args.needOutcomes!.every((outcome) => outcome.resolutionStatus === TendingNeedResolutionStatus.RESOLVED);
        for (const entry of entriesToTransition) {
          const entryOutcome = entryOutcomeByEntryId.get(entry.id);
          if (entryOutcome?.stillWorthTrying === false || allNeedsResolved) {
            await tx.tendingEntry.update({
              where: { id: entry.id },
              data: { status: TendingEntryStatus.COMPLETED, completedAt: now },
            });
            continue;
          }
          await tx.tendingEntry.update({
            where: { id: entry.id },
            data: {
              status: TendingEntryStatus.SCHEDULED,
              scheduledFor: nextScheduledFor,
              openedAt: null,
              completedAt: null,
            },
          });
        }
        break;
      }
      case ContinueChoice.NEW_PROCESS: {
        if (entriesToTransition.length === 0) break;
        const handoffSummary = buildNewProcessHandoffSummary({
          reflection,
          entryOutcomes: args.entryOutcomes,
          needOutcomes: args.needOutcomes,
        });
        // Create a new Session linked back to this one. Both users start at Stage 0.
        const created = await tx.session.create({
          data: {
            relationshipId: session.relationshipId,
            status: 'CREATED',
            type: session.type,
            previousSessionId: args.sessionId,
            topicFrame: 'Tending follow-up',
          },
        });
        newSessionId = created.id;
        await tx.message.create({
          data: {
            sessionId: created.id,
            senderId: null,
            forUserId: args.userId,
            role: 'SYSTEM',
            content: handoffSummary,
            stage: 0,
            timestamp: now,
          },
        });
        // Mark current entries COMPLETED and the current session RESOLVED.
        for (const entry of entriesToTransition) {
          await tx.tendingEntry.update({
            where: { id: entry.id },
            data: { status: TendingEntryStatus.COMPLETED, completedAt: now },
          });
        }
        await tx.session.update({
          where: { id: args.sessionId },
          data: { status: 'RESOLVED', resolvedAt: now },
        });
        break;
      }
      case ContinueChoice.PARTIAL_CLOSURE: {
        if (entriesToTransition.length === 0) break;
        const resolutions = args.orientations.whatComesNext.partialClosure ?? {};
        nextScheduledFor = addDays(now, DEFAULT_EXTENSION_DAYS);
        for (const entry of entriesToTransition) {
          const resolution = resolutions[entry.id] ?? PartialClosureResolution.CONTINUING;
          const responseId = responseIds[entry.id];
          if (responseId) {
            await tx.tendingResponsePartialClosure.upsert({
              where: {
                tendingResponseId_tendingEntryId: {
                  tendingResponseId: responseId,
                  tendingEntryId: entry.id,
                },
              },
              create: {
                tendingResponseId: responseId,
                tendingEntryId: entry.id,
                resolution,
              },
              update: { resolution },
            });
          }
          if (resolution === PartialClosureResolution.RESOLVED) {
            await tx.tendingEntry.update({
              where: { id: entry.id },
              data: { status: TendingEntryStatus.COMPLETED, completedAt: now },
            });
          } else {
            await tx.tendingEntry.update({
              where: { id: entry.id },
              data: {
                status: TendingEntryStatus.SCHEDULED,
                scheduledFor: nextScheduledFor,
                openedAt: null,
                completedAt: null,
              },
            });
          }
        }
        break;
      }
      case ContinueChoice.FULL_CLOSURE: {
        if (entriesToTransition.length === 0) break;
        for (const entry of entriesToTransition) {
          await tx.tendingEntry.update({
            where: { id: entry.id },
            data: { status: TendingEntryStatus.COMPLETED, completedAt: now },
          });
        }
        await tx.session.update({
          where: { id: args.sessionId },
          data: { status: 'RESOLVED', resolvedAt: now },
        });
        break;
      }
      default:
        throw new TendingInvalidStateError(`Unsupported continueChoice: ${choice as string}`);
    }
  });

  if (hasSharedEntry) {
    try {
      await publishSessionEvent(args.sessionId, 'notification.pending_action', {
        kind: 'tending_checkin_submitted',
        continueChoice: choice,
        nextAction,
        submittedBy: args.userId,
        newSessionId,
      }, args.userId);
    } catch (error) {
      logger.warn('[tending] Failed to publish check-in event', { sessionId: args.sessionId, error });
    }
  }

  const refreshed = (await prisma.tendingEntry.findMany({
    where: { id: { in: openEntries.map((e) => e.id) } },
    include: { responses: true, entryOutcomes: true, reminders: true },
  })) as TendingEntryWithResponses[];

  return {
    entries: refreshed.map((entry) => toEntryDTO(entry, args.userId)),
    checkin: checkinDTO,
    coordinationCycle: coordinationCycleDTO,
    newSessionId,
    continueChoice: choice,
    nextScheduledFor,
  };
}

export async function openDueTendingEntries(now = new Date()): Promise<{ opened: number; entryIds: string[] }> {
  const dueEntries = await prisma.tendingEntry.findMany({
    where: {
      type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
      status: TendingEntryStatus.SCHEDULED,
      scheduledFor: { lte: now },
    },
    select: { id: true, sessionId: true },
  });

  const entryIds: string[] = [];
  for (const entry of dueEntries) {
    const updated = await prisma.tendingEntry.updateMany({
      where: { id: entry.id, status: TendingEntryStatus.SCHEDULED },
      data: { status: TendingEntryStatus.OPEN, openedAt: now },
    });
    if (updated.count === 0) continue;
    entryIds.push(entry.id);

    try {
      await publishSessionEvent(entry.sessionId, 'notification.pending_action', {
        kind: 'tending_checkin_opened',
        tendingEntryId: entry.id,
      });
    } catch (error) {
      logger.warn('[tending] Failed to publish opened check-in event', { entryId: entry.id, error });
    }
  }

  return { opened: entryIds.length, entryIds };
}

export async function resolveTimedOutTendingCoordinationCycles(
  now = new Date()
): Promise<{ resolved: number; cycleIds: string[] }> {
  const timedOutCycles = await prisma.tendingCoordinationCycle.findMany({
    where: {
      status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
      responseDeadlineAt: { lte: now },
    },
  });

  const cycleIds: string[] = [];
  for (const cycle of timedOutCycles) {
    const missingUserIds = cycle.participantUserIds.filter(
      (userId) => !cycle.submittedUserIds.includes(userId)
    );
    const updated = await prisma.tendingCoordinationCycle.update({
      where: { id: cycle.id },
      data: {
        status: TendingCoordinationStatus.TIMED_OUT,
        resolvedAt: now,
        resultSummary: missingUserIds.length
          ? `Tending proceeded with submitted responses after timeout. Missing participant(s): ${missingUserIds.join(', ')}.`
          : 'Tending proceeded after timeout with all available submitted responses.',
      },
    });
    cycleIds.push(updated.id);

    try {
      await publishSessionEvent(cycle.sessionId, 'notification.pending_action', {
        kind: 'tending_coordination_timed_out',
        coordinationCycleId: cycle.id,
        submittedUserIds: cycle.submittedUserIds,
        missingUserIds,
      });
    } catch (error) {
      logger.warn('[tending] Failed to publish coordination timeout event', { cycleId: cycle.id, error });
    }
  }

  return { resolved: cycleIds.length, cycleIds };
}
