import { Prisma } from '@prisma/client';
import {
  TendingEntryDTO,
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
    continueChoice: string | null;
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

export async function listTendingEntries(sessionId: string, userId: string): Promise<TendingEntryDTO[]> {
  await assertSessionMember(sessionId, userId);

  const entries = (await prisma.tendingEntry.findMany({
    where: { sessionId },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    include: { responses: true },
  })) as TendingEntryWithResponses[];

  return entries.map((entry) => toEntryDTO(entry, userId));
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
  continueChoice?: string;
}): Promise<TendingEntryDTO> {
  const entry = await getEntryForUser(args.entryId, args.userId);
  if (entry.status === TendingEntryStatus.SCHEDULED) {
    throw new TendingInvalidStateError('Tending entry is not open yet');
  }
  if (entry.status === TendingEntryStatus.CANCELLED || entry.status === TendingEntryStatus.EXPIRED) {
    throw new TendingInvalidStateError('Tending entry is no longer accepting responses');
  }

  const now = new Date();
  const memberCount = entry.session.relationship.members.length;
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

  await publishSessionEvent(args.sessionId, 'notification.pending_action', {
    kind: 'tending_reentry_created',
    tendingEntryId: entry.id,
    createdBy: args.userId,
  }, args.userId);

  return toEntryDTO(entry, args.userId);
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
