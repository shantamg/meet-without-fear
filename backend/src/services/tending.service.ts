import { Prisma } from '@prisma/client';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingCheckinOrientations,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
  TendingResponseDTO,
} from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { publishSessionEvent } from './realtime';
import { getSessionSummary } from './conversation-summarizer';

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
    status: string;
    reflection: string | null;
    continueChoice: ContinueChoice | null;
    submittedAt: Date;
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
    status: response.status,
    reflection: response.reflection,
    continueChoice: response.continueChoice,
    submittedAt: response.submittedAt.toISOString(),
  };
}

function toEntryDTO(entry: TendingEntryWithResponses, userId: string): TendingEntryDTO {
  const myResponse = entry.responses.find((response) => response.userId === userId) ?? null;

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
    include: { responses: true },
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
  const [closure, sharedVessel, openNeeds, summaryData] = await Promise.all([
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
    getSessionSummary(sessionId, userId).catch(() => null),
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
    summaryData ? `Session summary: ${summaryData.summary.text}` : null,
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
    include: { responses: true },
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export type SubmitTendingCheckinResult = {
  entries: TendingEntryDTO[];
  newSessionId?: string;
  continueChoice: ContinueChoice;
  nextScheduledFor?: Date | null;
};

export async function submitTendingCheckin(args: {
  sessionId: string;
  userId: string;
  orientations: TendingCheckinOrientations;
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
    include: { responses: true },
  })) as TendingEntryWithResponses[];

  if (openEntries.length === 0) {
    throw new TendingInvalidStateError('No open Tending entries to check in on');
  }

  const choice = args.orientations.whatComesNext.continueChoice;
  const reflection = [
    args.orientations.whatWorked.reflection
      ? `What worked: ${args.orientations.whatWorked.reflection}`
      : null,
    args.orientations.whereMoreSupport.reflection
      ? `Where more support: ${args.orientations.whereMoreSupport.reflection}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  let nextScheduledFor: Date | null = null;
  let newSessionId: string | undefined;

  await prisma.$transaction(async (tx) => {
    // 1) Persist a TendingResponse for each open entry that the user can respond to.
    const responseIds: Record<string, string> = {};
    for (const entry of openEntries) {
      if (entry.scope === TendingEntryScope.INDIVIDUAL && entry.ownerUserId !== args.userId) {
        continue;
      }
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
          status: 'CHECKIN',
          reflection: reflection || null,
          continueChoice: choice,
          submittedAt: now,
        },
        update: {
          status: 'CHECKIN',
          reflection: reflection || null,
          continueChoice: choice,
          submittedAt: now,
        },
      });
      responseIds[entry.id] = upserted.id;
    }

    // 2) Apply path-specific state transitions.
    switch (choice) {
      case ContinueChoice.ANOTHER_ROUND: {
        // Reset Stage 4 to inventory building: clear closure, selections, gates.
        // Preserve agreements as historical context.
        await tx.stage4Closure.deleteMany({ where: { sessionId: args.sessionId } });
        await tx.stage4ProposalSelection.deleteMany({ where: { sessionId: args.sessionId } });
        await tx.stage4NeedCoverage.deleteMany({ where: { sessionId: args.sessionId } });
        await tx.stage4NeedDeclination.deleteMany({ where: { sessionId: args.sessionId } });
        // Clear selectionSubmitted gates on every member's stage-4 progress.
        const progress = await tx.stageProgress.findMany({
          where: { sessionId: args.sessionId, stage: 4 },
        });
        for (const row of progress) {
          const gates = (row.gatesSatisfied as Record<string, unknown> | null) ?? {};
          delete gates.selectionSubmitted;
          await tx.stageProgress.update({
            where: { id: row.id },
            data: { gatesSatisfied: gates as Prisma.InputJsonValue },
          });
        }
        // Close out current Tending entries so a fresh inventory cycle can run.
        for (const entry of openEntries) {
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
        nextScheduledFor = addDays(now, DEFAULT_EXTENSION_DAYS);
        for (const entry of openEntries) {
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
        // Create a new Session linked back to this one. Both users start at Stage 0.
        const created = await tx.session.create({
          data: {
            relationshipId: session.relationshipId,
            status: 'CREATED',
            type: session.type,
            previousSessionId: args.sessionId,
          },
        });
        newSessionId = created.id;
        // Mark current entries COMPLETED and the current session RESOLVED.
        for (const entry of openEntries) {
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
        const resolutions = args.orientations.whatComesNext.partialClosure ?? {};
        nextScheduledFor = addDays(now, DEFAULT_EXTENSION_DAYS);
        for (const entry of openEntries) {
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
        for (const entry of openEntries) {
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

  try {
    await publishSessionEvent(args.sessionId, 'notification.pending_action', {
      kind: 'tending_checkin_submitted',
      continueChoice: choice,
      submittedBy: args.userId,
      newSessionId,
    }, args.userId);
  } catch (error) {
    logger.warn('[tending] Failed to publish check-in event', { sessionId: args.sessionId, error });
  }

  const refreshed = (await prisma.tendingEntry.findMany({
    where: { id: { in: openEntries.map((e) => e.id) } },
    include: { responses: true },
  })) as TendingEntryWithResponses[];

  return {
    entries: refreshed.map((entry) => toEntryDTO(entry, args.userId)),
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
