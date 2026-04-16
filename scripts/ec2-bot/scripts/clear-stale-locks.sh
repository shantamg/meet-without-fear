#!/bin/bash
# Clean up stale lockfiles, claim files, and kill stuck Claude processes
# Runs every 5 minutes via cron
#
# Process lifecycle detection:
#   1. Activity-based: checks heartbeat files (touched by PostToolUse hook after
#      every tool call) and log file modification time. If either shows recent
#      activity, the process is considered alive regardless of total age.
#   2. AI triage: when a process appears idle (no activity in IDLE_THRESHOLD_MIN),
#      spawns a lightweight Claude instance to analyze the log and decide whether
#      to kill, extend, or escalate to a human.
#   3. Hard safety cap: processes exceeding HARD_CAP_MIN are killed regardless
#      of activity — a safety net for runaway loops.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="${BOT_LOG_DIR}/lock-cleanup.log"

mkdir -p "$HEARTBEAT_DIR" 2>/dev/null || true

# Clean up any leftover rate limit state files from the removed rate limiting infrastructure
rm -f "${LOCK_PREFIX}-rate-limit-state.json" "${LOCK_PREFIX}-github-rate-limit-state.json" 2>/dev/null || true
rm -f "${LOCK_PREFIX}-rate-limited.flag" "${LOCK_PREFIX}-rate-limit-snapshot.txt" "${LOCK_PREFIX}-rate-limit-warning.flag" 2>/dev/null || true

for LOCK in ${LOCK_PREFIX}-*.lock; do
  [ -f "$LOCK" ] || continue

  SLUG=$(basename "$LOCK" | sed "s/^${BOT_NAME}-//; s/\.lock$//")
  PID=$(cat "$LOCK" 2>/dev/null)
  LOCK_AGE_MIN=$(( ($(date +%s) - $(stat -c %Y "$LOCK")) / 60 ))

  # If PID is empty or not a number, it's a legacy lock — just check age
  if [ -z "$PID" ] || ! [[ "$PID" =~ ^[0-9]+$ ]]; then
    if [ "$LOCK_AGE_MIN" -ge "$IDLE_THRESHOLD_MIN" ]; then
      rm -f "$LOCK"
      echo "[$(date)] Removed orphan lock for $SLUG (no PID, ${LOCK_AGE_MIN}m old)" >> "$LOGFILE"
    fi
    continue
  fi

  # PID exists — check if process is still running
  if ! kill -0 "$PID" 2>/dev/null; then
    # Process is dead, lock is stale — clean up heartbeat too
    rm -f "$LOCK"
    rm -f "$HEARTBEAT_DIR/heartbeat-${PID}.txt" 2>/dev/null
    echo "[$(date)] Removed stale lock for $SLUG (PID $PID dead, ${LOCK_AGE_MIN}m old)" >> "$LOGFILE"
    continue
  fi

  # ── Process is alive — check activity ──

  # Find the most recent activity signal: heartbeat file or log file mtime
  LAST_ACTIVITY=0

  # Check heartbeat (most reliable — updated by PostToolUse hook after every tool call)
  HEARTBEAT_FILE="$HEARTBEAT_DIR/heartbeat-${PID}.txt"
  if [ -f "$HEARTBEAT_FILE" ]; then
    HB_MTIME=$(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
    [ "$HB_MTIME" -gt "$LAST_ACTIVITY" ] && LAST_ACTIVITY=$HB_MTIME
  fi

  # Check log file mtime as fallback (log slug matches lock slug)
  LOGDIR="$BOT_LOG_DIR"
  LOG_CANDIDATE="$LOGDIR/${SLUG}.log"
  if [ -f "$LOG_CANDIDATE" ]; then
    LOG_MTIME=$(stat -c %Y "$LOG_CANDIDATE" 2>/dev/null || echo 0)
    [ "$LOG_MTIME" -gt "$LAST_ACTIVITY" ] && LAST_ACTIVITY=$LOG_MTIME
  fi

  NOW=$(date +%s)
  if [ "$LAST_ACTIVITY" -gt 0 ]; then
    IDLE_MIN=$(( (NOW - LAST_ACTIVITY) / 60 ))
  else
    # No activity signal found — fall back to lock age as idle time
    IDLE_MIN=$LOCK_AGE_MIN
  fi

  # ── Decision logic ──

  # Hard safety cap: kill regardless of activity
  if [ "$LOCK_AGE_MIN" -ge "$HARD_CAP_MIN" ]; then
    pkill -P "$PID" 2>/dev/null
    kill "$PID" 2>/dev/null
    sleep 2
    kill -9 "$PID" 2>/dev/null
    rm -f "$LOCK"
    rm -f "$HEARTBEAT_DIR/heartbeat-${PID}.txt" 2>/dev/null
    echo "[$(date)] HARD CAP: killed $SLUG (PID $PID, ${LOCK_AGE_MIN}m old, idle ${IDLE_MIN}m)" >> "$LOGFILE"

    curl -s -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg slug "$SLUG" --arg age "$LOCK_AGE_MIN" --arg bot "$BOT_NAME" \
        '{channel: $ch, text: ("⚠️ " + $bot + ": killed `" + $slug + "` — hit hard safety cap (" + $age + " min). Process was force-terminated.")}')" >/dev/null
    continue
  fi

  # Recently active: skip
  if [ "$IDLE_MIN" -lt "$IDLE_THRESHOLD_MIN" ]; then
    continue
  fi

  # Idle but too young to triage: skip (give it time to start producing output)
  if [ "$LOCK_AGE_MIN" -lt "$TRIAGE_MIN_AGE" ]; then
    continue
  fi

  # ── Idle and old enough: run AI triage ──
  echo "[$(date)] Triaging idle $SLUG (PID $PID, age ${LOCK_AGE_MIN}m, idle ${IDLE_MIN}m)" >> "$LOGFILE"

  TRIAGE_RESULT=""
  if [ -x "$SCRIPT_DIR/triage-stuck-process.sh" ]; then
    TRIAGE_RESULT=$("$SCRIPT_DIR/triage-stuck-process.sh" "$SLUG" "$PID" "$LOCK_AGE_MIN" "$LOG_CANDIDATE" 2>/dev/null || echo "")
  fi

  VERDICT=$(echo "$TRIAGE_RESULT" | jq -r '.verdict // "kill"' 2>/dev/null || echo "kill")
  REASON=$(echo "$TRIAGE_RESULT" | jq -r '.reason // "triage failed"' 2>/dev/null || echo "triage failed")

  echo "[$(date)] Triage verdict for $SLUG: $VERDICT — $REASON" >> "$LOGFILE"

  case "$VERDICT" in
    extend)
      # Process is doing real work — touch the heartbeat to give it another cycle
      touch "$HEARTBEAT_FILE" 2>/dev/null || true
      echo "[$(date)] Extended $SLUG (PID $PID) — triage says: $REASON" >> "$LOGFILE"
      ;;
    alert)
      # Unclear — alert human, don't kill yet
      curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg slug "$SLUG" --arg age "$LOCK_AGE_MIN" \
           --arg idle "$IDLE_MIN" --arg reason "$REASON" --arg bot "$BOT_NAME" \
          '{channel: $ch, text: ("🔍 " + $bot + ": `" + $slug + "` may be stuck (" + $age + " min old, idle " + $idle + " min). AI triage says: _" + $reason + "_\nNot auto-killing — please review.")}')" >/dev/null
      ;;
    kill|*)
      # Kill the process
      pkill -P "$PID" 2>/dev/null
      kill "$PID" 2>/dev/null
      sleep 2
      kill -9 "$PID" 2>/dev/null
      rm -f "$LOCK"
      rm -f "$HEARTBEAT_DIR/heartbeat-${PID}.txt" 2>/dev/null
      echo "[$(date)] Killed stuck $SLUG (PID $PID, ${LOCK_AGE_MIN}m old, idle ${IDLE_MIN}m) — triage: $REASON" >> "$LOGFILE"

      curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg slug "$SLUG" --arg age "$LOCK_AGE_MIN" \
           --arg idle "$IDLE_MIN" --arg reason "$REASON" --arg bot "$BOT_NAME" \
          '{channel: $ch, text: ("⚠️ " + $bot + ": killed stuck `" + $slug + "` after " + $age + " min (idle " + $idle + " min). AI triage: _" + $reason + "_")}')" >/dev/null
      ;;
  esac
done

# Clean up stale heartbeat files (where PID no longer exists)
if [ -d "$HEARTBEAT_DIR" ]; then
  for HB_FILE in "$HEARTBEAT_DIR"/heartbeat-*.txt; do
    [ -f "$HB_FILE" ] || continue
    HB_PID=$(basename "$HB_FILE" | sed 's/^heartbeat-//; s/\.txt$//')
    if [ -n "$HB_PID" ] && [[ "$HB_PID" =~ ^[0-9]+$ ]]; then
      if ! kill -0 "$HB_PID" 2>/dev/null; then
        rm -f "$HB_FILE"
      fi
    fi
  done
fi

# Clean up stale claim files (>24 hours old)
# CLAIMS_DIR provided by config.sh
if [ -d "$CLAIMS_DIR" ]; then
  CLEANED=$(find "$CLAIMS_DIR" -name "claimed-*.txt" -mmin +1440 -delete -print 2>/dev/null | wc -l)
  [ "$CLEANED" -gt 0 ] && echo "[$(date)] Cleaned $CLEANED stale claim files" >> "$LOGFILE"

  # Clean up stale waiting-human markers (>7 days old).
  # These are written by keep-label workspaces (spec-builder, needs-info) when
  # waiting for human input. 7 days matches the spec-builder stale threshold.
  WAITING_CLEANED=$(find "$CLAIMS_DIR" -name "waiting-human-*.txt" -mmin +10080 -delete -print 2>/dev/null | wc -l)
  [ "$WAITING_CLEANED" -gt 0 ] && echo "[$(date)] Cleaned $WAITING_CLEANED stale waiting-human markers" >> "$LOGFILE"
fi

# Clean up temp prompt/context files (>1 hour old)
find /tmp -maxdepth 1 -name "${BOT_NAME}-prompt-*" -mmin +60 -delete 2>/dev/null
find /tmp -maxdepth 1 -name "${BOT_NAME}-context-*" -mmin +60 -delete 2>/dev/null
find /tmp -maxdepth 1 -name "${BOT_NAME}-thread-replies-*" -mmin +60 -delete 2>/dev/null

# Clean up legacy directories (one-time removal)
rm -rf "${BOT_STATE_DIR}/pmf1-claims" 2>/dev/null
rm -rf "${BOT_STATE_DIR}/active-threads" 2>/dev/null

# ── Clean up stale _active/ agent directories (where PID no longer exists) ──
# ACTIVE_DIR provided by config.sh
if [ -d "$ACTIVE_DIR" ]; then
  for AGENT_DIR in "$ACTIVE_DIR"/agent-*; do
    [ -d "$AGENT_DIR" ] || continue
    AGENT_PID=$(basename "$AGENT_DIR" | sed 's/^agent-//')
    if [ -n "$AGENT_PID" ] && [[ "$AGENT_PID" =~ ^[0-9]+$ ]]; then
      if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        # Remove symlinks from workspace stage output/ directories
        if [ -f "$AGENT_DIR/route.json" ]; then
          ROUTE_WS=$(jq -r '.workspace // empty' "$AGENT_DIR/route.json" 2>/dev/null || true)
          ROUTE_STAGE=$(jq -r '.stage // empty' "$AGENT_DIR/route.json" 2>/dev/null || true)
          if [ -n "$ROUTE_WS" ] && [ -n "$ROUTE_STAGE" ]; then
            rm -f "${WORKSPACES_DIR}/${ROUTE_WS}/stages/${ROUTE_STAGE}/output/agent-${AGENT_PID}" 2>/dev/null || true
          fi
        fi
        rm -rf "$AGENT_DIR"
        echo "[$(date)] Removed stale _active/agent-${AGENT_PID} (PID dead)" >> "$LOGFILE"
      fi
    fi
  done

  # Clean up archived agent directories (default 60 min, override with AGENT_ARCHIVE_TTL_MIN)
  ARCHIVE_DIR="$ACTIVE_DIR/_archived"
  ARCHIVE_TTL="${AGENT_ARCHIVE_TTL_MIN:-60}"
  if [ -d "$ARCHIVE_DIR" ]; then
    find "$ARCHIVE_DIR" -maxdepth 1 -type d -name "agent-*" -mmin +"$ARCHIVE_TTL" -exec rm -rf {} \; 2>/dev/null
    # Remove _archived/ itself if empty
    rmdir "$ARCHIVE_DIR" 2>/dev/null || true
  fi
fi

# ── Clean up orphaned worktrees (from hard kills where trap didn't run) ───────
cd "$REPO_ROOT" 2>/dev/null && git worktree prune 2>/dev/null
# Remove stale worktree temp dirs
find /tmp -maxdepth 1 -name "${BOT_NAME}-worktree-*" -mmin +20 -exec rm -rf {} \; 2>/dev/null

# ── Clean up worktrees whose PRs are merged/closed ──────────────────────────
# Bot workspaces (general-pr, docs-audit, etc.) create worktrees that persist
# after their PRs are merged/closed. Without cleanup these accumulate and fill
# the disk. Only check worktrees older than 2 hours to avoid touching active work.
# Rate-limit: only run this check once per hour (uses gh API calls per worktree).
WT_CLEANUP_MARKER="/tmp/${BOT_NAME}-worktree-cleanup-last"
WT_CLEANUP_AGE=999
if [ -f "$WT_CLEANUP_MARKER" ]; then
  WT_CLEANUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$WT_CLEANUP_MARKER" 2>/dev/null || echo 0)) / 60 ))
fi
if [ "$WT_CLEANUP_AGE" -ge 60 ]; then
touch "$WT_CLEANUP_MARKER"
MERGED_WT_COUNT=0
while IFS= read -r WT_LINE; do
  [ -z "$WT_LINE" ] && continue
  WT_PATH=$(echo "$WT_LINE" | awk '{print $1}')
  WT_BRANCH=$(echo "$WT_LINE" | awk '{print $3}' | tr -d '[]')

  # Skip the main worktree
  [ "$WT_PATH" = "$REPO_ROOT" ] && continue

  # Skip worktrees less than 2 hours old (may be actively in use)
  WT_AGE_MIN=$(( ($(date +%s) - $(stat -c %Y "$WT_PATH" 2>/dev/null || echo "$(date +%s)")) / 60 ))
  [ "$WT_AGE_MIN" -lt 120 ] && continue

  # Skip if there's an active lock file with a running process
  SKIP=false
  for LOCK in /tmp/${BOT_NAME}-*.lock; do
    [ -f "$LOCK" ] || continue
    LOCK_PID=$(cat "$LOCK" 2>/dev/null)
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
      # Check if the lock slug matches the worktree branch
      LOCK_SLUG=$(basename "$LOCK" | sed "s/^${BOT_NAME}-//; s/\\.lock\$//")
      if echo "$WT_BRANCH" | grep -q "$LOCK_SLUG" 2>/dev/null; then
        SKIP=true
        break
      fi
    fi
  done
  [ "$SKIP" = "true" ] && continue

  # Check if the branch's PR is merged or closed (squash merges aren't
  # detected by `git branch --merged`, so we ask GitHub directly)
  SHOULD_REMOVE=false
  PR_STATE=$(gh pr list --repo "$GITHUB_REPO" --head "$WT_BRANCH" --state all --json state --jq '.[0].state' 2>/dev/null || echo "")
  if [ "$PR_STATE" = "MERGED" ] || [ "$PR_STATE" = "CLOSED" ]; then
    SHOULD_REMOVE=true
  elif [ -z "$PR_STATE" ] && [ "$WT_AGE_MIN" -gt 1440 ]; then
    # No PR found and worktree is >24h old — likely abandoned
    SHOULD_REMOVE=true
  fi

  if [ "$SHOULD_REMOVE" = "true" ]; then
    git worktree remove "$WT_PATH" --force 2>/dev/null || rm -rf "$WT_PATH" 2>/dev/null
    git branch -D "$WT_BRANCH" 2>/dev/null || true
    MERGED_WT_COUNT=$((MERGED_WT_COUNT + 1))
    echo "[$(date)] Removed worktree ($PR_STATE): $WT_PATH [${WT_BRANCH}] (${WT_AGE_MIN}m old)" >> "$LOGFILE"
  fi
done < <(git worktree list 2>/dev/null)

if [ "$MERGED_WT_COUNT" -gt 0 ]; then
  git worktree prune 2>/dev/null
  echo "[$(date)] Cleaned $MERGED_WT_COUNT stale worktrees" >> "$LOGFILE"
fi

# ── Remove stale branches not in use by any worktree ────────────────────────
for BRANCH in $(git branch --list 'bot/*' 2>/dev/null | tr -d ' *'); do
  if ! git worktree list 2>/dev/null | grep -q "$BRANCH"; then
    git branch -D "$BRANCH" 2>/dev/null
  fi
done
# Also clean merged feature branches not in use by worktrees
for BRANCH in $(git branch 2>/dev/null | grep -E '^\s*(feat|fix|feature|chore)/' | tr -d ' *'); do
  if ! git worktree list 2>/dev/null | grep -q "$BRANCH"; then
    PR_STATE=$(gh pr list --repo "$GITHUB_REPO" --head "$BRANCH" --state all --json state --jq '.[0].state' 2>/dev/null || echo "")
    if [ "$PR_STATE" = "MERGED" ] || [ "$PR_STATE" = "CLOSED" ]; then
      git branch -D "$BRANCH" 2>/dev/null || true
      echo "[$(date)] Removed merged branch: $BRANCH" >> "$LOGFILE"
    fi
  fi
done

fi # end hourly worktree cleanup gate
