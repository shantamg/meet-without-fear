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
 *   6. Spawn run-claude.sh as background process
 *   7. On completion: remove :eyes:, add :white_check_mark:
 *      - Exit code 75/76: rate limited → add :zzz: instead of :white_check_mark:
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
 *   MWF_SESSIONS_CHANNEL_ID — Channel ID for the #mwf-sessions channel
 */

import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { spawn, execSync } from 'node:child_process';
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
const BUGS_AND_REQUESTS_CHANNEL = process.env.BUGS_AND_REQUESTS_CHANNEL_ID;
const MWF_SESSIONS_CHANNEL = process.env.MWF_SESSIONS_CHANNEL_ID;

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

// Health check: write last event timestamp so the watchdog can verify liveness
const HEARTBEAT_FILE = join(STATE_DIR, 'socket-mode-heartbeat.txt');

// Ensure directories exist
mkdirSync(CLAIMS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Thread-aware queuing — thread replies wait for parent agent
// ---------------------------------------------------------------------------

/**
 * Tracks active agents by thread. Key = "channel:thread_ts".
 * Value = { channel, ts, config, child } of the running agent.
 * @type {Map<string, object>}
 */
const activeThreadAgents = new Map();

/**
 * Queued thread replies waiting for the active agent to finish.
 * Key = "channel:thread_ts". Value = array of { event, config } objects.
 * @type {Map<string, Array<{event: object, config: object}>>}
 */
const threadQueue = new Map();

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
 *   2. Workspace mode (new): uses `workspace` — run-claude.sh cds into bot-workspaces/<name>/
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

// #mwf-sessions channel — MWF test session threads
if (MWF_SESSIONS_CHANNEL) {
  CHANNEL_CONFIG[MWF_SESSIONS_CHANNEL] = {
    logName: 'check-mwf-sessions',
    channelName: '#mwf-sessions',
    commandSlug: 'mwf-session-reply',
    workspace: 'mwf-session',
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

  // MWF session routing: pass thread context for session/state lookup
  if (config.workspace === 'mwf-session') {
    const threadTs = msgEvent.thread_ts || msgEvent.ts;
    const entryStage = isThreadReply ? 'route' : '0-onboarding';
    parts.push('## MWF Session Routing\n');
    parts.push(`Entry Stage: \`${entryStage}\``);
    parts.push(`Workspace: mwf-session`);
    parts.push(`Channel ID: ${channel}`);
    parts.push(`Thread TS: ${threadTs}`);
    parts.push(`Thread Key: ${channel}:${threadTs}`);
    if (msgEvent.user) {
      parts.push(`User ID: ${msgEvent.user}`);
    }
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
// Agent dispatch (spawns run-claude.sh as background process)
// ---------------------------------------------------------------------------

function dispatchAgent(channel, ts, config, promptContent, provenance = {}, tKey = null) {
  // Write prompt to temp file (avoids shell quoting issues)
  const promptFile = join(tmpdir(), `slam-bot-prompt-${ts.replace('.', '_')}.md`);
  writeFileSync(promptFile, promptContent);

  // Build args based on mode: workspace or command-slug (legacy)
  // Thread replies get --session for continuity (same thread = same Claude session)
  let args;
  const sessionArgs = [];
  if (tKey) {
    const [sessionChannel, sessionThreadTs] = tKey.split(':');
    sessionArgs.push('--session', `slack-${sessionChannel}-${sessionThreadTs}`);
  }

  if (config.workspace) {
    // Workspace mode: --workspace <name> [--session <key>] <PROMPT> <PROMPT_FILE> <MSG_TS>
    args = ['--workspace', config.workspace, ...sessionArgs, '', promptFile, ts];
  } else {
    // Command-slug mode (legacy): [--session <key>] <COMMAND_SLUG> <PROMPT> <PROMPT_FILE> <MSG_TS>
    args = [...sessionArgs, config.commandSlug, '', promptFile, ts];
  }

  const env = {
    ...process.env,
    SLAM_BOT: '1',
    PRIORITY: 'high',
    CHANNEL: channel,
    PROVENANCE_CHANNEL: provenance.channel || '',
    PROVENANCE_REQUESTER: provenance.requester || '',
    PROVENANCE_MESSAGE: provenance.message || '',
  };

  // MWF session thread context for state file lookup
  if (config.workspace === 'mwf-session' && tKey) {
    const threadTs = tKey.split(':')[1] || '';
    env.MWF_THREAD_TS = threadTs;
    env.MWF_CHANNEL = channel;
    env.MWF_ENTRY_STAGE = threadTs === ts ? '0-onboarding' : 'route';
  }

  const child = spawn(
    join(SCRIPTS_DIR, 'run-claude.sh'),
    args,
    {
      cwd: MWF_APP_DIR,
      stdio: 'ignore',
      detached: true,
      env,
    }
  );

  child.unref();

  // Track this agent as active for its thread
  if (tKey) {
    activeThreadAgents.set(tKey, { channel, ts, config, pid: child.pid });
  }

  const mode = config.workspace ? `workspace=${config.workspace}` : `slug=${config.commandSlug}`;
  child.on('exit', async (code) => {
    log(config.logName, `Agent for ${ts} (${mode}) exited with code ${code}`);
    await removeReaction(channel, ts, 'eyes');

    if (code === 0) {
      await addReaction(channel, ts, 'white_check_mark');
    } else if (code === 75 || code === 76) {
      await addReaction(channel, ts, 'zzz');
    } else {
      await addReaction(channel, ts, 'x');
    }

    // Thread queue drain: when this agent finishes, dispatch the next
    // queued reply for the same thread (if any).
    if (tKey) {
      activeThreadAgents.delete(tKey);
      drainThreadQueue(tKey);
    }
  });

  log(config.logName, `Dispatched agent for ${ts} (PID ${child.pid}, ${mode})`);
}

/**
 * Drain the next queued thread reply for the given thread key.
 * Called when an agent exits for that thread.
 */
async function drainThreadQueue(tKey) {
  const queue = threadQueue.get(tKey);
  if (!queue || queue.length === 0) {
    threadQueue.delete(tKey);
    return;
  }

  const next = queue.shift();
  if (queue.length === 0) {
    threadQueue.delete(tKey);
  }

  const { event, config } = next;
  const channel = event.channel;
  const ts = event.ts;

  logMain(`Draining thread queue for ${tKey}: dispatching queued reply ${ts} (${queue?.length || 0} remaining)`);

  // Add :eyes: reaction (the :hourglass_flowing_sand: was added when queued)
  await removeReaction(channel, ts, 'hourglass_flowing_sand');
  await addReaction(channel, ts, 'eyes');

  // Build prompt and provenance for the queued message
  const [promptContent, requesterName] = await Promise.all([
    buildPrompt(channel, config, event),
    event.user ? resolveUserName(event.user) : Promise.resolve('unknown'),
  ]);

  const provenance = {
    channel: config.channelName || channel,
    requester: requesterName,
    message: event.text || '(no text)',
  };

  dispatchAgent(channel, ts, config, promptContent, provenance, tKey);
}

// ---------------------------------------------------------------------------
// MWF session detection — check if a DM thread is an active MWF session
// ---------------------------------------------------------------------------

const THREAD_INDEX_PATH = join(MWF_APP_DIR, 'data', 'mwf-sessions', 'thread-index.json');

/**
 * Check if a DM message belongs to an active MWF session.
 * Reads thread-index.json and looks for a matching {channel}:{thread_ts} key.
 * Returns the session ID if found, null otherwise.
 */
function checkMwfSessionThread(channel, threadTs) {
  if (!threadTs) return null;
  try {
    const index = JSON.parse(readFileSync(THREAD_INDEX_PATH, 'utf8'));
    const key = `${channel}:${threadTs}`;
    return index[key] || null;
  } catch {
    return null; // File doesn't exist yet or is unreadable
  }
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

async function handleMessageEvent(event) {
  // Only process actual message events (skip app_mention, reaction_added, etc.)
  if (event.type && event.type !== 'message') return;

  const { channel, user, ts, subtype, bot_id } = event;

  // Skip bot's own messages and bot messages
  if (user === BOT_USER_ID || bot_id) return;

  // Skip message subtypes we don't care about (edits, deletes, joins, etc.)
  if (subtype && subtype !== 'file_share') return;

  // Check if this channel is configured
  let config = CHANNEL_CONFIG[channel];

  // Session-aware DM routing: if this is a DM that matches an active MWF
  // session thread, route to mwf-session workspace instead of slack-triage.
  if (config && config.workspace === 'slack-triage') {
    const threadTs = event.thread_ts || event.ts;
    const sessionId = checkMwfSessionThread(channel, threadTs);
    if (sessionId) {
      config = {
        ...config,
        logName: 'check-mwf-session',
        commandSlug: 'mwf-session-reply',
        workspace: 'mwf-session',
      };
      logMain(`DM message ${ts} matched MWF session ${sessionId} — routing to mwf-session`);
    }
  }

  if (!config) return; // Not a monitored channel

  // Try to claim this message
  if (!claimMessage(channel, ts)) {
    log(config.logName, `Skipping already-claimed message ${ts}`);
    return;
  }

  logMain(`Claimed message ${ts} in ${config.logName} from user=${user}`);

  // Thread-aware queuing: if an agent is already working on this thread,
  // queue this message instead of dispatching immediately.
  const tKey = threadKey(channel, event);
  if (activeThreadAgents.has(tKey)) {
    logMain(`Thread ${tKey} has active agent — queuing reply ${ts}`);
    if (!threadQueue.has(tKey)) {
      threadQueue.set(tKey, []);
    }
    threadQueue.get(tKey).push({ event, config });

    // Add :hourglass_flowing_sand: to indicate the message is queued
    await addReaction(channel, ts, 'hourglass_flowing_sand');

    // Update heartbeat
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
    return;
  }

  // Mark thread as active IMMEDIATELY (synchronously) to prevent race conditions.
  // Without this, rapid-fire messages can slip through the activeThreadAgents check
  // because buildPrompt/resolveUserName are async and the map isn't set until
  // dispatchAgent completes.
  activeThreadAgents.set(tKey, { channel, ts, config, pid: null });

  // Add :eyes: reaction
  await addReaction(channel, ts, 'eyes');

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

  // Dispatch Claude agent (tracked by thread key — updates the pid set above)
  dispatchAgent(channel, ts, config, promptContent, provenance, tKey);

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

  // Find and remove matching queue file(s)
  let removed = 0;
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

  logMain(`Cancel: ❌ reaction on ${ts} in ${channel} — removed ${removed} queue file(s)`);
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
