/**
 * Slack Conversation Runner
 *
 * Per-message orchestration for MWF sessions driven from Slack. Routes lobby
 * messages (#mwf-sessions) vs DM messages, and for DMs runs the full Bedrock
 * pipeline — the same engine the mobile app uses — built on:
 *
 *   assembleContextBundle → buildSlackStagePrompt → getSonnetResponse
 *     → parseMicroTagResponse → postMessage (Slack) + saveSlackMessage
 *
 * This file replaces the stub echo from Phase 1 with the real Phase 4 loop.
 * Phase 5 moves the socket-listener to POST here directly.
 */

import { randomUUID } from 'node:crypto';

import { logger } from '../lib/logger';
import { getSonnetResponse } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import {
  assembleContextBundle,
  type ContextBundle,
} from './context-assembler';
import { formatContextForPrompt } from './context-formatters';
import { determineMemoryIntent } from './memory-intent';
import { parseMicroTagResponse } from '../utils/micro-tag-parser';
import { trimConversationHistory } from '../utils/token-budget';
import type { SlackMessagePayload } from './slack-types';
import { openDM, postMessage } from './slack-client';
import {
  findOrCreateSlackUser,
  findSessionByJoinCode,
  findSessionByThread,
  createSlackSession,
  pairSlackSession,
  saveSlackMessage,
  getCurrentStage,
  updateStageProgress,
  hasBothUsersCompacted,
  advanceToStage,
} from './slack-session-service';
import { buildSlackStagePrompt } from './workspace-prompt-builder';
import { MessageRole } from '@prisma/client';

const CONVERSATION_TURN_LIMIT = 12; // pairs of user+assistant messages kept in prompt
const MAX_SONNET_TOKENS = 1024; // Slack replies are short — no need for 2048

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runConversationTurn(payload: SlackMessagePayload): Promise<void> {
  if (payload.isLobby) {
    await handleLobbyMessage(payload);
    return;
  }

  await handleDmMessage(payload);
}

// ---------------------------------------------------------------------------
// Lobby flow (#mwf-sessions channel)
// ---------------------------------------------------------------------------

const JOIN_CODE_REGEX = /\bjoin\s+([a-z0-9]{6})\b/i;

async function handleLobbyMessage(payload: SlackMessagePayload): Promise<void> {
  const trimmed = payload.text.trim();
  const lower = trimmed.toLowerCase();

  const user = await findOrCreateSlackUser(payload.user);

  // Pairing: "join <code>"
  const joinMatch = trimmed.match(JOIN_CODE_REGEX);
  if (joinMatch) {
    await handleJoinCode(user.id, joinMatch[1].toLowerCase(), payload);
    return;
  }

  // Start a new session
  if (lower === 'start' || lower.startsWith('start ')) {
    await handleStartSession(user.id, payload);
    return;
  }

  // Help fallback — don't start a random session on stray lobby chatter.
  await postMessage(
    payload.channel,
    'To begin, say `start`. To join a partner\'s session, say `join <code>`.',
    payload.thread_ts ?? payload.ts
  );
}

async function handleStartSession(userId: string, payload: SlackMessagePayload): Promise<void> {
  const dmChannel = await openDM(payload.user);
  if (!dmChannel) {
    logger.error('[SlackConversation] Could not open DM for user', payload.user);
    await postMessage(
      payload.channel,
      "I couldn't open a DM with you — please enable DMs from apps and try again.",
      payload.thread_ts ?? payload.ts
    );
    return;
  }

  // Post the opening DM first so we can use its ts as the thread root for this
  // user's side of the conversation.
  const opener = await postMessage(
    dmChannel,
    "*Welcome to Meet Without Fear.* I'll help you prepare for a conversation with someone who matters to you. Tell me a little — who is this person, and what\'s on your mind?"
  );
  if (!opener.ok || !opener.ts) {
    logger.error('[SlackConversation] Failed to send opening DM');
    return;
  }

  const { session, joinCode } = await createSlackSession({
    creatorUserId: userId,
    channelId: dmChannel,
    threadTs: opener.ts,
  });

  await postMessage(
    payload.channel,
    `Session started — head to your DM to begin. Share this code with your partner so they can join: *${joinCode}*`,
    payload.thread_ts ?? payload.ts
  );

  // Save the AI opener to the transcript so it shows up in later context.
  await saveSlackMessage({
    sessionId: session.id,
    userId,
    content: "Welcome to Meet Without Fear. I'll help you prepare for a conversation with someone who matters to you. Tell me a little — who is this person, and what's on your mind?",
    stage: 0,
    role: 'AI',
  });
}

async function handleJoinCode(
  userId: string,
  code: string,
  payload: SlackMessagePayload
): Promise<void> {
  const session = await findSessionByJoinCode(code);
  if (!session) {
    await postMessage(
      payload.channel,
      "I couldn\'t find a session with that code. Double-check and try again.",
      payload.thread_ts ?? payload.ts
    );
    return;
  }
  if (session.status !== 'INVITED') {
    await postMessage(
      payload.channel,
      'That session already has two participants.',
      payload.thread_ts ?? payload.ts
    );
    return;
  }

  const dmChannel = await openDM(payload.user);
  if (!dmChannel) {
    await postMessage(
      payload.channel,
      "I couldn\'t open a DM with you — please enable DMs from apps and try again.",
      payload.thread_ts ?? payload.ts
    );
    return;
  }

  const opener = await postMessage(
    dmChannel,
    "*Welcome — your partner is ready for this conversation.* I'll help you prepare too. Tell me a little about the situation and what you\'re hoping for."
  );
  if (!opener.ok || !opener.ts) {
    logger.error('[SlackConversation] Failed to send partner opening DM');
    return;
  }

  await pairSlackSession({
    sessionId: session.id,
    partnerUserId: userId,
    channelId: dmChannel,
    threadTs: opener.ts,
  });

  await saveSlackMessage({
    sessionId: session.id,
    userId,
    content: "Welcome — your partner is ready for this conversation. I'll help you prepare too. Tell me a little about the situation and what you're hoping for.",
    stage: 0,
    role: 'AI',
  });

  await postMessage(
    payload.channel,
    'Joined — head to your DM to begin.',
    payload.thread_ts ?? payload.ts
  );

  // Ping the creator's DM too.
  const creatorThread = session.id
    ? await prisma.sessionSlackThread.findFirst({
        where: { sessionId: session.id, NOT: { userId } },
      })
    : null;
  if (creatorThread) {
    await postMessage(
      creatorThread.channelId,
      '_Your partner has joined. Continue here whenever you\'re ready._',
      creatorThread.threadTs
    );
  }
}

// ---------------------------------------------------------------------------
// DM flow (actual conversation)
// ---------------------------------------------------------------------------

async function handleDmMessage(payload: SlackMessagePayload): Promise<void> {
  const threadTs = payload.thread_ts ?? payload.ts;
  const mapping = await findSessionByThread(payload.channel, threadTs);
  if (!mapping) {
    // Not an MWF session thread — guide user to the lobby. Only reply once
    // per unmapped top-level message.
    if (!payload.thread_ts) {
      await postMessage(
        payload.channel,
        "I can only run MWF sessions inside threads I started. Start a session in <#mwf-sessions> first."
      );
    }
    return;
  }

  const { session, userId } = mapping;
  const stage = await getCurrentStage(session.id, userId);

  // Persist the incoming user message before we call the model so it's part of
  // context on this turn too (matches the mobile controller).
  await saveSlackMessage({
    sessionId: session.id,
    userId,
    content: payload.text,
    stage,
    role: 'USER',
  });

  // If the user is in Stage 0 and answers yes to the compact, mark it and
  // possibly advance.
  await maybeHandleStage0Signal(session.id, userId, payload.text);

  // Load history for both the Sonnet prompt and context assembly.
  const history = await loadConversationForPrompt(session.id, userId);

  // Determine memory intent (same as mobile).
  const memoryIntent = determineMemoryIntent({
    stage,
    emotionalIntensity: 5,
    userMessage: payload.text,
    turnCount: Math.floor(history.length / 2),
    isFirstTurnInSession: history.length <= 2,
  });

  let contextBundle: ContextBundle;
  try {
    contextBundle = await assembleContextBundle(session.id, userId, stage, memoryIntent);
  } catch (err) {
    logger.error('[SlackConversation] assembleContextBundle failed:', err);
    return;
  }

  const userName = contextBundle.userName;
  const partnerName = contextBundle.partnerName ?? undefined;
  const emotionalIntensity =
    contextBundle.emotionalThread.currentIntensity ?? 5;

  const { trimmed: trimmedHistory } = trimConversationHistory(
    history,
    CONVERSATION_TURN_LIMIT
  );

  const prompt = buildSlackStagePrompt(
    stage,
    {
      userName,
      partnerName,
      turnCount: contextBundle.conversationContext.turnCount,
      emotionalIntensity,
      contextBundle,
    },
    {
      isOnboarding: stage === 0 && !(await hasBothUsersCompacted(session.id)),
    }
  );

  // Inject the per-turn formatted context as a leading user message rather
  // than baking it into the dynamic block, so prompt caching on the static
  // block still gets hits across turns.
  const contextText = formatContextForPrompt(contextBundle);

  const messages = [
    { role: 'user' as const, content: `(Context for this turn — do not reply to this directly)\n${contextText}` },
    ...trimmedHistory,
  ];

  const turnId = randomUUID();
  const raw = await getSonnetResponse({
    systemPrompt: prompt,
    messages,
    sessionId: session.id,
    turnId,
    operation: 'slack-session-turn',
    maxTokens: MAX_SONNET_TOKENS,
  });

  if (!raw) {
    await postMessage(
      payload.channel,
      '_I hit a snag reaching my model — please try again in a moment._',
      threadTs
    );
    return;
  }

  const parsed = parseMicroTagResponse(raw);
  const replyText = parsed.response?.trim();

  if (!replyText) {
    logger.warn('[SlackConversation] Parsed response was empty', { dispatch: parsed.dispatchTag });
    return;
  }

  // Persist AI turn first so subsequent turns see it in history.
  await saveSlackMessage({
    sessionId: session.id,
    userId,
    content: replyText,
    stage,
    role: 'AI',
  });

  await postMessage(payload.channel, replyText, threadTs);

  // Stage-specific signal handling.
  if (stage === 1 && parsed.offerFeelHeardCheck) {
    await maybeAdvanceOnFeelHeard(session.id, userId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadConversationForPrompt(
  sessionId: string,
  userId: string
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      forUserId: userId,
      role: { in: [MessageRole.USER, MessageRole.AI] },
    },
    orderBy: { timestamp: 'asc' },
    select: { role: true, content: true },
  });

  return messages.map((m) => ({
    role: m.role === MessageRole.USER ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));
}

/**
 * Stage 0 compact signal — look for an affirmative "I agree/yes/I'm in"
 * response to the compact ask, and mark the gate.
 */
async function maybeHandleStage0Signal(
  sessionId: string,
  userId: string,
  text: string
): Promise<void> {
  const stage = await getCurrentStage(sessionId, userId);
  if (stage !== 0) return;

  const affirmed = /\b(i\s+agree|i'?m\s+in|yes,?\s+i\s+agree|agreed|sign(?:ed)?\s+it)\b/i.test(text);
  if (!affirmed) return;

  await updateStageProgress(sessionId, userId, {
    gatesSatisfied: { compactSigned: true },
  });

  if (await hasBothUsersCompacted(sessionId)) {
    await advanceToStage(sessionId, 1);
    logger.info('[SlackConversation] Both users signed compact — advancing to Stage 1', {
      sessionId,
    });
  }
}

async function maybeAdvanceOnFeelHeard(sessionId: string, userId: string): Promise<void> {
  // We don't auto-advance on feel-heard here — the AI already offered the
  // check in the reply, and the user needs to explicitly confirm. Phase 6
  // will wire the explicit confirmation flow via a DM button-style prompt.
  // For now, just record that the signal was raised.
  await updateStageProgress(sessionId, userId, {
    gatesSatisfied: { feelHeardOffered: true },
  });
}
