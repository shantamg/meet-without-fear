#!/bin/bash
# shared.sh — Shared library functions for the EC2 bot.
#
# Provides canonical implementations of patterns that were previously
# copy-pasted across multiple scripts:
#   - count_running_agents()  — agent counting via _active/ dirs + legacy locks
#   - create_queue_entry()    — queue JSON file creation
#
# Usage: source "$LIB_DIR/shared.sh" (or source from SCRIPT_DIR/lib/shared.sh)

# Source config.sh if not already loaded (guard via BOT_NAME presence)
if [ -z "${BOT_NAME:-}" ]; then
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/config.sh"
fi

# ── is_bot_user ──────────────────────────────────────────────────────────────
# Check if a GitHub user.login is the slam-bot identity.
# Accepts both the legacy PAT identity ("MwfBot") and the GitHub App
# bot-user identity ("mwf-bot-app[bot]"). This is the ONLY place the
# bot-user name should be hardcoded; all other call sites must use this
# helper (or the BOT_USER_JQ_MATCH jq snippet below) so that a future
# rename is one-line.
#
# Usage: if is_bot_user "$author"; then ...
is_bot_user() {
  case "$1" in
    MwfBot|slam-bot-app\[bot\]) return 0 ;;
    *) return 1 ;;
  esac
}

# BOT_USER_LOGINS — space-separated list of accepted bot-user logins.
# Kept in sync with is_bot_user() above. Used when constructing gh CLI
# queries (e.g. `--author`) that accept only one identity at a time and
# must be unioned at the caller.
BOT_USER_LOGINS=("MwfBot" "mwf-bot-app[bot]")

# BOT_USER_JQ_MATCH — jq boolean expression that matches either bot-user
# identity. Expects `.user.login` in scope; wrap in parens when composing.
# Example:
#   jq '[.[] | select('"$BOT_USER_JQ_MATCH"')] | length'
BOT_USER_JQ_MATCH='.user.login == "MwfBot" or .user.login == "mwf-bot-app[bot]"'

# BOT_AUTHOR_JQ_MATCH — same as BOT_USER_JQ_MATCH but for `.author.login`
# (used by the GraphQL-shaped fields returned by `gh pr view --json reviews`
# and `gh pr view --json comments`).
BOT_AUTHOR_JQ_MATCH='.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]"'

# ── count_running_agents ─────────────────────────────────────────────────────
# Count currently running agents via _active/ directories and legacy lockfiles.
#
# Arguments:
#   $1 (optional) — Path to the _active directory.
#                   Defaults to $ACTIVE_DIR
#
# Output: Echoes the count of running agents.
count_running_agents() {
  local active_dir="${1:-${ACTIVE_DIR}}"
  local count=0

  # Count agent-* directories with alive PIDs
  for agent_dir in "$active_dir"/agent-*; do
    [ -d "$agent_dir" ] || continue
    local pid
    pid=$(basename "$agent_dir" | sed 's/^agent-//')
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      count=$((count + 1))
    fi
  done

  # Also count legacy lockfiles for agents not yet in _active/
  for lock in ${LOCK_PREFIX}-ws-*.lock; do
    [ -f "$lock" ] || continue
    local lpid
    lpid=$(cat "$lock" 2>/dev/null || echo "")
    if [ -n "$lpid" ] && [[ "$lpid" =~ ^[0-9]+$ ]] && kill -0 "$lpid" 2>/dev/null; then
      # Only count if there is no matching _active/ dir (avoid double-counting)
      if [ ! -d "$active_dir/agent-${lpid}" ]; then
        count=$((count + 1))
      fi
    fi
  done

  echo "$count"
}

# ── create_queue_entry ───────────────────────────────────────────────────────
# Create a queue JSON file for deferred agent dispatch.
#
# Reads fields from the following env vars (all optional except COMMAND_SLUG):
#   COMMAND_SLUG, PROMPT, PROMPT_FILE, MSG_TS, CHANNEL,
#   PROVENANCE_CHANNEL, PROVENANCE_REQUESTER, PROVENANCE_MESSAGE,
#   PRIORITY, SESSION_KEY, WORKSPACE_NAME, MODEL, RETRIES,
#   SLACK_CHANNEL (defaults to CHANNEL), SLACK_TS (defaults to MSG_TS),
#   THREAD_TS, QUEUED_AT (defaults to current UTC time)
#
# Arguments:
#   $1 (optional) — Queue directory. Defaults to $BOT_QUEUE_DIR
#
# Output: Echoes the path to the created queue file.
create_queue_entry() {
  local queue_dir="${1:-${BOT_QUEUE_DIR}}"
  local retries="${RETRIES:-0}"

  mkdir -p "$queue_dir"
  local queue_file="$queue_dir/queue-$(date +%s%N)-${COMMAND_SLUG}.json"

  jq -n \
    --arg command_slug "${COMMAND_SLUG:-}" \
    --arg prompt "${PROMPT:-}" \
    --arg prompt_file "${PROMPT_FILE:-}" \
    --arg msg_ts "${MSG_TS:-}" \
    --arg channel "${CHANNEL:-}" \
    --arg provenance_channel "${PROVENANCE_CHANNEL:-}" \
    --arg provenance_requester "${PROVENANCE_REQUESTER:-}" \
    --arg provenance_message "${PROVENANCE_MESSAGE:-}" \
    --arg slack_channel "${SLACK_CHANNEL:-${CHANNEL:-}}" \
    --arg slack_ts "${SLACK_TS:-${MSG_TS:-}}" \
    --arg priority "${PRIORITY:-normal}" \
    --arg queued_at "${QUEUED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
    --arg session_key "${SESSION_KEY:-}" \
    --arg workspace "${WORKSPACE_NAME:-}" \
    --arg model "${MODEL:-}" \
    --arg thread_ts "${THREAD_TS:-}" \
    --argjson retries "$retries" \
    '{command_slug: $command_slug, prompt: $prompt, prompt_file: $prompt_file,
      msg_ts: $msg_ts, channel: $channel, provenance_channel: $provenance_channel,
      provenance_requester: $provenance_requester, provenance_message: $provenance_message,
      slack_channel: $slack_channel, slack_ts: $slack_ts, priority: $priority,
      queued_at: $queued_at, session_key: $session_key, workspace: $workspace,
      model: $model, thread_ts: $thread_ts, retries: $retries}' \
    > "$queue_file"

  echo "$queue_file"
}

