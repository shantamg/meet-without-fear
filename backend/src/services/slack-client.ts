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

// ---------------------------------------------------------------------------
// Markdown → Slack mrkdwn conversion
// ---------------------------------------------------------------------------

/**
 * Post-process a reply so it renders correctly in Slack. The prompt already
 * tells Sonnet to emit mrkdwn (via `SLACK_FORMATTING_RULES` in stage-prompts),
 * but the model still fumbles occasionally — this catches the common cases so
 * users never see literal `**asterisks**` or `# Headers` in their DM.
 *
 * Rules applied (fenced code blocks are skipped so code stays verbatim):
 *   • `**bold**` → `*bold*`
 *   • `__bold__` → `*bold*`
 *   • `[label](url)` → `<url|label>`
 *   • leading `# ` / `## ` / `### ` headers → `*bold line*`
 *   • leading `- ` / `* ` bullets → `• ` (tabs normalized to spaces for nesting)
 *   • multi-line blockquotes with lazy continuation → `>` prefix on every line
 *
 * We deliberately don't touch single `*word*` (could be italic) or single
 * `_word_` (already valid Slack italic).
 */
export function toSlackMrkdwn(text: string): string {
  // Split on triple-backtick fences so we leave code blocks alone.
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, i) => {
      // Every odd-indexed part is a fenced code block — pass through.
      if (i % 2 === 1) return part;
      let out = part;
      // **bold** → *bold*
      out = out.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
      // __bold__ → *bold*
      out = out.replace(/__([^_\n]+?)__/g, '*$1*');
      // [label](url) → <url|label>
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<$2|$1>');
      // Headers → bold line (only consume horizontal whitespace — \s would eat
      // the blank line between a header and its body).
      out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, '*$1*');
      // Bullets at line start → • (normalize tab indentation to spaces so
      // Slack renders nested bullets correctly).
      out = out.replace(/^([ \t]*)[-*][ \t]+/gm, (_m, indent: string) => {
        const spaces = indent.replace(/\t/g, '  ');
        return `${spaces}• `;
      });
      // Multi-line blockquote lazy continuation → explicit `>` per line.
      out = normalizeBlockquotes(out);
      return out;
    })
    .join('');
}

/**
 * Standard Markdown allows a blockquote paragraph to start with `>` on only
 * the first line, with subsequent non-blank lines implicitly joining the
 * quote ("lazy continuation"). Slack doesn't — it treats lines without `>`
 * as plain text, so a multi-line quote renders flat past the first line.
 * This walks the text line-by-line and prefixes continuation lines with `> `
 * until a blank line or a new block-level construct ends the quote.
 */
function normalizeBlockquotes(text: string): string {
  const lines = text.split('\n');
  let inQuote = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^>\s?/.test(line)) {
      inQuote = true;
      continue;
    }
    if (line.trim() === '') {
      inQuote = false;
      continue;
    }
    if (inQuote) {
      // Lazy continuation — extend the quote. Preserve leading whitespace
      // after the `> ` prefix in case the line was indented.
      lines[i] = `> ${line}`;
    }
  }
  return lines.join('\n');
}

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
      text: toSlackMrkdwn(text),
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
