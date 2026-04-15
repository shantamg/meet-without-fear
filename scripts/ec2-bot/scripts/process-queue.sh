#!/bin/bash
# process-queue.sh — Process queued agent requests when system resources are available.
#
# Designed to run as a cron job every minute. Picks up the oldest queued request
# and dispatches it if resources are available.
#
# Queue directory: /opt/slam-bot/queue/
# Each queued request is a JSON file: queue-<timestamp>.json
# Fields: command_slug, prompt, prompt_file, msg_ts, channel,
#         provenance_channel, provenance_requester, provenance_message,
#         queued_at, slack_channel (for emoji), slack_ts (for emoji),
#         thread_ts (optional — thread parent ts for thread-aware ordering),
#         session_key (optional — Claude session key for thread continuity),
#         workspace (optional — workspace name for workspace-mode dispatch)

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPTS_DIR/lib/config.sh"
source "$SCRIPTS_DIR/lib/shared.sh"

QUEUE_DIR="$BOT_QUEUE_DIR"
LOGFILE="${BOT_LOG_DIR}/process-queue.log"

# Nothing to do if queue directory doesn't exist or is empty
if [ ! -d "$QUEUE_DIR" ]; then
  exit 0
fi

# Get the highest-priority queued request.
# Priority order: high > normal > low, then FIFO within each level.
# Queue filenames include nanosecond timestamps, so sort gives FIFO.
# Uses jq to read priority from JSON (handles any formatting).
NEXT=""
for PRIO in high normal low; do
  for f in "$QUEUE_DIR"/queue-*.json; do
    [ -f "$f" ] || continue
    if [ "$(jq -r '.priority // "normal"' "$f" 2>/dev/null)" = "$PRIO" ]; then
      NEXT="$f"
      break
    fi
  done
  [ -n "$NEXT" ] && break
done

# Fallback: if no files matched (empty queue or all lack priority), use plain FIFO
if [ -z "$NEXT" ]; then
  NEXT=$(find "$QUEUE_DIR" -name "queue-*.json" -type f 2>/dev/null | sort | head -1)
fi

if [ -z "$NEXT" ]; then
  exit 0
fi
OLDEST="$NEXT"

# Check resources before processing
if ! "$SCRIPTS_DIR/check-resources.sh" > /dev/null 2>&1; then
  echo "[$(date)] Resources still insufficient, keeping $(find "$QUEUE_DIR" -name "queue-*.json" -type f 2>/dev/null | wc -l) items queued" >> "$LOGFILE"
  exit 0
fi

# Parse the queued request
COMMAND_SLUG=$(jq -r '.command_slug // empty' "$OLDEST")
PROMPT=$(jq -r '.prompt // empty' "$OLDEST")
PROMPT_FILE=$(jq -r '.prompt_file // empty' "$OLDEST")
MSG_TS=$(jq -r '.msg_ts // empty' "$OLDEST")
CHANNEL=$(jq -r '.channel // empty' "$OLDEST")
PROVENANCE_CHANNEL=$(jq -r '.provenance_channel // empty' "$OLDEST")
PROVENANCE_REQUESTER=$(jq -r '.provenance_requester // empty' "$OLDEST")
PROVENANCE_MESSAGE=$(jq -r '.provenance_message // empty' "$OLDEST")
SLACK_CHANNEL=$(jq -r '.slack_channel // empty' "$OLDEST")
SLACK_TS=$(jq -r '.slack_ts // empty' "$OLDEST")
QUEUED_AT=$(jq -r '.queued_at // empty' "$OLDEST")
PRIORITY=$(jq -r '.priority // "normal"' "$OLDEST")
THREAD_TS=$(jq -r '.thread_ts // empty' "$OLDEST")
SESSION_KEY=$(jq -r '.session_key // empty' "$OLDEST")
WORKSPACE=$(jq -r '.workspace // empty' "$OLDEST")
QUEUE_MODEL=$(jq -r '.model // empty' "$OLDEST")
RETRIES=$(jq -r '.retries // 0' "$OLDEST" 2>/dev/null || echo "0")
export PRIORITY

# Alias for create_queue_entry (shared.sh reads WORKSPACE_NAME, not WORKSPACE)
WORKSPACE_NAME="$WORKSPACE"

if [ -z "$COMMAND_SLUG" ]; then
  echo "[$(date)] Invalid queue entry (no command_slug), removing: $OLDEST" >> "$LOGFILE"
  rm -f "$OLDEST"
  exit 0
fi

# --- Cancellation check (#562) ---
# Before processing, verify the message hasn't been cancelled (deleted or ❌ reacted)
if [ -n "$SLACK_CHANNEL" ] && [ -n "$SLACK_TS" ]; then
  # Secrets already loaded by config.sh
  if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    # Check if the original message still exists
    MSG_CHECK=$(curl -s -X GET \
      "https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&oldest=${SLACK_TS}&latest=${SLACK_TS}&inclusive=true&limit=1" \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" 2>/dev/null || echo '{}')

    MSG_COUNT=$(echo "$MSG_CHECK" | jq -r '.messages | length // 0' 2>/dev/null || echo "0")

    if [ "$MSG_COUNT" = "0" ] || [ "$MSG_COUNT" = "null" ]; then
      echo "[$(date)] CANCELLED $COMMAND_SLUG — original message deleted (channel=$SLACK_CHANNEL ts=$SLACK_TS)" >> "$LOGFILE"
      rm -f "$OLDEST"
      exit 0
    fi

    # Check if the message has a ❌ (x) reaction — user wants to cancel
    REACTIONS=$(echo "$MSG_CHECK" | jq -r '.messages[0].reactions // []' 2>/dev/null)
    HAS_CANCEL=$(echo "$REACTIONS" | jq -r '[.[] | select(.name == "x")] | length' 2>/dev/null || echo "0")

    if [ "$HAS_CANCEL" != "0" ] && [ "$HAS_CANCEL" != "null" ]; then
      echo "[$(date)] CANCELLED $COMMAND_SLUG — ❌ reaction found (channel=$SLACK_CHANNEL ts=$SLACK_TS)" >> "$LOGFILE"
      # Remove the hourglass emoji to indicate cancellation
      curl -s -X POST https://slack.com/api/reactions.remove \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg ch "$SLACK_CHANNEL" --arg ts "$SLACK_TS" \
          '{channel: $ch, timestamp: $ts, name: "hourglass_flowing_sand"}')" > /dev/null 2>&1 || true
      rm -f "$OLDEST"
      exit 0
    fi
  fi
fi
# --- End cancellation check ---

# Remove the queue file BEFORE any dispatch/re-queue logic to prevent double-processing.
# The re-queue path below creates a NEW file if it needs to defer, so the original must go.
rm -f "$OLDEST"

# --- TTL and retry checks ---
MAX_RETRIES="$MAX_QUEUE_RETRIES"
QUEUE_TTL_MIN="$QUEUE_TTL_MINUTES"

# Check retry limit
if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
  echo "[$(date)] DISCARDED $COMMAND_SLUG — exceeded max retries ($RETRIES/$MAX_RETRIES)" >> "$LOGFILE"
  exit 0
fi

# Check TTL
if [ -n "$QUEUED_AT" ] && [ "$QUEUED_AT" != "null" ]; then
  QUEUED_EPOCH=$(date -d "$QUEUED_AT" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$QUEUED_AT" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  if [ "$QUEUED_EPOCH" -gt 0 ]; then
    QUEUE_AGE_MIN=$(( (NOW_EPOCH - QUEUED_EPOCH) / 60 ))
    if [ "$QUEUE_AGE_MIN" -ge "$QUEUE_TTL_MIN" ]; then
      echo "[$(date)] DISCARDED $COMMAND_SLUG — exceeded TTL (${QUEUE_AGE_MIN}m > ${QUEUE_TTL_MIN}m)" >> "$LOGFILE"
      exit 0
    fi
  fi
fi
# --- End TTL and retry checks ---

# Thread-aware deferral: if this queued item belongs to a thread and an agent
# is already active on the same thread, re-queue it so it runs after the
# active agent finishes — prevents parallel work on the same conversation.
if [ -n "$THREAD_TS" ] && [ -n "$CHANNEL" ]; then
  # ACTIVE_DIR provided by config.sh
  THREAD_BUSY=false
  for agent_dir in "$ACTIVE_DIR"/agent-*; do
    [ -d "$agent_dir" ] || continue
    pid=$(basename "$agent_dir" | sed 's/^agent-//')
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      AGENT_CHANNEL=$(jq -r '.channel // empty' "$agent_dir/meta.json" 2>/dev/null || echo "")
      AGENT_MSG_TS=$(jq -r '.messageTs // empty' "$agent_dir/meta.json" 2>/dev/null || echo "")
      # An agent is working on this thread if it's on the same channel and
      # its message ts matches our thread_ts (parent message) or its own
      # thread context matches.
      if [ "$AGENT_CHANNEL" = "$CHANNEL" ] && [ "$AGENT_MSG_TS" = "$THREAD_TS" ]; then
        THREAD_BUSY=true
        break
      fi
    fi
  done

  if [ "$THREAD_BUSY" = "true" ]; then
    echo "[$(date)] Deferring $COMMAND_SLUG — thread $THREAD_TS in $CHANNEL has active agent (retry $((RETRIES + 1)))" >> "$LOGFILE"
    RETRIES=$((RETRIES + 1)) create_queue_entry "$QUEUE_DIR" > /dev/null
    exit 0
  fi
fi

# Enforce slot reservation for low-priority items: scheduled jobs can only use
# (MAX_CONCURRENT - RESERVED_INTERACTIVE_SLOTS) slots, matching the dispatcher's limit.
if [ "$PRIORITY" = "low" ]; then
  # MAX_CONCURRENT and RESERVED_INTERACTIVE_SLOTS provided by config.sh
  SCHED_MAX=$((MAX_CONCURRENT - RESERVED_INTERACTIVE_SLOTS))

  RUNNING=$(count_running_agents)

  if [ "$RUNNING" -ge "$SCHED_MAX" ]; then
    echo "[$(date)] Deferring low-priority $COMMAND_SLUG — $RUNNING agents running (scheduled max $SCHED_MAX) (retry $((RETRIES + 1)))" >> "$LOGFILE"
    RETRIES=$((RETRIES + 1)) create_queue_entry "$QUEUE_DIR" > /dev/null
    exit 0
  fi
fi

echo "[$(date)] Processing queued request: $COMMAND_SLUG (priority=$PRIORITY, queued at $QUEUED_AT)" >> "$LOGFILE"

# Remove clock emoji and add eyes emoji on Slack message if applicable
if [ -n "$SLACK_CHANNEL" ] && [ -n "$SLACK_TS" ]; then
  # Secrets already loaded by config.sh
  if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    # Remove hourglass_flowing_sand and zzz (rate-limited messages use zzz), add eyes
    curl -s -X POST https://slack.com/api/reactions.remove \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$SLACK_CHANNEL" --arg ts "$SLACK_TS" \
        '{channel: $ch, timestamp: $ts, name: "hourglass_flowing_sand"}')" > /dev/null 2>&1 || true
    curl -s -X POST https://slack.com/api/reactions.remove \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$SLACK_CHANNEL" --arg ts "$SLACK_TS" \
        '{channel: $ch, timestamp: $ts, name: "zzz"}')" > /dev/null 2>&1 || true
    curl -s -X POST https://slack.com/api/reactions.add \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$SLACK_CHANNEL" --arg ts "$SLACK_TS" \
        '{channel: $ch, timestamp: $ts, name: "eyes"}')" > /dev/null 2>&1 || true
  fi
fi

# Dispatch via run-claude.sh
export CHANNEL="${CHANNEL}"
export PROVENANCE_CHANNEL="${PROVENANCE_CHANNEL}"
export PROVENANCE_REQUESTER="${PROVENANCE_REQUESTER}"
export PROVENANCE_MESSAGE="${PROVENANCE_MESSAGE}"

# Build args: workspace mode or command-slug mode, with optional session
DISPATCH_ARGS=()
if [ -n "$WORKSPACE" ]; then
  DISPATCH_ARGS+=(--workspace "$WORKSPACE")
fi
if [ -n "$SESSION_KEY" ]; then
  DISPATCH_ARGS+=(--session "$SESSION_KEY")
fi
if [ -n "$WORKSPACE" ]; then
  # Workspace mode: positional args are PROMPT PROMPT_FILE MSG_TS
  DISPATCH_ARGS+=("$PROMPT" "$PROMPT_FILE" "$MSG_TS")
else
  # Command-slug mode: COMMAND_SLUG PROMPT PROMPT_FILE MSG_TS
  DISPATCH_ARGS+=("$COMMAND_SLUG" "$PROMPT" "$PROMPT_FILE" "$MSG_TS")
fi

MODEL="$QUEUE_MODEL" nohup "$SCRIPTS_DIR/run-claude.sh" "${DISPATCH_ARGS[@]}" \
  >> "$LOGFILE" 2>&1 &

echo "[$(date)] Dispatched queued $COMMAND_SLUG (PID $!)" >> "$LOGFILE"

# Count remaining items
REMAINING=$(find "$QUEUE_DIR" -name "queue-*.json" -type f 2>/dev/null | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo "[$(date)] $REMAINING items still in queue" >> "$LOGFILE"
fi
