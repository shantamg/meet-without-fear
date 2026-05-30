#!/bin/bash
# slack-post.sh — Post a message to Slack via the Slack API
# Uses jq for proper JSON encoding, which handles newlines correctly.
#
# Usage:
#   slack-post.sh --channel CHANNEL_ID --text "message text"
#   slack-post.sh --channel CHANNEL_ID --text "message text" --thread-ts 1234567890.123456
#
# Environment:
#   SLACK_BOT_TOKEN — Slack bot token (sourced via config.sh)

set -euo pipefail

# Source config (loads secrets from .env if not already set)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "Error: SLACK_BOT_TOKEN is not set" >&2
  exit 1
fi

# Parse arguments
CHANNEL=""
TEXT=""
THREAD_TS=""
DIGEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      CHANNEL="$2"
      shift 2
      ;;
    --text)
      TEXT="$2"
      shift 2
      ;;
    --thread-ts)
      THREAD_TS="$2"
      shift 2
      ;;
    --digest)
      DIGEST=1
      shift
      ;;
    *)
      echo "Error: Unknown argument: $1" >&2
      echo "Usage: slack-post.sh --channel CHANNEL_ID --text \"message\" [--thread-ts TS]" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CHANNEL" ]; then
  echo "Error: --channel is required" >&2
  exit 1
fi

if [ -z "$TEXT" ]; then
  echo "Error: --text is required" >&2
  exit 1
fi

# ── Brevity guard — keep bot Slack messages short and glanceable ─────────────
# Default-on; overridable via SLACK_POST_MAX_LINES / SLACK_POST_MAX_CHARS for
# the rare legitimate exception. Thread replies are held tighter; --digest
# allows the single daily digest a little more room. Link, don't paste.
MAX_LINES="${SLACK_POST_MAX_LINES:-10}"
MAX_CHARS="${SLACK_POST_MAX_CHARS:-1200}"
if [ -n "$THREAD_TS" ]; then MAX_LINES=4; MAX_CHARS=500; fi
if [ -n "$DIGEST" ]; then MAX_LINES=15; MAX_CHARS=1800; fi
# printf adds a trailing newline so a single unterminated line counts as 1.
LINES=$(printf '%s\n' "$TEXT" | grep -c '')
CHARS=${#TEXT}
if [ "$LINES" -gt "$MAX_LINES" ] || [ "$CHARS" -gt "$MAX_CHARS" ]; then
  echo "Error: message exceeds Slack brevity cap ($LINES lines / $CHARS chars; max $MAX_LINES/$MAX_CHARS). Link, don't paste — post a URL instead of the body, or pass --digest for the daily digest." >&2
  exit 1
fi

# Build JSON payload using jq (handles newlines and special characters correctly)
if [ -n "$THREAD_TS" ]; then
  PAYLOAD=$(jq -n --arg ch "$CHANNEL" --arg text "$TEXT" --arg ts "$THREAD_TS" \
    '{channel: $ch, text: $text, thread_ts: $ts}')
else
  PAYLOAD=$(jq -n --arg ch "$CHANNEL" --arg text "$TEXT" \
    '{channel: $ch, text: $text}')
fi

# Post to Slack
RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check response
OK=$(echo "$RESPONSE" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown error"')
  echo "Error: Slack API returned: $ERROR" >&2
  exit 1
fi

# Output the message timestamp (useful for thread replies)
echo "$RESPONSE" | jq -r '.ts'
