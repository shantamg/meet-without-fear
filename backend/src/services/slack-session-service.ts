/**
 * Slack Session Service
 *
 * Pure async functions for managing MWF sessions originating from Slack. Owns
 * user lookup/creation from Slack profiles, session/relationship scaffolding,
 * Slack-thread-to-session mapping, message persistence, and stage progression.
 *
 * This is the DB persistence layer called by slack-conversation.ts on each
 * turn, and by the lobby controller when pairing users via join code.
 */

import type { Message, Session, User } from '@prisma/client';
import { MessageRole, Prisma, StageStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getUserInfo } from './slack-client';

// ============================================================================
// User resolution
// ============================================================================

/**
 * Look up a User by their Slack user id, creating one (with a Slack profile
 * pull) if they don't exist yet. Falls back to a placeholder email when Slack
 * doesn't return one.
 */
export async function findOrCreateSlackUser(slackUserId: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { slackUserId } });
  if (existing) return existing;

  const profile = await getUserInfo(slackUserId);
  const email = profile?.email ?? `slack-${slackUserId}@slack.local`;
  const displayName = profile?.displayName ?? null;
  const realName = profile?.realName ?? null;
  const name = displayName || realName || null;
  const firstName = name ? name.split(/\s+/)[0] : null;

  logger.info('[SlackSessionService] Creating User for Slack user', {
    slackUserId,
    hasProfile: Boolean(profile),
    hasEmail: Boolean(profile?.email),
  });

  return prisma.user.create({
    data: {
      slackUserId,
      email,
      name,
      firstName,
    },
  });
}

// ============================================================================
// Session lookup
// ============================================================================

/**
 * Find the (session, userId) pair bound to a specific Slack channel+thread.
 * Returns null if the thread is not yet mapped.
 */
export async function findSessionByThread(
  channelId: string,
  threadTs: string
): Promise<{ session: Session; userId: string } | null> {
  const mapping = await prisma.sessionSlackThread.findUnique({
    where: { channelId_threadTs: { channelId, threadTs } },
    include: { session: true },
  });
  if (!mapping) return null;
  return { session: mapping.session, userId: mapping.userId };
}

/**
 * Find a session by its 6-char lobby join code.
 */
export async function findSessionByJoinCode(code: string): Promise<Session | null> {
  return prisma.session.findUnique({ where: { slackJoinCode: code } });
}

/**
 * Find the user's currently-open `INVITED` session, if any. Used by the lobby
 * to short-circuit a duplicate `start` — if A already created a session and
 * hasn't been paired yet, surface the existing join code instead of minting a
 * second orphan session.
 */
export async function findInvitedSessionForUser(
  userId: string
): Promise<Session | null> {
  return prisma.session.findFirst({
    where: {
      status: 'INVITED',
      relationship: { members: { some: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Mark a session as ABANDONED and drop its Slack thread mappings. Used when
 * the user explicitly abandons an `INVITED` session via the lobby `archive`
 * command, or when the opportunistic TTL sweeper finds a 7-day-old invite.
 */
export async function archiveSession(sessionId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ABANDONED' },
    }),
    prisma.sessionSlackThread.deleteMany({ where: { sessionId } }),
  ]);
  logger.info('[SlackSessionService] Archived Slack session', { sessionId });
}

// ============================================================================
// Session creation & pairing
// ============================================================================

export interface CreateSlackSessionParams {
  creatorUserId: string;
  channelId: string;
  threadTs: string;
}

/**
 * Create a fresh MWF session with the Slack creator as the sole member, ready
 * for a partner to pair via join code. Returns the created session and the
 * join code partners should use in the lobby.
 */
export async function createSlackSession(
  params: CreateSlackSessionParams
): Promise<{ session: Session; joinCode: string }> {
  const { creatorUserId, channelId, threadTs } = params;
  const joinCode = generateJoinCode();

  const relationship = await prisma.relationship.create({
    data: {
      members: { create: [{ userId: creatorUserId }] },
    },
  });

  const session = await prisma.session.create({
    data: {
      relationshipId: relationship.id,
      status: 'INVITED',
      type: 'CONFLICT_RESOLUTION',
      slackJoinCode: joinCode,
      userVessels: { create: [{ userId: creatorUserId }] },
      stageProgress: {
        create: [
          {
            userId: creatorUserId,
            stage: 0,
            status: StageStatus.IN_PROGRESS,
            gatesSatisfied: {},
          },
        ],
      },
      slackThreads: {
        create: [{ userId: creatorUserId, channelId, threadTs }],
      },
    },
  });

  logger.info('[SlackSessionService] Created Slack session', {
    sessionId: session.id,
    creatorUserId,
    joinCode,
  });

  return { session, joinCode };
}

export interface PairSlackSessionParams {
  sessionId: string;
  partnerUserId: string;
  channelId: string;
  threadTs: string;
}

/**
 * Add a partner to an existing Slack-originated session: extend the
 * relationship, scaffold their vessel + stage 0 progress, map their DM thread,
 * and flip the session to ACTIVE.
 */
export async function pairSlackSession(
  params: PairSlackSessionParams
): Promise<Session> {
  const { sessionId, partnerUserId, channelId, threadTs } = params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { relationshipId: true },
  });
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  await prisma.relationshipMember.create({
    data: { relationshipId: session.relationshipId, userId: partnerUserId },
  });

  await prisma.userVessel.create({
    data: { sessionId, userId: partnerUserId },
  });

  await prisma.stageProgress.create({
    data: {
      sessionId,
      userId: partnerUserId,
      stage: 0,
      status: StageStatus.IN_PROGRESS,
      gatesSatisfied: {},
    },
  });

  await prisma.sessionSlackThread.create({
    data: { sessionId, userId: partnerUserId, channelId, threadTs },
  });

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE' },
    include: {
      relationship: { include: { members: { include: { user: true } } } },
      slackThreads: true,
    },
  });

  logger.info('[SlackSessionService] Paired partner into Slack session', {
    sessionId,
    partnerUserId,
  });

  return updated;
}

// ============================================================================
// Messages
// ============================================================================

export interface SaveSlackMessageParams {
  sessionId: string;
  userId: string;
  content: string;
  stage: number;
  role: 'USER' | 'AI';
}

/**
 * Persist a message to the session transcript. USER messages record both
 * senderId and forUserId as the Slack user; AI messages set senderId=null and
 * forUserId to the user the AI was responding to (matching the mobile-side
 * convention in Message).
 */
export async function saveSlackMessage(
  params: SaveSlackMessageParams
): Promise<Message> {
  const { sessionId, userId, content, stage, role } = params;
  const isUser = role === 'USER';

  return prisma.message.create({
    data: {
      sessionId,
      role: isUser ? MessageRole.USER : MessageRole.AI,
      content,
      stage,
      senderId: isUser ? userId : null,
      forUserId: userId,
    },
  });
}

// ============================================================================
// Stage progression
// ============================================================================

/**
 * Return the user's current stage number in a session. Uses the most recently
 * started StageProgress for the pair; defaults to 0 when none exists.
 */
export async function getCurrentStage(
  sessionId: string,
  userId: string
): Promise<number> {
  const progress = await prisma.stageProgress.findFirst({
    where: { sessionId, userId },
    orderBy: { startedAt: 'desc' },
    select: { stage: true },
  });
  return progress?.stage ?? 0;
}

export interface UpdateStageProgressPatch {
  gatesSatisfied?: Prisma.InputJsonValue;
  status?: StageStatus;
}

/**
 * Patch the user's most recent StageProgress row for a session. Used to record
 * gate satisfaction (e.g. `compactSigned`) or flip status to COMPLETED.
 */
export async function updateStageProgress(
  sessionId: string,
  userId: string,
  patch: UpdateStageProgressPatch
): Promise<void> {
  const latest = await prisma.stageProgress.findFirst({
    where: { sessionId, userId },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  if (!latest) {
    throw new Error(
      `No StageProgress found for session ${sessionId} user ${userId}`
    );
  }

  const data: Prisma.StageProgressUpdateInput = {};
  if (patch.gatesSatisfied !== undefined) data.gatesSatisfied = patch.gatesSatisfied;
  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === StageStatus.COMPLETED) data.completedAt = new Date();
  }

  await prisma.stageProgress.update({ where: { id: latest.id }, data });
}

/**
 * Returns true when both users on a session have compactSigned=true in their
 * Stage 0 gates. Used to gate the 0→1 transition.
 */
export async function hasBothUsersCompacted(sessionId: string): Promise<boolean> {
  const stage0 = await prisma.stageProgress.findMany({
    where: { sessionId, stage: 0 },
    select: { gatesSatisfied: true },
  });
  if (stage0.length < 2) return false;
  return stage0.every((p) => {
    const gates = p.gatesSatisfied as { compactSigned?: boolean } | null;
    return gates?.compactSigned === true;
  });
}

/**
 * Advance every user on the session to `newStage`: mark the current
 * StageProgress COMPLETED and open a fresh IN_PROGRESS row for the new stage.
 */
export async function advanceToStage(
  sessionId: string,
  newStage: number
): Promise<void> {
  const members = await prisma.relationshipMember.findMany({
    where: { relationship: { sessions: { some: { id: sessionId } } } },
    select: { userId: true },
  });

  const now = new Date();
  for (const { userId } of members) {
    const current = await prisma.stageProgress.findFirst({
      where: { sessionId, userId, status: { not: StageStatus.COMPLETED } },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (current) {
      await prisma.stageProgress.update({
        where: { id: current.id },
        data: { status: StageStatus.COMPLETED, completedAt: now },
      });
    }

    await prisma.stageProgress.upsert({
      where: {
        sessionId_userId_stage: { sessionId, userId, stage: newStage },
      },
      create: {
        sessionId,
        userId,
        stage: newStage,
        status: StageStatus.IN_PROGRESS,
        gatesSatisfied: {},
      },
      update: {
        status: StageStatus.IN_PROGRESS,
        startedAt: now,
        completedAt: null,
        gatesSatisfied: {},
      },
    });
  }

  logger.info('[SlackSessionService] Advanced session to new stage', {
    sessionId,
    newStage,
    memberCount: members.length,
  });
}

// ============================================================================
// Internals
// ============================================================================

const JOIN_CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // skip 0,o,l,1

function generateJoinCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return out;
}
