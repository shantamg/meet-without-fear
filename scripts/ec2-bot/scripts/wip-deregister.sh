#!/bin/bash
# Remove work-in-progress entries
set -euo pipefail

WIP_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/wip"
mkdir -p "$WIP_DIR"

# Parse arguments
TARGET_PID=""
TARGET_BRANCH=""
SELF=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pid)    TARGET_PID="$2"; shift 2 ;;
    --branch) TARGET_BRANCH="$2"; shift 2 ;;
    --self)   SELF=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$SELF" -eq 1 ]; then
  TARGET_PID="${SLAM_BOT_PID:-$$}"
fi

if [ -z "$TARGET_PID" ] && [ -z "$TARGET_BRANCH" ]; then
  echo "Usage: wip-deregister.sh --pid PID | --branch BRANCH | --self" >&2
  exit 2
fi

REMOVED=0

for WIP_FILE in "$WIP_DIR"/wip-*.json; do
  [ -f "$WIP_FILE" ] || continue

  if [ -n "$TARGET_PID" ]; then
    FILE_PID=$(jq -r '.pid' "$WIP_FILE" 2>/dev/null) || continue
    if [ "$FILE_PID" = "$TARGET_PID" ]; then
      rm -f "$WIP_FILE"
      REMOVED=$((REMOVED + 1))
    fi
  fi

  if [ -n "$TARGET_BRANCH" ]; then
    FILE_BRANCH=$(jq -r '.branch' "$WIP_FILE" 2>/dev/null) || continue
    if [ "$FILE_BRANCH" = "$TARGET_BRANCH" ]; then
      rm -f "$WIP_FILE"
      REMOVED=$((REMOVED + 1))
    fi
  fi
done

echo "Removed $REMOVED WIP entries"
