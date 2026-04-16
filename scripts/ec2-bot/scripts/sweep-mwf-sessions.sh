#!/bin/bash
# sweep-mwf-sessions.sh — Remove MWF session folders older than 90 days.
# Runs daily via cron. Cleans thread-index.json entries for removed sessions.
# Skips sessions with an active .lock file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

SESSIONS_DIR="${PROJECT_DIR}/data/mwf-sessions"
THREAD_INDEX="${SESSIONS_DIR}/thread-index.json"
LOGFILE="${BOT_LOG_DIR}/sweep-mwf-sessions.log"
RETENTION_DAYS=90

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >> "$LOGFILE"; }

# Exit early if sessions directory doesn't exist
if [ ! -d "$SESSIONS_DIR" ]; then
  log "Sessions directory not found: $SESSIONS_DIR — nothing to sweep"
  exit 0
fi

CUTOFF_EPOCH=$(date -d "${RETENTION_DAYS} days ago" +%s 2>/dev/null || date -v-${RETENTION_DAYS}d +%s 2>/dev/null)
if [ -z "${CUTOFF_EPOCH:-}" ]; then
  log "ERROR: Could not compute cutoff date"
  exit 1
fi

CLEANED=0
SKIPPED_LOCK=0
SKIPPED_YOUNG=0
SKIPPED_INVALID=0
REMOVED_IDS=()

for SESSION_DIR in "$SESSIONS_DIR"/*/; do
  [ -d "$SESSION_DIR" ] || continue

  SESSION_ID=$(basename "$SESSION_DIR")

  # Skip if locked (active processing)
  if [ -f "${SESSION_DIR}.lock" ]; then
    SKIPPED_LOCK=$((SKIPPED_LOCK + 1))
    continue
  fi

  SESSION_FILE="${SESSION_DIR}session.json"

  # Skip if no session.json (not a valid session folder)
  if [ ! -f "$SESSION_FILE" ]; then
    SKIPPED_INVALID=$((SKIPPED_INVALID + 1))
    continue
  fi

  # Parse created_at from session.json
  CREATED_AT=$(jq -r '.created_at // ""' "$SESSION_FILE" 2>/dev/null) || true
  if [ -z "$CREATED_AT" ]; then
    SKIPPED_INVALID=$((SKIPPED_INVALID + 1))
    log "SKIP $SESSION_ID — missing or empty created_at"
    continue
  fi

  # Convert to epoch
  CREATED_EPOCH=$(date -d "$CREATED_AT" +%s 2>/dev/null || echo "")
  if [ -z "$CREATED_EPOCH" ]; then
    SKIPPED_INVALID=$((SKIPPED_INVALID + 1))
    log "SKIP $SESSION_ID — unparseable created_at: $CREATED_AT"
    continue
  fi

  # Check age
  if [ "$CREATED_EPOCH" -ge "$CUTOFF_EPOCH" ]; then
    SKIPPED_YOUNG=$((SKIPPED_YOUNG + 1))
    continue
  fi

  # Session is older than retention period — remove it
  STATUS=$(jq -r '.status // "unknown"' "$SESSION_FILE" 2>/dev/null) || STATUS="unknown"
  rm -rf "$SESSION_DIR"
  REMOVED_IDS+=("$SESSION_ID")
  CLEANED=$((CLEANED + 1))
  log "CLEANED $SESSION_ID — status=$STATUS, created=$CREATED_AT"
done

# Clean thread-index.json entries for removed sessions
if [ ${#REMOVED_IDS[@]} -gt 0 ] && [ -f "$THREAD_INDEX" ]; then
  TMP_INDEX="${THREAD_INDEX}.tmp.$$"
  trap 'rm -f "$TMP_INDEX"' EXIT

  # Build jq filter to remove entries pointing to any removed session ID
  JQ_FILTER="with_entries(select(.value as \$v | [$(printf '"%s",' "${REMOVED_IDS[@]}" | sed 's/,$//')]  | index(\$v) | not))"
  jq "$JQ_FILTER" "$THREAD_INDEX" > "$TMP_INDEX" 2>/dev/null && mv "$TMP_INDEX" "$THREAD_INDEX"

  REMOVED_ENTRIES=$(($(jq 'length' "$THREAD_INDEX" 2>/dev/null || echo 0)))
  log "Cleaned thread-index.json — removed entries for ${#REMOVED_IDS[@]} session(s)"
fi

log "Sweep complete — cleaned=$CLEANED, skipped: locked=$SKIPPED_LOCK young=$SKIPPED_YOUNG invalid=$SKIPPED_INVALID"
