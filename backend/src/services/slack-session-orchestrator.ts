/**
 * Slack Session Orchestrator
 *
 * Runs one turn of an MWF session driven from Slack. Handles concurrency
 * (advisory lock keyed on Slack user), the 👀/✅/❌ reaction UX, and top-level
 * error boundary. Delegates the actual conversation logic to
 * `slack-conversation.ts`.
 */

import { logger } from '../lib/logger';
import { postMessage, addReaction, removeReaction } from './slack-client';
import type { SlackMessagePayload } from './slack-types';
import { runConversationTurn } from './slack-conversation';
import { withSlackUserLock } from './slack-lock';

export async function handleSlackMessage(payload: SlackMessagePayload): Promise<void> {
  // Serialize concurrent turns from the same Slack user via a Postgres
  // advisory lock. Works across multiple backend replicas; lock auto-releases
  // on tx end or connection drop (so a crashed process can't leave it stuck).
  await withSlackUserLock(payload.user, () => processTurn(payload));
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
