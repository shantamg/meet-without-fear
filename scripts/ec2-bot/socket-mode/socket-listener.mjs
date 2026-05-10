#!/usr/bin/env node
/**
 * Socket Mode Listener for Slam Paws
 *
 * Persistent WebSocket connection to Slack. Receives message events in
 * real-time, including thread replies on old messages.
 *
 * Dispatch flow:
 *   1. Receive message event
 *   2. Filter out bot's own messages
 *   3. Claim message (atomic file creation)
 *   4. Add :eyes: reaction
 *   5. Build prompt (context + message + template/prompt file)
 *   6. Enqueue a durable Python harness job
 *   7. Worker updates reactions on completion
 *
 * Environment variables (from /opt/slam-bot/.env):
 *   SLACK_APP_TOKEN       — App-level token (xapp-...) for Socket Mode
 *   SLACK_BOT_TOKEN       — Bot OAuth token (xoxb-...) for API calls
 *   SLAM_BOT_USER_ID   — Bot's Slack user ID (to filter self-messages)
 *   SHANTAM_SLACK_DM      — Channel ID for Shantam's DM
 *   PMF1_CHANNEL_ID       — Channel ID for #pmf1
 *   AGENTIC_DEVS_CHANNEL_ID — Channel ID for the #agentic-devs channel
 *   SLAM_BOT_CHANNEL_ID — Channel ID for the #slam-paws channel
 *   BUGS_AND_REQUESTS_CHANNEL_ID — Channel ID for the #bugs-and-requests channel
 *   MOST_IMPORTANT_THING_CHANNEL_ID — Channel ID for the #most-important-thing channel
 */

import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { spawn, execSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const BOT_USER_ID = process.env.SLAM_BOT_USER_ID;
const SHANTAM_DM = process.env.SHANTAM_SLACK_DM;
const SLAM_BOT_CHANNEL = process.env.SLAM_BOT_CHANNEL_ID;
const AGENTIC_DEVS_CHANNEL = process.env.AGENTIC_DEVS_CHANNEL_ID;
const BUGS_AND_REQUESTS_CHANNEL = process.env.BUGS_AND_REQUESTS_CHANNEL_ID;
const MOST_IMPORTANT_THING_CHANNEL = process.env.MOST_IMPORTANT_THING_CHANNEL_ID;
const DAILY_SUMMARY_CHANNEL = process.env.DAILY_SUMMARY_CHANNEL_ID;

if (!APP_TOKEN || !BOT_TOKEN || !BOT_USER_ID) {
  console.error('Missing required env vars: SLACK_APP_TOKEN, SLACK_BOT_TOKEN, SLAM_BOT_USER_ID');
  process.exit(1);
}

const STATE_DIR = '/opt/slam-bot/state';
const CLAIMS_DIR = join(STATE_DIR, 'claims');
const LOG_DIR = '/var/log/slam-bot';
const SCRIPTS_DIR = '/opt/slam-bot/scripts';
const QUEUE_DIR = '/opt/slam-bot/queue';
const MWF_APP_DIR = process.env.HOME + '/meet-without-fear';

function providerOverrideForMessage(event) {
  if (/\bcodex\b/i.test(event?.text || '')) {
    return 'codex';
  }
  return '';
}

// Health check: write last event timestamp so the watchdog can verify liveness
const HEARTBEAT_FILE = join(STATE_DIR, 'socket-mode-heartbeat.txt');

// Ensure directories exist
mkdirSync(CLAIMS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Priority bypass — channels that should skip resource gates in the worker
// ---------------------------------------------------------------------------

function isPriorityChannel(channel) {
  if (!channel) return false;
  if (channel.startsWith('D')) return true;
  if (channel === AGENTIC_DEVS_CHANNEL) return true;
  return false;
}

/**
 * Get the thread key for an event. A top-level message starts a thread
 * keyed by its own ts; a reply uses the parent's thread_ts.
 */
function threadKey(channel, event) {
  // thread_ts is the parent message ts for thread replies.
  // For a top-level message that is itself the parent, thread_ts === ts or is absent.
  const threadTs = event.thread_ts || event.ts;
  return `${channel}:${threadTs}`;
}

const slack = new WebClient(BOT_TOKEN);
const socketClient = new SocketModeClient({ appToken: APP_TOKEN });

// ---------------------------------------------------------------------------
// Channel routing — maps channel IDs to their dispatch config
// ---------------------------------------------------------------------------

/**
 * Channel dispatch config.
 *
 * Each channel can be dispatched in one of two modes:
 *   1. Command-slug mode (legacy): uses `commandSlug` + optional `promptFile`/`inlineTemplate`
 *   2. Workspace mode (new): uses `workspace` — the harness cds into bot-workspaces/<name>/
 *      and Claude's native CLAUDE.md auto-loading handles context routing.
 *
 * When `workspace` is set, the prompt content (context + message + template) is still built
 * by the listener and passed as a prompt file — the workspace CLAUDE.md provides domain
 * routing, while the prompt provides the specific message to handle.
 *
 * @type {Record<string, {logName: string, commandSlug: string, workspace?: string, promptFile?: string, inlineTemplate?: string, contextCount: number}>}
 */
const CHANNEL_CONFIG = {};

// DM channel — routed to slack-triage
if (SHANTAM_DM) {
  CHANNEL_CONFIG[SHANTAM_DM] = {
    logName: 'check-dm',
    channelName: 'DM (Shantam)',
    commandSlug: 'dm-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// #slam-paws channel — general-purpose bot interaction
if (SLAM_BOT_CHANNEL) {
  CHANNEL_CONFIG[SLAM_BOT_CHANNEL] = {
    logName: 'check-slam-paws',
    channelName: '#slam-paws',
    commandSlug: 'slam-paws-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// #agentic-devs channel — dev/ops chatter routed through slack-triage
if (AGENTIC_DEVS_CHANNEL) {
  CHANNEL_CONFIG[AGENTIC_DEVS_CHANNEL] = {
    logName: 'check-agentic-devs',
    channelName: '#agentic-devs',
    commandSlug: 'agentic-devs-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// #bugs-and-requests channel — product-team intake for bugs and feature requests
if (BUGS_AND_REQUESTS_CHANNEL) {
  CHANNEL_CONFIG[BUGS_AND_REQUESTS_CHANNEL] = {
    logName: 'check-bugs-and-requests',
    channelName: '#bugs-and-requests',
    commandSlug: 'bugs-and-requests-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// #most-important-thing channel — daily strategy briefing responses
if (MOST_IMPORTANT_THING_CHANNEL) {
  CHANNEL_CONFIG[MOST_IMPORTANT_THING_CHANNEL] = {
    logName: 'check-most-important-thing',
    channelName: '#most-important-thing',
    commandSlug: 'most-important-thing-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// #daily-summary channel — bot's twice-daily activity summaries (replies expected)
if (DAILY_SUMMARY_CHANNEL) {
  CHANNEL_CONFIG[DAILY_SUMMARY_CHANNEL] = {
    logName: 'check-daily-summary',
    channelName: '#daily-summary',
    commandSlug: 'daily-summary-reply',
    workspace: 'slack-triage',
    contextCount: 10,
  };
}

// ---------------------------------------------------------------------------
// All channels now use workspace mode. The workspace CLAUDE.md
// provides classification + dispatch; the prompt provides the specific message.
// Channel-specific tone is handled by the workspace based on channelName.

// ---------------------------------------------------------------------------
// Startup validation — verify all configured workspaces exist on disk
// ---------------------------------------------------------------------------

const BOT_OPS_CHANNEL = process.env.BOT_OPS_CHANNEL_ID;
const workspaceErrors = [];

for (const [channelId, config] of Object.entries(CHANNEL_CONFIG)) {
  if (config.workspace) {
    const wsDir = join(MWF_APP_DIR, 'bot-workspaces', config.workspace);
    if (!existsSync(wsDir)) {
      const msg = `Workspace "${config.workspace}" for ${config.channelName} not found at ${wsDir}`;
      console.error(`ERROR: ${msg}`);
      workspaceErrors.push(msg);
    }
  }
}

if (workspaceErrors.length > 0) {
  const summary = `🚨 slam-bot: ${workspaceErrors.length} workspace(s) missing at startup:\n${workspaceErrors.map((e) => `• ${e}`).join('\n')}`;

  // Post to #bot-ops if channel is configured
  if (BOT_OPS_CHANNEL) {
    try {
      await slack.chat.postMessage({ channel: BOT_OPS_CHANNEL, text: summary });
    } catch (err) {
      console.error(`Failed to post workspace errors to #bot-ops: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(logName, msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  const logFile = join(LOG_DIR, `${logName}.log`);
  try {
    writeFileSync(logFile, line, { flag: 'a' });
  } catch {
    // Log dir may not exist in dev
    process.stderr.write(line);
  }
}

function logMain(msg) {
  log('socket-mode', msg);
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Message claiming (atomic file creation)
// ---------------------------------------------------------------------------

function claimMessage(channel, ts) {
  const claimFile = join(CLAIMS_DIR, `claimed-${channel}-${ts}.txt`);
  try {
    writeFileSync(claimFile, `${process.pid}`, { flag: 'wx' }); // wx = exclusive create
    return true;
  } catch {
    return false; // Already claimed
  }
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

async function addReaction(channel, ts, name) {
  try {
    await slack.reactions.add({ channel, timestamp: ts, name });
  } catch (err) {
    // already_reacted is expected if we retry
    if (err.data?.error !== 'already_reacted') {
      logMain(`Failed to add :${name}: to ${ts}: ${err.message}`);
    }
  }
}

async function removeReaction(channel, ts, name) {
  try {
    await slack.reactions.remove({ channel, timestamp: ts, name });
  } catch {
    // Ignore — reaction may have been removed already
  }
}

// ---------------------------------------------------------------------------
// Context building (mirrors slack_build_context + slack_build_prompt_with_context)
// ---------------------------------------------------------------------------

async function buildContext(channel, count) {
  try {
    const result = await slack.conversations.history({ channel, limit: count });
    if (!result.ok || !result.messages) return '(Could not fetch channel context)';

    return result.messages
      .reverse()
      .map((m) => {
        let line = `[${m.ts}] <${m.user || 'unknown'}>: ${m.text || '(no text)'}`;
        if (m.files?.length) {
          const fileList = m.files.map((f) => `${f.name || 'unnamed'} (${f.mimetype || 'unknown'})`).join(', ');
          line += `\n  [Attached files: ${fileList}]`;
        }
        return line;
      })
      .join('\n');
  } catch (err) {
    logMain(`Failed to fetch context for ${channel}: ${err.message}`);
    return '(Could not fetch channel context)';
  }
}

function formatMessage(msgJson) {
  let line = `[${msgJson.ts}] <${msgJson.user || 'unknown'}>: ${msgJson.text || '(no text)'}`;
  if (msgJson.files?.length) {
    const fileList = msgJson.files.map((f) => `${f.name || 'unnamed'} (${f.mimetype || 'unknown'})`).join(', ');
    line += `\n  [Attached files: ${fileList}]`;
  }
  return line;
}

/**
 * Check if a Claude session file exists for the given session key.
 * Uses the same UUIDv5 derivation as parse-args.sh:session_key_to_uuid().
 */
function sessionExists(sessionKey) {
  try {
    const uuid = execSync(
      `python3 -c "import uuid, sys; print(uuid.uuid5(uuid.NAMESPACE_URL, sys.argv[1]))" "${sessionKey}"`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    // Search for the session file in ~/.claude/projects/
    const result = execSync(
      `find ${homedir()}/.claude/projects/ -name "${uuid}.jsonl" 2>/dev/null | head -1`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch all messages in a Slack thread. Returns formatted string with all
 * messages in chronological order, suitable as context for a new session.
 */
async function buildThreadContext(channel, threadTs) {
  try {
    const result = await slack.conversations.replies({ channel, ts: threadTs, limit: 100 });
    if (!result.ok || !result.messages) return '(Could not fetch thread history)';

    return result.messages
      .map((m) => {
        const prefix = m.user === BOT_USER_ID ? '(bot)' : `<${m.user || 'unknown'}>`;
        let line = `[${m.ts}] ${prefix}: ${m.text || '(no text)'}`;
        if (m.files?.length) {
          const fileList = m.files.map((f) => `${f.name || 'unnamed'} (${f.mimetype || 'unknown'})`).join(', ');
          line += `\n  [Attached files: ${fileList}]`;
        }
        return line;
      })
      .join('\n');
  } catch (err) {
    logMain(`Failed to fetch thread context for ${threadTs}: ${err.message}`);
    return '(Could not fetch thread history)';
  }
}

async function buildPrompt(channel, config, msgEvent) {
  const parts = [];

  // Thread replies use --resume and already have full conversation context.
  // Only fetch channel history for new (non-thread) messages.
  const isThreadReply = msgEvent.thread_ts && msgEvent.thread_ts !== msgEvent.ts;

  if (isThreadReply) {
    // Check if a prior session exists for this thread. If the original message
    // was never processed (e.g., due to rate limiting), there's no session to
    // resume — fetch the full thread history so the new session has context.
    const sessionKey = `slack-${channel}-${msgEvent.thread_ts}`;
    const hasSession = sessionExists(sessionKey);

    if (hasSession) {
      parts.push('## Thread reply\n');
      parts.push(`(Replying in thread ${msgEvent.thread_ts}. You have full context from the previous session via --resume.)\n`);
    } else {
      parts.push('## Thread reply (new session — no prior session found)\n');
      parts.push('The original message in this thread was never processed (likely due to rate limiting or an outage). ');
      parts.push('A new session is being created. Full thread history is included below for context.\n\n');
      parts.push('### Full thread history\n');
      parts.push(await buildThreadContext(channel, msgEvent.thread_ts));
      parts.push('');
    }
  } else {
    parts.push(`## Recent channel context (last ${config.contextCount} messages)\n`);
    parts.push(await buildContext(channel, config.contextCount));
    parts.push('');
  }

  // Message to handle
  parts.push('## Message to handle\n');
  parts.push(formatMessage(msgEvent));
  parts.push('\n---\n');

  // Prompt (inline template or file)
  if (config.inlineTemplate) {
    let rendered = config.inlineTemplate;
    rendered = rendered.replaceAll('{MSG_TEXT}', msgEvent.text || '(no text)');
    rendered = rendered.replaceAll('{CHANNEL}', channel);
    parts.push(rendered);
  } else if (config.promptFile) {
    try {
      parts.push(readFileSync(config.promptFile, 'utf8'));
    } catch (err) {
      logMain(`Failed to read prompt file ${config.promptFile}: ${err.message}`);
      parts.push('(Prompt file not found)');
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Provenance resolution (Slack user ID → display name, channel ID → name)
// ---------------------------------------------------------------------------

async function resolveUserName(userId) {
  try {
    const result = await slack.users.info({ user: userId });
    if (result.ok && result.user) {
      const profile = result.user.profile || {};
      // display_name can be "" (empty string) — check with .trim()
      const displayName = (profile.display_name || '').trim();
      const resolvedName = displayName || result.user.real_name || result.user.name || userId;
      logMain(`Provenance: resolved user ${userId} → "${resolvedName}" (display_name="${profile.display_name}", real_name="${result.user.real_name}", name="${result.user.name}")`);
      return `${resolvedName} (${userId})`;
    }
  } catch (err) {
    logMain(`Failed to resolve user ${userId}: ${err.message}`);
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Agent dispatch (durably enqueues work for the independent worker service)
// ---------------------------------------------------------------------------

function dispatchAgent(channel, ts, config, promptContent, provenance = {}, tKey = null, { providerOverride = '' } = {}) {
  // Write prompt to temp file (avoids shell quoting issues)
  const promptFile = join(tmpdir(), `slam-bot-prompt-${ts.replace('.', '_')}.md`);
  writeFileSync(promptFile, promptContent);

  const mode = config.workspace ? `workspace=${config.workspace}` : `slug=${config.commandSlug}`;
  const payload = {
    channel,
    slack_channel: channel,
    slack_ts: ts,
    thread_ts: tKey ? tKey.split(':')[1] : ts,
    command_slug: config.commandSlug,
    workspace: config.workspace || '',
    session_key: tKey ? `slack-${tKey.replace(':', '-')}` : '',
    prompt: '',
    prompt_file: promptFile,
    msg_ts: ts,
    priority: isPriorityChannel(channel) ? 'high' : 'normal',
    provider: providerOverride || '',
    fallback_provider: '',
    review_provider: '',
    model: '',
    effort: '',
    provenance_channel: provenance.channel || '',
    provenance_requester: provenance.requester || '',
    provenance_message: provenance.message || '',
    log_name: config.logName,
  };

  const proc = spawnSync('/usr/bin/python3', ['-m', 'bot_harness', 'jobs', 'enqueue'], {
    cwd: MWF_APP_DIR,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPATH: [join(SCRIPTS_DIR, 'lib'), process.env.PYTHONPATH].filter(Boolean).join(':'),
      BOT_SCRIPTS_DIR: SCRIPTS_DIR,
      SLAM_BOT: '1',
      PRIORITY: payload.priority,
      CHANNEL: channel,
    },
  });

  if (proc.status !== 0) {
    const detail = (proc.stderr || proc.stdout || '').trim();
    throw new Error(`failed to enqueue job for ${ts}: ${detail || `exit ${proc.status}`}`);
  }

  const jobId = (proc.stdout || '').trim();
  log(config.logName, `Enqueued agent job ${jobId || '(unknown)'} for ${ts} (${mode}${providerOverride ? `, provider=${providerOverride}` : ''})`);
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test-dashboard trigger — `@slam_paws test <scenario> [from-snapshot:<id>]`
// ---------------------------------------------------------------------------

const TEST_TRIGGER_RE = /^test\s+(\S+)/i;
const FROM_SNAPSHOT_RE = /from-snapshot:(\S+)/i;
const RUN_AND_PUBLISH = `${SCRIPTS_DIR}/run-and-publish.sh`;

/**
 * Parse a message text for the test-trigger command. Strips the bot mention
 * and any leading whitespace; returns { scenario, startingSnapshotId } or
 * null if it isn't a test command.
 */
function parseTestCommand(text) {
  if (!text) return null;
  const mentionPrefix = `<@${BOT_USER_ID}>`;
  if (!text.includes(mentionPrefix)) return null;
  const stripped = text.replace(mentionPrefix, '').trim();
  const m = stripped.match(TEST_TRIGGER_RE);
  if (!m) return null;
  // Reject "tests" / "testing" — only "test" exactly.
  const verb = stripped.match(/^(\w+)/)?.[1];
  if (verb && verb.toLowerCase() !== 'test') return null;
  const scenario = m[1];
  // Only treat as a scenario if it looks like a spec name (lowercase, dashes).
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(scenario)) return null;
  const snapMatch = stripped.match(FROM_SNAPSHOT_RE);
  return {
    scenario,
    startingSnapshotId: snapMatch ? snapMatch[1] : null,
  };
}

/**
 * If the message is a test trigger, claim it and spawn run-and-publish.sh
 * detached. Posts a starting reply to the thread, then a result reply when
 * the wrapper exits. Returns true if handled (caller should short-circuit
 * normal channel routing), false otherwise.
 */
async function tryHandleTestCommand(event) {
  const cmd = parseTestCommand(event.text);
  if (!cmd) return false;

  const { channel, ts, user } = event;
  const replyTs = event.thread_ts || ts;

  if (!claimMessage(channel, ts)) {
    logMain(`Test trigger: skipping already-claimed ${ts}`);
    return true;
  }

  const triggeredBy = user || 'slack-unknown';
  logMain(`Test trigger: scenario=${cmd.scenario} channel=${channel} user=${triggeredBy}`);

  await addReaction(channel, ts, 'eyes');
  try {
    await slack.chat.postMessage({
      channel,
      thread_ts: replyTs,
      text: `Running \`${cmd.scenario}\`${cmd.startingSnapshotId ? ` from snapshot \`${cmd.startingSnapshotId}\`` : ''}… result will appear here when the run completes.`,
    });
  } catch (err) {
    logMain(`Test trigger: failed to post starting reply: ${err.message}`);
  }

  const args = [cmd.scenario, '--trigger-source', 'slack', '--triggered-by', triggeredBy];
  if (cmd.startingSnapshotId) {
    args.push('--starting-snapshot-id', cmd.startingSnapshotId);
  }

  let stdoutBuf = '';
  const child = spawn(RUN_AND_PUBLISH, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.unref();

  child.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
  child.stderr.on('data', (d) => { stdoutBuf += d.toString(); });

  child.on('error', async (err) => {
    logMain(`Test trigger: spawn failed: ${err.message}`);
    await removeReaction(channel, ts, 'eyes');
    await addReaction(channel, ts, 'x');
    try {
      await slack.chat.postMessage({
        channel,
        thread_ts: replyTs,
        text: `❌ Could not launch \`${cmd.scenario}\`: ${err.message}`,
      });
    } catch { /* ignore */ }
  });

  child.on('exit', async (code) => {
    await removeReaction(channel, ts, 'eyes');
    await addReaction(channel, ts, code === 0 ? 'white_check_mark' : 'x');

    const viewMatch = stdoutBuf.match(/view:\s+(\S+)/);
    const url = viewMatch ? viewMatch[1] : null;
    const status = code === 0 ? '✅ pass' : '❌ fail';
    const text = url
      ? `${status}: \`${cmd.scenario}\`\n${url}`
      : `${status}: \`${cmd.scenario}\` (could not parse run URL — check /var/log/slam-bot/test-runs.log)`;

    try {
      await slack.chat.postMessage({ channel, thread_ts: replyTs, text });
    } catch (err) {
      logMain(`Test trigger: failed to post result reply: ${err.message}`);
    }
    logMain(`Test trigger: ${cmd.scenario} exited ${code}`);
  });

  return true;
}

async function handleMessageEvent(event) {
  // Only process actual message events (skip app_mention, reaction_added, etc.)
  if (event.type && event.type !== 'message') return;

  const { channel, user, ts, subtype, bot_id } = event;

  // Skip bot's own messages and bot messages
  if (user === BOT_USER_ID || bot_id) return;

  // Skip message subtypes we don't care about (edits, deletes, joins, etc.)
  if (subtype && subtype !== 'file_share') return;

  // ── Test-dashboard trigger ────────────────────────────────────────────────
  // `@slam_paws test <scenario>` short-circuits the normal channel routing
  // and runs an e2e scenario via run-and-publish.sh. Works in any channel
  // where the bot can read messages, including ones not in CHANNEL_CONFIG.
  if (await tryHandleTestCommand(event)) {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
    return;
  }

  // Check if this channel is configured
  const config = CHANNEL_CONFIG[channel];
  if (!config) return; // Not a monitored channel

  // Try to claim this message
  if (!claimMessage(channel, ts)) {
    log(config.logName, `Skipping already-claimed message ${ts}`);
    return;
  }

  logMain(`Claimed message ${ts} in ${config.logName} from user=${user}`);

  const tKey = threadKey(channel, event);

  // Add :hourglass_flowing_sand: while the durable worker owns scheduling.
  await addReaction(channel, ts, 'hourglass_flowing_sand');

  // Resolve provenance in parallel with prompt building
  const [promptContent, requesterName] = await Promise.all([
    buildPrompt(channel, config, event),
    user ? resolveUserName(user) : Promise.resolve('unknown'),
  ]);

  const provenance = {
    channel: config.channelName || channel,
    requester: requesterName,
    message: event.text || '(no text)',
  };

  const providerOverride = providerOverrideForMessage(event);
  if (providerOverride) {
    logMain(`Provider override: routing ${ts} through ${providerOverride} because message contains "codex"`);
  }

  try {
    dispatchAgent(channel, ts, config, promptContent, provenance, tKey, { providerOverride });
  } catch (err) {
    log(config.logName, `Failed to enqueue agent for ${ts}: ${err.message}`);
    await removeReaction(channel, ts, 'hourglass_flowing_sand');
    await addReaction(channel, ts, 'x');
  }

  // Update heartbeat
  writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Queue cancellation via ❌ reaction (#562)
// ---------------------------------------------------------------------------

/**
 * When a user adds ❌ (:x:) to a queued message (one with ⏳), find and remove
 * the corresponding queue file, then remove the ⏳ emoji.
 */
async function handleReactionAdded(event) {
  const { reaction, item } = event;

  // Only handle :x: reactions on messages
  if (reaction !== 'x') return;
  if (!item || item.type !== 'message') return;

  const channel = item.channel;
  const ts = item.ts;

  // Check if this message has the hourglass (queued) emoji — if not, it's not queued
  try {
    const result = await slack.reactions.get({ channel, timestamp: ts, full: true });
    if (!result.ok) return;

    const reactions = result.message?.reactions || [];
    const hasHourglass = reactions.some((r) => r.name === 'hourglass_flowing_sand');
    if (!hasHourglass) return;
  } catch (err) {
    logMain(`Cancel check: failed to read reactions for ${ts}: ${err.message}`);
    return;
  }

  // Find and cancel matching durable job and legacy queue file(s)
  let removed = 0;
  let cancelledJob = '';
  try {
    const proc = spawnSync('/usr/bin/python3', ['-m', 'bot_harness', 'jobs', 'cancel', channel, ts], {
      cwd: MWF_APP_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: [join(SCRIPTS_DIR, 'lib'), process.env.PYTHONPATH].filter(Boolean).join(':'),
        BOT_SCRIPTS_DIR: SCRIPTS_DIR,
      },
    });
    if (proc.status === 0) {
      cancelledJob = (proc.stdout || '').trim();
    } else {
      logMain(`Cancel: durable job cancel failed for ${ts}: ${(proc.stderr || proc.stdout || '').trim()}`);
    }
  } catch (err) {
    logMain(`Cancel: durable job cancel threw for ${ts}: ${err.message}`);
  }

  try {
    if (existsSync(QUEUE_DIR)) {
      const files = readdirSync(QUEUE_DIR).filter((f) => f.startsWith('queue-') && f.endsWith('.json'));
      for (const file of files) {
        const filePath = join(QUEUE_DIR, file);
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf8'));
          if (data.slack_channel === channel && data.slack_ts === ts) {
            unlinkSync(filePath);
            removed++;
            logMain(`Cancel: removed queue file ${file} for message ${ts} in ${channel}`);
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    logMain(`Cancel: error scanning queue dir: ${err.message}`);
  }

  // Remove the hourglass emoji
  await removeReaction(channel, ts, 'hourglass_flowing_sand');

  logMain(`Cancel: ❌ reaction on ${ts} in ${channel} — durable job ${cancelledJob || 'none'}, removed ${removed} legacy queue file(s)`);
}

// ---------------------------------------------------------------------------
// Socket Mode connection
// ---------------------------------------------------------------------------

socketClient.on('message', async ({ event, body, ack }) => {
  // Acknowledge the event immediately (Slack requires this within 3 seconds)
  await ack();

  // Update heartbeat on any event
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  } catch { /* ignore */ }

  if (event) {
    await handleMessageEvent(event);
  }
});

socketClient.on('reaction_added', async ({ event, body, ack }) => {
  await ack();

  // Update heartbeat on any event
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  } catch { /* ignore */ }

  if (event) {
    await handleReactionAdded(event);
  }
});

socketClient.on('connected', () => {
  logMain('Connected to Slack via Socket Mode');
  writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
});

socketClient.on('disconnected', () => {
  logMain('Disconnected from Slack Socket Mode — SDK will auto-reconnect');
});

socketClient.on('error', (err) => {
  logMain(`Socket Mode error: ${err.message}`);
});

// Periodic heartbeat so the watchdog knows we're alive during quiet periods
setInterval(() => {
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  } catch { /* ignore */ }
}, 5 * 60 * 1000); // every 5 minutes

// Graceful shutdown
function shutdown(signal) {
  logMain(`Received ${signal}, shutting down...`);
  socketClient.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

logMain('Starting Socket Mode listener...');
logMain(`Monitoring channels: ${Object.keys(CHANNEL_CONFIG).map((ch) => CHANNEL_CONFIG[ch].logName).join(', ')}`);
if (workspaceErrors.length > 0) {
  logMain(`WARNING: ${workspaceErrors.length} workspace(s) missing — messages to those channels will fail at agent startup`);
}

await socketClient.start();
