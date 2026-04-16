#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
source "$LIB_DIR/config.sh"
source "$LIB_DIR/shared.sh"

# ── Parse arguments ──
source "$LIB_DIR/parse-args.sh" "$@"

# ── Lock file ──
# Include ISSUE_NUMBER in lock/log paths when set (dispatcher passes it as env var).
# Without this, all workspace dispatches to the same workspace (e.g., 8 issues routed
# to general-pr) collide on a single lockfile — only the first agent runs, the rest
# silently exit at the lock check below.
LOGDIR="$BOT_LOG_DIR"
LOCK_SUFFIX="${ISSUE_NUMBER:+-issue-${ISSUE_NUMBER}}"
if [ -n "$SESSION_KEY" ]; then
  SAFE_KEY="${SESSION_KEY//[^a-zA-Z0-9_-]/_}"
  LOCKFILE="${LOCK_PREFIX}-${COMMAND_SLUG}-${SAFE_KEY}.lock"
  LOGFILE="$LOGDIR/${COMMAND_SLUG}-${SAFE_KEY}.log"
elif [ -n "$MSG_TS" ]; then
  SAFE_TS="${MSG_TS//[^0-9.]/_}"
  LOCKFILE="${LOCK_PREFIX}-${COMMAND_SLUG}-${SAFE_TS}.lock"
  LOGFILE="$LOGDIR/${COMMAND_SLUG}-${SAFE_TS}.log"
else
  LOCKFILE="${LOCK_PREFIX}-${COMMAND_SLUG}${LOCK_SUFFIX}.lock"
  LOGFILE="$LOGDIR/${COMMAND_SLUG}${LOCK_SUFFIX}.log"
fi

[ -f "$LOCKFILE" ] && exit 0
echo "$$" > "$LOCKFILE"

PRIORITY="${PRIORITY:-normal}"

# ── gh call budget counter ──
source "$LIB_DIR/gh-budget.sh"
gh_budget_setup

# ── Resource check gate (#557) ──
QUEUE_DIR="$BOT_QUEUE_DIR"
if ! "$SCRIPT_DIR/check-resources.sh" > /dev/null 2>&1; then
  RESOURCE_MSG=$("$SCRIPT_DIR/check-resources.sh" 2>&1 || true)
  echo "[$(date)] QUEUED $COMMAND_SLUG — $RESOURCE_MSG" >> "$LOGFILE"
  create_queue_entry "$QUEUE_DIR" > /dev/null
  if [ -n "$MSG_TS" ] && [ -n "${CHANNEL:-}" ]; then
    curl -s -X POST https://slack.com/api/reactions.remove \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$CHANNEL" --arg ts "$MSG_TS" '{channel: $ch, timestamp: $ts, name: "eyes"}')" > /dev/null 2>&1 || true
    curl -s -X POST https://slack.com/api/reactions.add \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$CHANNEL" --arg ts "$MSG_TS" '{channel: $ch, timestamp: $ts, name: "hourglass_flowing_sand"}')" > /dev/null 2>&1 || true
  fi
  rm -f "$LOCKFILE"
  exit 0
fi

# ── Setup ──
WORKTREE_DIR=""
AGENT_HOME="${ACTIVE_DIR}/agent-$$"

source "$LIB_DIR/activity-journal.sh"
source "$LIB_DIR/cleanup-agent.sh"
trap cleanup EXIT

echo "=== [$(date)] START $COMMAND_SLUG${MSG_TS:+ (msg: $MSG_TS)} ===" >> "$LOGFILE"
START_LINE=$(wc -l < "$LOGFILE")
PUBLISH_SCRIPT="$SCRIPT_DIR/publish-bot-event.mjs"

export SLAM_BOT=1
mkdir -p "$HEARTBEAT_DIR" 2>/dev/null || true
touch "$HEARTBEAT_DIR/heartbeat-$$.txt" 2>/dev/null || true
export SLAM_BOT_PID=$$

source "$LIB_DIR/setup-agent.sh"
source "$LIB_DIR/setup-worktree.sh"

# ── Publish session.started ──
if [ -f "$PUBLISH_SCRIPT" ]; then
  node "$PUBLISH_SCRIPT" "session.started" \
    "$(jq -n --argjson pid "$$" --arg branch "${WORKTREE_BRANCH:-$(git branch --show-current 2>/dev/null || echo unknown)}" \
       --arg summary "$COMMAND_SLUG" --arg channel "${CHANNEL:-}" --arg messageTs "$MSG_TS" \
       --arg startedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '{pid: $pid, branch: $branch, summary: $summary, channel: $channel, messageTs: $messageTs, startedAt: $startedAt}')" \
    2>/dev/null &
fi

# ── Build provenance block ──
PROVENANCE_BLOCK=""
if [ -n "${PROVENANCE_REQUESTER:-}" ] || [ -n "${PROVENANCE_CHANNEL:-}" ]; then
  PROVENANCE_BLOCK="
[PROVENANCE]
The following provenance metadata was resolved programmatically at dispatch time. Use these EXACT values (do not paraphrase or re-derive) when writing Provenance sections in PRs or issues:
- Channel: ${PROVENANCE_CHANNEL:-unknown}
- Requester: ${PROVENANCE_REQUESTER:-unknown}
- Original message: ${PROVENANCE_MESSAGE:-(not available)}
[END PROVENANCE]
"
fi

# ── Invoke Claude ──
source "$LIB_DIR/invoke-claude.sh"

# ── Log final gh call count ──
gh_budget_log_final

echo "=== [$(date)] END $COMMAND_SLUG${MSG_TS:+ (msg: $MSG_TS)} ===" >> "$LOGFILE"

# ── Publish session.ended ──
if [ -f "$PUBLISH_SCRIPT" ]; then
  node "$PUBLISH_SCRIPT" "session.ended" \
    "$(jq -n --argjson pid "$$" --arg branch "${WORKTREE_BRANCH:-$(git branch --show-current 2>/dev/null || echo unknown)}" \
       --arg summary "$COMMAND_SLUG" --arg endedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg status "completed" \
       '{pid: $pid, branch: $branch, summary: $summary, endedAt: $endedAt, status: $status}')" \
    2>/dev/null &
fi

# ── Error checking ──
TAIL=$(tail -n +"$START_LINE" "$LOGFILE")

ERROR_MSG=$(echo "$TAIL" | grep -i "^Error:" | head -5 || true)
if [ -n "$ERROR_MSG" ]; then
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
    -d "$(jq -n --arg ch "$BOT_OPS_CHANNEL_ID" --arg slug "$COMMAND_SLUG" --arg err "$ERROR_MSG" \
      '{channel: $ch, text: ("🚨 Slam Paws error running `" + $slug + "`:\n```\n" + $err + "\n```")}')"
  echo "[$(date)] CLI ERROR on $COMMAND_SLUG: $ERROR_MSG" >> "$LOGDIR/auth-failures.log"
  exit 1
fi

if echo "$TAIL" | grep -qiE "login|sign in|authenticate|expired|unauthorized|APIError.*401"; then
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
    -d "{\"channel\":\"$BOT_OPS_CHANNEL_ID\",\"text\":\"🚨 Slam Paws: Claude auth failed running '$COMMAND_SLUG'. SSH in and run 'claude' to re-authenticate.\"}"
  echo "[$(date)] AUTH FAILURE on $COMMAND_SLUG" >> "$LOGDIR/auth-failures.log"
  exit 1
fi

if echo "$TAIL" | grep -qiE "gh auth|token.*expired|Bad credentials"; then
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
    -d "{\"channel\":\"$BOT_OPS_CHANNEL_ID\",\"text\":\"🚨 Slam Paws: GitHub token expired running '$COMMAND_SLUG'. SSH in and update GH_TOKEN.\"}"
  echo "[$(date)] GH_TOKEN FAILURE on $COMMAND_SLUG" >> "$LOGDIR/auth-failures.log"
  exit 1
fi
