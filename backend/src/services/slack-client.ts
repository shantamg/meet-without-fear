/**
 * Slack Web API Client
 *
 * Thin wrapper around @slack/web-api for posting messages, opening DMs,
 * adding reactions, and fetching user profile info. Used by the MWF session
 * flow to post Bedrock-generated replies back to Slack DM threads without
 * going through the EC2 bot.
 */

import { WebClient } from '@slack/web-api';
import { logger } from '../lib/logger';

let client: WebClient | null | undefined;

/**
 * Lazily construct the Slack client. Returns null when SLACK_BOT_TOKEN is
 * missing — callers should treat that as "Slack is not configured" and skip
 * posting without crashing.
 */
export function getSlackClient(): WebClient | null {
  if (client !== undefined) return client;

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('[SlackClient] SLACK_BOT_TOKEN not set — Slack posting disabled');
    client = null;
    return null;
  }

  client = new WebClient(token);
  return client;
}

export interface PostMessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<PostMessageResult> {
  const slack = getSlackClient();
  if (!slack) return { ok: false, error: 'no_client' };

  try {
    const res = await slack.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    });
    return { ok: true, ts: res.ts, channel: res.channel };
  } catch (err) {
    logger.error('[SlackClient] postMessage failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function openDM(userId: string): Promise<string | null> {
  const slack = getSlackClient();
  if (!slack) return null;

  try {
    const res = await slack.conversations.open({ users: userId });
    return res.channel?.id ?? null;
  } catch (err) {
    logger.error('[SlackClient] openDM failed:', err);
    return null;
  }
}

export async function addReaction(
  channel: string,
  ts: string,
  name: string
): Promise<boolean> {
  const slack = getSlackClient();
  if (!slack) return false;

  try {
    await slack.reactions.add({ channel, timestamp: ts, name });
    return true;
  } catch (err) {
    const code = (err as { data?: { error?: string } }).data?.error;
    if (code === 'already_reacted') return true;
    logger.warn('[SlackClient] addReaction failed:', err);
    return false;
  }
}

export async function removeReaction(
  channel: string,
  ts: string,
  name: string
): Promise<boolean> {
  const slack = getSlackClient();
  if (!slack) return false;

  try {
    await slack.reactions.remove({ channel, timestamp: ts, name });
    return true;
  } catch (err) {
    const code = (err as { data?: { error?: string } }).data?.error;
    if (code === 'no_reaction') return true;
    logger.warn('[SlackClient] removeReaction failed:', err);
    return false;
  }
}

export interface SlackProfile {
  userId: string;
  displayName: string;
  realName: string | null;
  email: string | null;
}

export async function getUserInfo(userId: string): Promise<SlackProfile | null> {
  const slack = getSlackClient();
  if (!slack) return null;

  try {
    const res = await slack.users.info({ user: userId });
    const u = res.user;
    if (!u) return null;
    return {
      userId,
      displayName: u.profile?.display_name || u.real_name || u.name || userId,
      realName: u.real_name ?? null,
      email: u.profile?.email ?? null,
    };
  } catch (err) {
    logger.error('[SlackClient] getUserInfo failed:', err);
    return null;
  }
}
