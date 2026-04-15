#!/bin/bash
# Register work-in-progress to prevent duplicate work across agents
set -euo pipefail

WIP_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/wip"
mkdir -p "$WIP_DIR"

# Parse arguments
BRANCH=""
SUMMARY=""
CHANNEL=""
MESSAGE_TS=""
LOG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)    BRANCH="$2"; shift 2 ;;
    --summary)   SUMMARY="$2"; shift 2 ;;
    --channel)   CHANNEL="$2"; shift 2 ;;
    --message-ts) MESSAGE_TS="$2"; shift 2 ;;
    --log-file)  LOG_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$SUMMARY" ]; then
  echo "Usage: wip-register.sh --summary \"description\" [--branch BRANCH] [--channel CHANNEL_ID] [--message-ts TS]" >&2
  exit 2
fi

# Default branch to "pending" — run-claude.sh registers before the agent creates a branch
BRANCH="${BRANCH:-pending}"

PID="${SLAM_BOT_PID:-$$}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Write the WIP entry as JSON
jq -n \
  --arg pid "$PID" \
  --arg branch "$BRANCH" \
  --arg summary "$SUMMARY" \
  --arg channel "$CHANNEL" \
  --arg message_ts "$MESSAGE_TS" \
  --arg started_at "$STARTED_AT" \
  --arg log_file "$LOG_FILE" \
  '{pid: ($pid | tonumber), branch: $branch, summary: $summary, channel: $channel, message_ts: $message_ts, started_at: $started_at, log_file: $log_file}' \
  > "$WIP_DIR/wip-$PID.json"

echo "Registered WIP: branch=$BRANCH summary=$SUMMARY pid=$PID"
