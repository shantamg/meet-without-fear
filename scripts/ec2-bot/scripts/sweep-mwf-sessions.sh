#!/bin/bash
# Sweep expired MWF session folders (90-day retention).
# Removes session folders where:
#   - status is "completed" or "abandoned" AND created_at > 90 days, OR
#   - created_at > 90 days regardless of status (stale unpaired sessions)
# Skips sessions with an active .lock file.
# Also cleans corresponding entries from thread-index.json.
#
# Designed to run daily via cron.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="$BOT_LOG_DIR/sweep-mwf-sessions.log"
SESSIONS_DIR="${MWF_SESSIONS_DIR:-${PROJECT_DIR}/data/mwf-sessions}"
RETENTION_DAYS="${MWF_SESSION_RETENTION_DAYS:-90}"
THREAD_INDEX="$SESSIONS_DIR/thread-index.json"

log() { echo "[$(date)] $*" >> "$LOGFILE"; }

# ── Pre-flight ─────────────────────────────────────────────��──────────────────

if [ ! -d "$SESSIONS_DIR" ]; then
  log "Sessions directory does not exist: $SESSIONS_DIR — nothing to sweep."
  exit 0
fi

CUTOFF_EPOCH=$(date -d "-${RETENTION_DAYS} days" +%s 2>/dev/null || \
               date -v-${RETENTION_DAYS}d +%s)

log "Starting sweep (retention=${RETENTION_DAYS}d, cutoff=$(date -d "@$CUTOFF_EPOCH" -Iseconds 2>/dev/null || date -r "$CUTOFF_EPOCH" -Iseconds))"

# ── Sweep sessions ───────��────────────────────────────────────────────────────

CLEANED=0
SKIPPED_LOCK=0
SKIPPED_YOUNG=0
CLEANED_IDS=()

for SESSION_DIR in "$SESSIONS_DIR"/*/; do
  [ -d "$SESSION_DIR" ] || continue

  SESSION_ID=$(basename "$SESSION_DIR")
  SESSION_FILE="$SESSION_DIR/session.json"

  # Skip if no session.json (not a valid session folder)
  if [ ! -f "$SESSION_FILE" ]; then
    continue
  fi

  # Skip locked sessions (active processing)
  if [ -f "$SESSION_DIR/.lock" ]; then
    SKIPPED_LOCK=$((SKIPPED_LOCK + 1))
    log "SKIP (locked): $SESSION_ID"
    continue
  fi

  # Read created_at and status from session.json
  CREATED_AT=$(jq -r '.created_at // empty' "$SESSION_FILE" 2>/dev/null) || true
  STATUS=$(jq -r '.status // empty' "$SESSION_FILE" 2>/dev/null) || true

  if [ -z "$CREATED_AT" ]; then
    log "SKIP (no created_at): $SESSION_ID"
    continue
  fi

  # Parse created_at to epoch
  CREATED_EPOCH=$(date -d "$CREATED_AT" +%s 2>/dev/null || \
                  date -j -f "%Y-%m-%dT%H:%M:%S" "${CREATED_AT%%.*}" +%s 2>/dev/null || echo 0)

  if [ "$CREATED_EPOCH" -eq 0 ]; then
    log "SKIP (unparseable created_at): $SESSION_ID — $CREATED_AT"
    continue
  fi

  # Check retention policy
  if [ "$CREATED_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
    # Older than retention — remove regardless of status
    rm -rf "$SESSION_DIR"
    CLEANED=$((CLEANED + 1))
    CLEANED_IDS+=("$SESSION_ID")
    log "CLEANED ($STATUS, $(( ($(date +%s) - CREATED_EPOCH) / 86400 ))d old): $SESSION_ID"
  else
    SKIPPED_YOUNG=$((SKIPPED_YOUNG + 1))
  fi
done

# ── Clean thread-index.json ────────────────────────────────────────���──────────

if [ "${#CLEANED_IDS[@]}" -gt 0 ] && [ -f "$THREAD_INDEX" ]; then
  # Build jq filter to remove entries pointing to any cleaned session ID
  JQ_FILTER="with_entries(select(.value as \$v | [$(printf '"%s",' "${CLEANED_IDS[@]}" | sed 's/,$//')] | index(\$v) | not))"
  TEMP_INDEX=$(mktemp)
  if jq "$JQ_FILTER" "$THREAD_INDEX" > "$TEMP_INDEX" 2>/dev/null; then
    mv "$TEMP_INDEX" "$THREAD_INDEX"
    log "Cleaned ${#CLEANED_IDS[@]} session(s) from thread-index.json"
  else
    rm -f "$TEMP_INDEX"
    log "WARNING: failed to update thread-index.json"
  fi
fi

# ── Summary ────────────���──────────────────────────────���───────────────────────

log "Sweep complete: cleaned=$CLEANED skipped_locked=$SKIPPED_LOCK skipped_young=$SKIPPED_YOUNG"
