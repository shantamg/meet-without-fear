/**
 * Slack Session Orchestrator
 *
 * Runs the full Bedrock conversation loop for a Slack-originated MWF session
 * turn. In Phase 1 this is a simple echo so end-to-end plumbing can be tested;
 * Phases 2–4 replace the body with context assembly, prompt building, and a
 * real Sonnet call.
 */

import { logger } from '../lib/logger';
import { postMessage, addReaction, removeReaction } from './slack-client';
import type { SlackMessagePayload } from './slack-types';
import { runConversationTurn } from './slack-conversation';

/**
 * Naive in-memory per-user lock to serialize concurrent messages from the same
 * Slack user. Swap for a DB advisory lock once we deploy multiple backend
 * instances.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function handleSlackMessage(payload: SlackMessagePayload): Promise<void> {
  const key = `slack:${payload.user}`;
  const prev = inFlight.get(key) ?? Promise.resolve();
  const next = prev.finally(() => {}).then(() => processTurn(payload));
  inFlight.set(
    key,
    next.finally(() => {
      if (inFlight.get(key) === next) inFlight.delete(key);
    })
  );
  await next;
}

async function processTurn(payload: SlackMessagePayload): Promise<void> {
  const { channel, ts } = payload;

  try {
    await runConversationTurn(payload);
    await removeReaction(channel, ts, 'eyes');
    await addReaction(channel, ts, 'white_check_mark');
  } catch (err) {
    logger.error('[SlackSessionOrchestrator] processTurn failed:', err);
    await removeReaction(channel, ts, 'eyes').catch(() => {});
    await addReaction(channel, ts, 'x').catch(() => {});
    await postMessage(
      channel,
      "_I hit an error trying to respond — give me a moment and try again._",
      payload.thread_ts ?? payload.ts
    ).catch(() => {});
  }
}
