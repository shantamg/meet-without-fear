#!/bin/bash
# slack-lib.sh — Shared library for Slack-triggered bot scripts
# Provides unified message ingestion, per-message claiming, and context feeding.
#
# Usage in check-slack-*.sh scripts:
#   source /opt/slam-bot/scripts/slack-lib.sh
#   slack_check_channel "CHANNEL_ID" "channel-name" "command-slug" "/path/to/prompt.md" [context_count]
#
# Or for DM-style (inline prompt per message):
#   slack_check_channel "CHANNEL_ID" "dm-name" "command-slug" "" 10 "template with {MSG_TEXT} and {CHANNEL}"
#
# Architecture:
#   Every tick, slack_ingest_messages makes ONE conversations.history call (with a
#   10-minute lookback floor to catch thread parents), then calls conversations.replies
#   for any threaded parents found. All messages — top-level and replies — flow into a
#   single array. The claim mechanism (atomic file creation) is the sole dedup layer.
#   No separate thread tracking, no TTLs, no special state files.

STATE_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}"
CLAIMS_DIR="${CLAIMS_DIR:-$STATE_DIR/claims}"
LOGDIR="${BOT_LOG_DIR:-/var/log/slam-bot}"

mkdir -p "$CLAIMS_DIR"

# Unified message ingestion: fetch all new messages (top-level + thread replies)
# in a single pass. Uses conversations.history with a 10-minute lookback floor
# to ensure thread parents are re-discovered even if their top-level message
# was already watermarked past. Thread replies are fetched via conversations.replies
# for any parent with reply_count > 0. All messages are deduped by ts.
#
# Sets: ALL_MESSAGES (json array), MSG_COUNT (int), NEWEST_TS (string)
# Returns 1 if no new messages or API error.
slack_ingest_messages() {
  local CHANNEL="$1"
  local LOG_NAME="$2"

  local LAST_TS_FILE="$STATE_DIR/slack-last-ts-${CHANNEL}.txt"
  local WATERMARK
  WATERMARK=$(cat "$LAST_TS_FILE" 2>/dev/null || echo "0")

  # 10-minute lookback floor: always scan at least 10 minutes back so we
  # re-discover thread parents that may have new replies. The claim mechanism
  # prevents reprocessing — the only cost is a slightly larger API response.
  local FLOOR
  FLOOR=$(awk "BEGIN { printf \"%.6f\", $(date +%s) - 600 }")
  local OLDEST
  if awk "BEGIN { exit ($WATERMARK > $FLOOR) ? 0 : 1 }" 2>/dev/null; then
    OLDEST="$WATERMARK"
  else
    OLDEST="$FLOOR"
  fi

  # Single conversations.history call
  local RESPONSE
  RESPONSE=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    "https://slack.com/api/conversations.history?channel=${CHANNEL}&oldest=${OLDEST}&limit=100")

  if ! echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
    echo "[$(date)] Slack API error for $CHANNEL: $(echo "$RESPONSE" | jq -r '.error // "unknown"')" >> "$LOGDIR/${LOG_NAME}.log"
    ALL_MESSAGES="[]"
    MSG_COUNT=0
    return 1
  fi

  # Extract top-level messages (excluding bot's own)
  local TOP_LEVEL
  TOP_LEVEL=$(echo "$RESPONSE" | jq -c --arg bot "$SLAM_BOT_USER_ID" \
    '[.messages[] | select(.user != $bot)]')

  # Track the newest ts for watermark update (will be written AFTER processing)
  NEWEST_TS=$(echo "$RESPONSE" | jq -r '[.messages[].ts] | max // empty')

  # Find threaded parents (reply_count > 0) and fetch their replies
  local REPLY_TMP
  REPLY_TMP=$(mktemp /tmp/slam-bot-thread-replies-XXXXXX.json)
  echo "[]" > "$REPLY_TMP"

  # Use process substitution to avoid subshell variable propagation bugs
  while IFS= read -r PARENT_TS; do
    [ -z "$PARENT_TS" ] && continue

    local REPLIES_RESP
    REPLIES_RESP=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      "https://slack.com/api/conversations.replies?channel=${CHANNEL}&ts=${PARENT_TS}&limit=100")

    if ! echo "$REPLIES_RESP" | jq -e '.ok' >/dev/null 2>&1; then
      continue
    fi

    # Get replies (exclude the parent message itself and bot's own messages)
    # Tag each reply with thread_ts so downstream knows to reply in-thread
    local NEW_REPLIES
    NEW_REPLIES=$(echo "$REPLIES_RESP" | jq -c --arg parent "$PARENT_TS" --arg bot "$SLAM_BOT_USER_ID" \
      '[.messages[] | select(.ts != $parent and .user != $bot) | . + {thread_ts: $parent}]')

    # Merge into accumulated replies
    jq -s 'add' "$REPLY_TMP" <(echo "$NEW_REPLIES") > "${REPLY_TMP}.tmp"
    mv "${REPLY_TMP}.tmp" "$REPLY_TMP"
  done < <(echo "$RESPONSE" | jq -r '.messages[] | select(.reply_count != null and .reply_count > 0) | .ts')

  local THREAD_REPLIES
  THREAD_REPLIES=$(cat "$REPLY_TMP")
  rm -f "$REPLY_TMP"

  # Combine top-level + thread replies, deduplicate by ts
  ALL_MESSAGES=$(echo "$TOP_LEVEL" "$THREAD_REPLIES" | jq -s 'add | unique_by(.ts)')
  MSG_COUNT=$(echo "$ALL_MESSAGES" | jq 'length')

  if [ "$MSG_COUNT" -eq 0 ]; then
    return 1
  fi

  echo "[$(date)] $MSG_COUNT message(s) ingested from $LOG_NAME" >> "$LOGDIR/${LOG_NAME}.log"
  return 0
}

# Try to claim a message timestamp. Uses atomic file creation.
# Returns 0 if claimed, 1 if already claimed.
slack_claim_message() {
  local CHANNEL="$1"
  local MSG_TS="$2"

  local CLAIM_FILE="$CLAIMS_DIR/claimed-${CHANNEL}-${MSG_TS}.txt"

  # Atomic claim: create file only if it doesn't exist
  if ( set -o noclobber; echo "$$" > "$CLAIM_FILE" ) 2>/dev/null; then
    return 0
  fi
  return 1
}

# Fetch N recent messages from a channel as context (formatted text).
# Writes context to a temp file and prints its path.
slack_build_context() {
  local CHANNEL="$1"
  local COUNT="${2:-10}"
  local CONTEXT_FILE
  CONTEXT_FILE=$(mktemp /tmp/slam-bot-context-XXXXXX.txt)

  local RESPONSE
  RESPONSE=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    "https://slack.com/api/conversations.history?channel=${CHANNEL}&limit=${COUNT}")

  if ! echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
    echo "(Could not fetch channel context)" > "$CONTEXT_FILE"
    echo "$CONTEXT_FILE"
    return
  fi

  # Format messages as readable context (newest last = reversed)
  # Include file metadata when files are attached
  echo "$RESPONSE" | jq -r '
    .messages | reverse | .[] |
    "[\(.ts)] <\(.user // "unknown")>: \(.text // "(no text)")" +
    (if (.files // [] | length) > 0 then
      "\n  [Attached files: " + ([.files[] | "\(.name // "unnamed") (\(.mimetype // "unknown"))"] | join(", ")) + "]"
    else "" end)
  ' > "$CONTEXT_FILE"

  echo "$CONTEXT_FILE"
}

# Build a combined prompt file: context + original prompt (from file or inline).
# Prints path to the combined temp file.
slack_build_prompt_with_context() {
  local CHANNEL="$1"
  local CONTEXT_COUNT="$2"
  local PROMPT_TEXT="$3"       # inline prompt (may be empty)
  local PROMPT_FILE="$4"      # path to prompt file (may be empty)
  local MSG_JSON="$5"         # JSON of the specific message being handled (may be empty)

  local COMBINED
  COMBINED=$(mktemp /tmp/slam-bot-prompt-XXXXXX.md)

  # Add context header
  echo "## Recent channel context (last $CONTEXT_COUNT messages)" >> "$COMBINED"
  echo "" >> "$COMBINED"

  local CTX_FILE
  CTX_FILE=$(slack_build_context "$CHANNEL" "$CONTEXT_COUNT")
  cat "$CTX_FILE" >> "$COMBINED"
  rm -f "$CTX_FILE"
  echo "" >> "$COMBINED"

  # Add the specific message being handled
  if [ -n "$MSG_JSON" ]; then
    local IS_THREAD_REPLY
    IS_THREAD_REPLY=$(echo "$MSG_JSON" | jq -r '.thread_ts // empty')

    echo "## Message to handle" >> "$COMBINED"
    echo "" >> "$COMBINED"
    if [ -n "$IS_THREAD_REPLY" ]; then
      echo "(This is a thread reply to parent message $IS_THREAD_REPLY. Reply in the thread using thread_ts.)" >> "$COMBINED"
      echo "" >> "$COMBINED"
    fi
    echo "$MSG_JSON" | jq -r '
      "[\(.ts)] <\(.user // "unknown")>: \(.text // "(no text)")" +
      (if (.files // [] | length) > 0 then
        "\n  [Attached files: " + ([.files[] | "\(.name // "unnamed") (\(.mimetype // "unknown"))"] | join(", ")) + "]"
      else "" end)
    ' >> "$COMBINED"
    echo "" >> "$COMBINED"
    echo "---" >> "$COMBINED"
    echo "" >> "$COMBINED"
  fi

  # Add the actual prompt
  if [ -n "$PROMPT_FILE" ] && [ -f "$PROMPT_FILE" ]; then
    cat "$PROMPT_FILE" >> "$COMBINED"
  elif [ -n "$PROMPT_TEXT" ]; then
    echo "$PROMPT_TEXT" >> "$COMBINED"
  fi

  echo "$COMBINED"
}

# Main entry point: check a Slack channel for new messages,
# claim each one, build context, and dispatch a per-message Claude agent.
#
# Args:
#   $1 — CHANNEL (Slack channel ID)
#   $2 — LOG_NAME (e.g., "check-slack-pmf1")
#   $3 — COMMAND_SLUG (base slug, e.g., "check-slack-pmf1")
#   $4 — PROMPT_FILE (path to .md command file) OR "" for inline prompt mode
#   $5 — CONTEXT_COUNT (number of recent messages for context, default 10)
#   $6 — INLINE_PROMPT_TEMPLATE (optional: template with {MSG_TEXT} and {CHANNEL} placeholders)
slack_check_channel() {
  local CHANNEL="$1"
  local LOG_NAME="$2"
  local COMMAND_SLUG="$3"
  local PROMPT_FILE="${4:-}"
  local CONTEXT_COUNT="${5:-10}"
  local INLINE_TEMPLATE="${6:-}"

  # Single-pass ingestion: top-level messages + thread replies in one call
  if ! slack_ingest_messages "$CHANNEL" "$LOG_NAME"; then
    return 0
  fi

  # Track watermark file path for post-processing update
  local LAST_TS_FILE="$STATE_DIR/slack-last-ts-${CHANNEL}.txt"

  # Iterate over each message and dispatch independently
  # Use process substitution to avoid subshell variable issues
  while IFS= read -r MSG; do
    local MSG_TS
    MSG_TS=$(echo "$MSG" | jq -r '.ts')

    # Try to claim this message
    if ! slack_claim_message "$CHANNEL" "$MSG_TS"; then
      echo "[$(date)] Skipping already-claimed message $MSG_TS" >> "$LOGDIR/${LOG_NAME}.log"
      continue
    fi

    echo "[$(date)] Claimed message $MSG_TS, dispatching agent" >> "$LOGDIR/${LOG_NAME}.log"

    # Add :eyes: reaction to show processing has started
    curl -s -X POST https://slack.com/api/reactions.add \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"${CHANNEL}\",\"timestamp\":\"${MSG_TS}\",\"name\":\"eyes\"}" >/dev/null

    # Build the prompt with context
    local COMBINED_PROMPT
    if [ -n "$INLINE_TEMPLATE" ]; then
      local MSG_TEXT
      MSG_TEXT=$(echo "$MSG" | jq -r '.text // "(no text)"')
      local RENDERED
      RENDERED="${INLINE_TEMPLATE//\{MSG_TEXT\}/$MSG_TEXT}"
      RENDERED="${RENDERED//\{CHANNEL\}/$CHANNEL}"
      COMBINED_PROMPT=$(slack_build_prompt_with_context "$CHANNEL" "$CONTEXT_COUNT" "$RENDERED" "" "$MSG")
    else
      COMBINED_PROMPT=$(slack_build_prompt_with_context "$CHANNEL" "$CONTEXT_COUNT" "" "$PROMPT_FILE" "$MSG")
    fi

    # Dispatch Claude agent in background with per-message lock, remove :eyes: when done, add :white_check_mark:
    (
      "${BOT_SCRIPTS_DIR:-/opt/slam-bot/scripts}/run-claude.sh" "${COMMAND_SLUG}" "" "$COMBINED_PROMPT" "$MSG_TS" || true
      curl -s -X POST https://slack.com/api/reactions.remove \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"channel\":\"${CHANNEL}\",\"timestamp\":\"${MSG_TS}\",\"name\":\"eyes\"}" >/dev/null
      curl -s -X POST https://slack.com/api/reactions.add \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"channel\":\"${CHANNEL}\",\"timestamp\":\"${MSG_TS}\",\"name\":\"white_check_mark\"}" >/dev/null
    ) &

    echo "[$(date)] Dispatched agent for $MSG_TS (PID $!)" >> "$LOGDIR/${LOG_NAME}.log"
  done < <(echo "$ALL_MESSAGES" | jq -c '.[]')

  # Update watermark AFTER processing (not before), so messages aren't lost
  # if the bot crashes mid-processing. The claim mechanism prevents re-processing
  # on the next tick for messages that were already claimed.
  if [ -n "${NEWEST_TS:-}" ]; then
    echo "$NEWEST_TS" > "$LAST_TS_FILE"
  fi

  # Wait for all background agents to complete
  wait
}
