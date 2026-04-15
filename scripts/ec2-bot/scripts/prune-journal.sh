#!/bin/bash
# prune-journal.sh — Remove activity journal entries older than 48 hours.
# Run daily via cron. Safe to run concurrently (atomic rename).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

ACTIVITY_JOURNAL="${BOT_STATE_DIR}/activity-journal.jsonl"

[ -f "$ACTIVITY_JOURNAL" ] || exit 0

# Cutoff: 48 hours ago (epoch seconds)
CUTOFF=$(date -d "48 hours ago" +%s 2>/dev/null || date -v-48H +%s 2>/dev/null || exit 0)

TMP_FILE="${ACTIVITY_JOURNAL}.tmp.$$"
trap 'rm -f "$TMP_FILE"' EXIT

# Keep entries newer than cutoff
while IFS= read -r line; do
  ts=$(echo "$line" | jq -r '.ts // ""' 2>/dev/null) || continue
  [ -z "$ts" ] && continue

  # Parse ISO timestamp to epoch
  entry_epoch=$(date -d "$ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s 2>/dev/null || echo "0")
  if [ "$entry_epoch" -ge "$CUTOFF" ]; then
    echo "$line"
  fi
done < "$ACTIVITY_JOURNAL" > "$TMP_FILE"

# Atomic replace
mv "$TMP_FILE" "$ACTIVITY_JOURNAL"

BEFORE=$(wc -l < "$ACTIVITY_JOURNAL" 2>/dev/null || echo 0)
echo "[$(date)] Pruned activity journal — $(cat "$ACTIVITY_JOURNAL" | wc -l | tr -d ' ') entries remain"
