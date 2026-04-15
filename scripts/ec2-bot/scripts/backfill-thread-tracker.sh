#!/bin/bash
# backfill-thread-tracker.sh — One-shot script to populate thread-tracker files
# for Slack threads that existed BEFORE the tracker feature shipped.
#
# Scans the slack-triage channels (Shantam DM, #pmf1, #agentic-devs, #slam-bot)
# for recent parent messages where MwfBot replied with a GitHub issue/PR link,
# then creates tracker files so thread-tracker.sh can follow up on them.
#
# Unlike write-tracker.sh (which always stamps created_at=now), this script
# preserves the real thread age by setting created_at to the parent message's
# Slack timestamp. That way staleness checks in thread-tracker.sh fire based
# on real thread age, not backfill age.
#
# Usage:
#   backfill-thread-tracker.sh [--dry-run] [--max-age-days N] [--channel CID]
#
# Flags:
#   --dry-run           Log what would be created, don't write files
#   --max-age-days N    Only scan parents newer than N days (default: 14, matches TTL)
#   --channel CID       Only scan this one channel (default: all slack-triage channels)
#
# Env:
#   SLACK_BOT_TOKEN     Required
#   BOT_STATE_DIR       Defaults to /opt/slam-bot/state
#   SLAM_BOT_USER_ID  Defaults to U0ALQHDUVSM
#
# Exit codes: 0 on success (even if nothing was backfilled), 1 on config/API error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/config.sh" ]; then
  source "$SCRIPT_DIR/lib/config.sh"
fi

# Auto-source EC2 bot env so non-exported channel vars are picked up.
# (Normal bot scripts run under a shell that already has them; this one-shot
# admin script is often run manually, so we load them ourselves.)
if [ -f /opt/slam-bot/.env ]; then
  set -a
  source /opt/slam-bot/.env
  set +a
fi

TRACKER_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/thread-tracker"
BOT_USER_ID="${SLAM_BOT_USER_ID:-U0ALQHDUVSM}"

DRY_RUN=false
MAX_AGE_DAYS=14
ONE_CHANNEL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)       DRY_RUN=true; shift ;;
    --max-age-days)  MAX_AGE_DAYS="$2"; shift 2 ;;
    --channel)       ONE_CHANNEL="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backfill: $*"; }

if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "ERROR: SLACK_BOT_TOKEN not set" >&2
  exit 1
fi

# ── Channels to scan ─────────────────────────────────────────────────────────
# Defaults to the slack-triage channels. Filter to ONE_CHANNEL if specified.
CHANNELS=()
if [ -n "$ONE_CHANNEL" ]; then
  CHANNELS+=("$ONE_CHANNEL")
else
  [ -n "${SHANTAM_SLACK_DM:-}" ]         && CHANNELS+=("$SHANTAM_SLACK_DM")
  [ -n "${PMF1_CHANNEL_ID:-}" ]          && CHANNELS+=("$PMF1_CHANNEL_ID")
  [ -n "${AGENTIC_DEVS_CHANNEL_ID:-}" ]  && CHANNELS+=("$AGENTIC_DEVS_CHANNEL_ID")
  [ -n "${SLAM_BOT_CHANNEL_ID:-}" ]    && CHANNELS+=("$SLAM_BOT_CHANNEL_ID")
fi

if [ ${#CHANNELS[@]} -eq 0 ]; then
  echo "ERROR: no channels configured (set SHANTAM_SLACK_DM etc. or pass --channel)" >&2
  exit 1
fi

mkdir -p "$TRACKER_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────────

# Convert a Slack ts ("1775900000.000001") to ISO-8601 UTC
ts_to_iso() {
  local ts="$1"
  local secs="${ts%%.*}"
  date -u -d "@$secs" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
    date -u -r "$secs" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null
}

# Truncate text to ~1200 chars (matches write-tracker.sh MAX_TEXT_LEN)
truncate_text() {
  local t="$1"
  if [ "${#t}" -gt 1200 ]; then
    echo "${t:0:1197}..."
  else
    echo "$t"
  fi
}

# Extract linked_issue and linked_pr from a bot reply text.
# Looks for github.com/shantamg/meet-without-fear/issues/N and github.com/shantamg/meet-without-fear/pull/N,
# and falls back to bare "Issue #N" / "PR #N" / "#N" references.
# Echoes "ISSUE|PR" where each may be empty.
extract_artifact() {
  local text="$1"
  local issue="" pr=""

  issue=$(echo "$text" | grep -oE 'github\.com/shantamg/meet-without-fear/issues/[0-9]+' | head -1 | grep -oE '[0-9]+$')
  pr=$(echo "$text"    | grep -oE 'github\.com/shantamg/meet-without-fear/pull/[0-9]+'   | head -1 | grep -oE '[0-9]+$')

  # Fallback: "Issue #N" or "PR #N" textual references
  [ -z "$issue" ] && issue=$(echo "$text" | grep -oE '[Ii]ssue #?[0-9]+'  | head -1 | grep -oE '[0-9]+')
  [ -z "$pr"    ] && pr=$(echo    "$text" | grep -oE '[Pp]ull [Rr]equest #?[0-9]+\|PR #?[0-9]+' | head -1 | grep -oE '[0-9]+')

  echo "${issue}|${pr}"
}

# Write a tracker file directly (bypass write-tracker.sh so we can set created_at
# to the real thread age, not now).
write_tracker_file() {
  local channel="$1"
  local thread_ts="$2"
  local created_at="$3"
  local last_bot_reply_ts="$4"
  local linked_issue="$5"
  local linked_pr="$6"
  local human_msg="$7"
  local bot_reply="$8"
  local user_id="$9"

  local file="${TRACKER_DIR}/${channel}-${thread_ts}.json"

  local issue_arg=null pr_arg=null
  [ -n "$linked_issue" ] && issue_arg="$linked_issue"
  [ -n "$linked_pr" ]    && pr_arg="$linked_pr"

  jq -n \
    --arg channel "$channel" \
    --arg thread_ts "$thread_ts" \
    --argjson linked_issue "$issue_arg" \
    --argjson linked_pr "$pr_arg" \
    --arg last_bot_reply_ts "$last_bot_reply_ts" \
    --arg created_at "$created_at" \
    --arg human "$(truncate_text "$human_msg")" \
    --arg bot "$(truncate_text "$bot_reply")" \
    --arg user_id "$user_id" \
    '{
      channel: $channel,
      thread_ts: $thread_ts,
      linked_issue: $linked_issue,
      linked_pr: $linked_pr,
      last_bot_reply_ts: $last_bot_reply_ts,
      status: "open",
      created_at: $created_at,
      follow_up_count: 0,
      original_human_message: $human,
      bot_first_reply: $bot,
      user_id: $user_id,
      backfilled: true
    }' > "$file"
}

# ── Per-channel scan ─────────────────────────────────────────────────────────
process_channel() {
  local channel="$1"
  log "scanning $channel (max_age=${MAX_AGE_DAYS}d)"

  local oldest
  oldest=$(date -d "-${MAX_AGE_DAYS} days" +%s 2>/dev/null || date -v-${MAX_AGE_DAYS}d +%s 2>/dev/null)

  local resp
  resp=$(curl -s --max-time 20 \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    "https://slack.com/api/conversations.history?channel=${channel}&oldest=${oldest}&limit=200")

  local ok
  ok=$(echo "$resp" | jq -r '.ok // false')
  if [ "$ok" != "true" ]; then
    log "ERROR: history failed for $channel — $(echo "$resp" | jq -r '.error // "unknown"')"
    return 1
  fi

  local total=0 created=0 skipped_existing=0 skipped_no_bot=0 skipped_no_link=0

  while IFS= read -r msg; do
    total=$((total + 1))

    local ts user text
    ts=$(echo "$msg" | jq -r '.ts')
    user=$(echo "$msg" | jq -r '.user // empty')
    text=$(echo "$msg" | jq -r '.text // empty')

    # Skip if parent has no user (system messages, deleted users, etc.)
    [ -z "$user" ] && continue

    # Skip if parent is the bot itself
    [ "$user" = "$BOT_USER_ID" ] && continue

    # Idempotency: skip if a tracker file already exists for this thread
    local tracker_file="${TRACKER_DIR}/${channel}-${ts}.json"
    if [ -f "$tracker_file" ]; then
      skipped_existing=$((skipped_existing + 1))
      continue
    fi

    # Fetch thread replies
    local replies_resp
    replies_resp=$(curl -s --max-time 15 \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      "https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&limit=50")
    sleep 1  # friendly to Slack rate limits

    local replies_ok
    replies_ok=$(echo "$replies_resp" | jq -r '.ok // false')
    [ "$replies_ok" != "true" ] && continue

    # First bot reply that contains a GitHub link or textual issue/PR ref
    local bot_reply_json
    bot_reply_json=$(echo "$replies_resp" | jq -c --arg bot "$BOT_USER_ID" '
      [.messages[] | select(.user == $bot) |
       select(.text and (
         (.text | test("github\\.com/shantamg/meet-without-fear"; "i")) or
         (.text | test("[Ii]ssue ?#[0-9]+"; "")) or
         (.text | test("[Pp]ull [Rr]equest ?#[0-9]+"; "")) or
         (.text | test("PR ?#[0-9]+"; ""))
       ))] | .[0] // empty')

    if [ -z "$bot_reply_json" ] || [ "$bot_reply_json" = "null" ]; then
      skipped_no_bot=$((skipped_no_bot + 1))
      continue
    fi

    local bot_ts bot_text
    bot_ts=$(echo   "$bot_reply_json" | jq -r '.ts')
    bot_text=$(echo "$bot_reply_json" | jq -r '.text')

    local artifact issue pr
    artifact=$(extract_artifact "$bot_text")
    issue="${artifact%%|*}"
    pr="${artifact##*|}"

    if [ -z "$issue" ] && [ -z "$pr" ]; then
      skipped_no_link=$((skipped_no_link + 1))
      continue
    fi

    local created_at
    created_at=$(ts_to_iso "$ts")

    log "  backfill: $channel/$ts age=$(( ($(date +%s) - ${ts%%.*}) / 3600 ))h issue=${issue:-_} pr=${pr:-_}"

    if [ "$DRY_RUN" = true ]; then
      continue
    fi

    write_tracker_file "$channel" "$ts" "$created_at" "$bot_ts" "$issue" "$pr" "$text" "$bot_text" "$user"
    created=$((created + 1))

  done < <(echo "$resp" | jq -c '.messages[]')

  log "  $channel summary: scanned=$total created=$created skipped(existing=$skipped_existing, no_bot_link=$skipped_no_bot, no_parsed_link=$skipped_no_link)"
}

# ── Run ──────────────────────────────────────────────────────────────────────
log "starting backfill (dry_run=$DRY_RUN, channels=${#CHANNELS[@]})"
for ch in "${CHANNELS[@]}"; do
  process_channel "$ch"
done
log "backfill complete"
