#!/bin/bash
# Append a supplementary message to an active WIP entry
# Used when Agent B sees overlapping work and wants to leave a follow-up
# message for Agent A's run-claude.sh to pick up after Agent A finishes.
set -euo pipefail

WIP_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/wip"
mkdir -p "$WIP_DIR"

# Parse arguments
TARGET_BRANCH=""
TARGET_PID=""
MESSAGE=""
SOURCE_CHANNEL=""
SOURCE_TS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)    TARGET_BRANCH="$2"; shift 2 ;;
    --pid)       TARGET_PID="$2"; shift 2 ;;
    --message)   MESSAGE="$2"; shift 2 ;;
    --channel)   SOURCE_CHANNEL="$2"; shift 2 ;;
    --message-ts) SOURCE_TS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$MESSAGE" ]; then
  echo "Usage: wip-append.sh (--branch BRANCH | --pid PID) --message \"follow-up text\" [--channel CH] [--message-ts TS]" >&2
  exit 2
fi

if [ -z "$TARGET_BRANCH" ] && [ -z "$TARGET_PID" ]; then
  echo "Must specify --branch or --pid to identify the WIP entry" >&2
  exit 2
fi

# Find the matching WIP entry
MATCHED_FILE=""
for WIP_FILE in "$WIP_DIR"/wip-*.json; do
  [ -f "$WIP_FILE" ] || continue

  if [ -n "$TARGET_PID" ]; then
    FILE_PID=$(jq -r '.pid' "$WIP_FILE" 2>/dev/null) || continue
    if [ "$FILE_PID" = "$TARGET_PID" ]; then
      MATCHED_FILE="$WIP_FILE"
      break
    fi
  fi

  if [ -n "$TARGET_BRANCH" ]; then
    FILE_BRANCH=$(jq -r '.branch' "$WIP_FILE" 2>/dev/null) || continue
    if [ "$FILE_BRANCH" = "$TARGET_BRANCH" ]; then
      MATCHED_FILE="$WIP_FILE"
      break
    fi
  fi
done

if [ -z "$MATCHED_FILE" ]; then
  echo "No matching WIP entry found" >&2
  exit 1
fi

# Create messages directory for this WIP entry
WIP_BASENAME=$(basename "$MATCHED_FILE" .json)
MSG_DIR="$WIP_DIR/${WIP_BASENAME}-messages"
mkdir -p "$MSG_DIR"

# Write the supplementary message as a timestamped JSON file
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SAFE_TS=$(date +%s%N)
MSG_FILE="$MSG_DIR/msg-${SAFE_TS}.json"

jq -n \
  --arg message "$MESSAGE" \
  --arg channel "$SOURCE_CHANNEL" \
  --arg message_ts "$SOURCE_TS" \
  --arg appended_at "$TIMESTAMP" \
  '{message: $message, channel: $channel, message_ts: $message_ts, appended_at: $appended_at}' \
  > "$MSG_FILE"

echo "Appended supplementary message to WIP entry $(jq -r '.branch' "$MATCHED_FILE")"
