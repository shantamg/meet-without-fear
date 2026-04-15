#!/bin/bash
# Check for existing work-in-progress entries
# Exit 0 = active WIP entries found (printed to stdout)
# Exit 1 = no active WIP entries
set -euo pipefail

EXCLUDE_PID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --exclude-pid) EXCLUDE_PID="$2"; shift 2 ;;
    *) shift ;;
  esac
done

WIP_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/wip"
mkdir -p "$WIP_DIR"

NOW=$(date +%s)
FOUND=0

for WIP_FILE in "$WIP_DIR"/wip-*.json; do
  [ -f "$WIP_FILE" ] || continue

  # Read fields from JSON
  PID=$(jq -r '.pid' "$WIP_FILE" 2>/dev/null) || continue
  BRANCH=$(jq -r '.branch' "$WIP_FILE" 2>/dev/null) || continue
  SUMMARY=$(jq -r '.summary' "$WIP_FILE" 2>/dev/null) || continue
  STARTED_AT=$(jq -r '.started_at' "$WIP_FILE" 2>/dev/null) || continue

  # Skip our own entry
  if [ -n "$EXCLUDE_PID" ] && [ "$PID" = "$EXCLUDE_PID" ]; then
    continue
  fi

  # Check if PID is still running; clean up stale entries
  if [ -n "$PID" ] && [[ "$PID" =~ ^[0-9]+$ ]]; then
    if ! kill -0 "$PID" 2>/dev/null; then
      rm -f "$WIP_FILE"
      continue
    fi
  else
    # Invalid PID — remove
    rm -f "$WIP_FILE"
    continue
  fi

  # Calculate age
  STARTED_EPOCH=$(date -d "$STARTED_AT" +%s 2>/dev/null || echo "$NOW")
  AGE_MIN=$(( (NOW - STARTED_EPOCH) / 60 ))

  echo "WIP: branch=$BRANCH summary=\"$SUMMARY\" started=${AGE_MIN}m ago (pid=$PID)"
  FOUND=1
done

if [ "$FOUND" -eq 1 ]; then
  exit 0
else
  exit 1
fi
