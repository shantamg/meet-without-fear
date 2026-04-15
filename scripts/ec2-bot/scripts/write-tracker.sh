#!/bin/bash
# write-tracker.sh — Create/update per-thread JSON tracker files for the
# Slack thread follow-up system.
#
# Usage:
#   write-tracker.sh \
#     --channel CHANNEL_ID \
#     --thread-ts THREAD_TS \
#     --linked-issue 1234 \           # optional
#     --linked-pr 5678 \              # optional
#     --bot-reply-ts BOT_REPLY_TS \
#     --human-message "original text" \
#     --bot-reply "bot response text" \
#     --user-id U08PFKEP50X \          # optional — Slack user ID for daily cap tracking
#     --skip-if-no-artifact            # only create if linked-issue or linked-pr provided
#
# Behavior:
#   - Creates /opt/slam-bot/state/thread-tracker/ if it doesn't exist
#   - If tracker file exists, updates last_bot_reply_ts, bot_first_reply, follow_up_count
#   - --skip-if-no-artifact: exit 0 without creating if neither linked-issue nor linked-pr
#   - Always exits 0 (fire-and-forget)
#   - Truncates human-message and bot-reply to ~1200 chars (~300 tokens) each

set -uo pipefail

# Source config for BOT_STATE_DIR
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/config.sh" ]; then
  source "$SCRIPT_DIR/lib/config.sh"
fi

TRACKER_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/thread-tracker"
MAX_TEXT_LEN=1200   # ~300 tokens at ~4 chars/token

# ── Parse arguments ──────────────────────────────────────────────────────────
CHANNEL=""
THREAD_TS=""
LINKED_ISSUE=""
LINKED_PR=""
BOT_REPLY_TS=""
HUMAN_MESSAGE=""
BOT_REPLY=""
USER_ID=""
SKIP_IF_NO_ARTIFACT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)        CHANNEL="$2";        shift 2 ;;
    --thread-ts)      THREAD_TS="$2";      shift 2 ;;
    --linked-issue)   LINKED_ISSUE="$2";   shift 2 ;;
    --linked-pr)      LINKED_PR="$2";      shift 2 ;;
    --bot-reply-ts)   BOT_REPLY_TS="$2";   shift 2 ;;
    --human-message)  HUMAN_MESSAGE="$2";  shift 2 ;;
    --bot-reply)      BOT_REPLY="$2";      shift 2 ;;
    --user-id)        USER_ID="$2";        shift 2 ;;
    --skip-if-no-artifact) SKIP_IF_NO_ARTIFACT=true; shift ;;
    *)
      echo "Warning: Unknown argument: $1" >&2
      shift
      ;;
  esac
done

# ── Validate required args ───────────────────────────────────────────────────
if [ -z "$CHANNEL" ] || [ -z "$THREAD_TS" ]; then
  echo "Error: --channel and --thread-ts are required" >&2
  exit 0  # fire-and-forget: always exit 0
fi

# ── Skip-if-no-artifact check ───────────────────────────────────────────────
if [ "$SKIP_IF_NO_ARTIFACT" = true ] && [ -z "$LINKED_ISSUE" ] && [ -z "$LINKED_PR" ]; then
  exit 0
fi

# ── Ensure tracker directory exists ──────────────────────────────────────────
mkdir -p "$TRACKER_DIR"

# ── Truncate helper ──────────────────────────────────────────────────────────
truncate_text() {
  local text="$1"
  local max="$2"
  if [ "${#text}" -gt "$max" ]; then
    echo "${text:0:$max}..."
  else
    echo "$text"
  fi
}

HUMAN_MESSAGE_TRUNC="$(truncate_text "$HUMAN_MESSAGE" "$MAX_TEXT_LEN")"
BOT_REPLY_TRUNC="$(truncate_text "$BOT_REPLY" "$MAX_TEXT_LEN")"

# ── Build tracker file path ──────────────────────────────────────────────────
TRACKER_FILE="${TRACKER_DIR}/${CHANNEL}-${THREAD_TS}.json"

# ── Create or update ─────────────────────────────────────────────────────────
if [ -f "$TRACKER_FILE" ]; then
  # Update existing tracker: bump follow_up_count, update bot reply fields
  UPDATED=$(jq \
    --arg bot_reply_ts "$BOT_REPLY_TS" \
    --arg bot_reply "$BOT_REPLY_TRUNC" \
    --arg linked_issue "$LINKED_ISSUE" \
    --arg linked_pr "$LINKED_PR" \
    '
    .last_bot_reply_ts = $bot_reply_ts |
    .follow_up_count = (.follow_up_count + 1) |
    (if $bot_reply != "" then .bot_first_reply = $bot_reply else . end) |
    (if $linked_issue != "" then .linked_issue = ($linked_issue | tonumber) else . end) |
    (if $linked_pr != "" then .linked_pr = ($linked_pr | tonumber) else . end)
    ' "$TRACKER_FILE")

  echo "$UPDATED" > "$TRACKER_FILE"
else
  # Create new tracker file
  jq -n \
    --arg channel "$CHANNEL" \
    --arg thread_ts "$THREAD_TS" \
    --arg linked_issue "$LINKED_ISSUE" \
    --arg linked_pr "$LINKED_PR" \
    --arg bot_reply_ts "$BOT_REPLY_TS" \
    --arg status "open" \
    --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg human_message "$HUMAN_MESSAGE_TRUNC" \
    --arg bot_reply "$BOT_REPLY_TRUNC" \
    --arg user_id "$USER_ID" \
    '{
      channel: $channel,
      thread_ts: $thread_ts,
      linked_issue: (if $linked_issue != "" then ($linked_issue | tonumber) else null end),
      linked_pr: (if $linked_pr != "" then ($linked_pr | tonumber) else null end),
      last_bot_reply_ts: $bot_reply_ts,
      status: $status,
      created_at: $created_at,
      follow_up_count: 0,
      original_human_message: $human_message,
      bot_first_reply: $bot_reply,
      user_id: (if $user_id != "" then $user_id else null end)
    }' > "$TRACKER_FILE"
fi

exit 0
