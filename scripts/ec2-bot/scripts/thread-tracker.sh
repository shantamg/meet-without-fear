#!/bin/bash
# thread-tracker.sh — Cron script that scans tracked Slack threads, checks
# linked GitHub issue/PR states via github-state.json, checks Slack thread
# activity, and posts Claude-drafted follow-up messages.
#
# Schedule: */30 * * * * /opt/slam-bot/scripts/thread-tracker.sh >> /var/log/slam-bot/thread-tracker.log 2>&1
#
# Design:
#   - Fast path: exits in <2s when no trackable files exist
#   - Tier 1: reads github-state.json (no direct GitHub API calls)
#   - Tier 2: Slack API thread checks, staleness nudge, explicit closure
#   - Per-person daily cap: max 3 follow-ups per user per day (midnight ET reset)
#   - Type-aware prioritization: completion > nudge > closure
#   - One batched Claude invocation per tick for all follow-ups
#   - TTL: prunes tracker files older than 14 days
#   - Rate limit: max 20 Slack API calls per tick with 1s delays
#
# shellcheck shell=bash

set -uo pipefail

# ── Source shared config ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/config.sh" ]; then
  source "$SCRIPT_DIR/lib/config.sh"
fi
if [ -f "$SCRIPT_DIR/lib/github-state.sh" ]; then
  source "$SCRIPT_DIR/lib/github-state.sh"
fi

# Cron runs us with no environment, so explicitly source the bot env file
# (if present) to pick up SLACK_BOT_TOKEN, channel IDs, and friends. We use
# `set -a` so non-`export` lines also propagate.
if [ -f /opt/slam-bot/.env ]; then
  set -a
  source /opt/slam-bot/.env
  set +a
fi

# ── Paths ────────────────────────────────────────────────────────────────────
TRACKER_DIR="${BOT_STATE_DIR:-/opt/slam-bot/state}/thread-tracker"
CHANNEL_CONFIG="${REPO_ROOT:-${HOME}/meet-without-fear}/bot/channel-config.json"
SLACK_POST="${BOT_SCRIPTS_DIR:-/opt/slam-bot/scripts}/slack-post.sh"
TTL_DAYS=14
MAX_SLACK_API_CALLS=${MAX_SLACK_API_CALLS:-20}
SLACK_API_DELAY=${SLACK_API_DELAY:-1}
STALENESS_HOURS=24
CLOSURE_HOURS=48
STATS_FILE="${BOT_STATE_DIR:-/opt/slam-bot/state}/thread-tracker/stats.json"
DAILY_CAP_DIR="${TRACKER_DIR}/daily-caps"
DAILY_CAP_MAX=${DAILY_CAP_MAX:-3}
DAILY_CAP_TTL_DAYS=2

# ── Logging ──────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] thread-tracker: $*"; }

# ── Golden window check ─────────────────────────────────────────────────────
# Weekdays 10am–4pm ET — the only window for staleness nudges
is_golden_window() {
  local dow hour
  dow=$(TZ=America/New_York date +%u 2>/dev/null || echo 0)   # 1=Mon, 7=Sun
  hour=$(TZ=America/New_York date +%H 2>/dev/null || echo 0)
  [ "$dow" -ge 1 ] && [ "$dow" -le 5 ] && [ "$hour" -ge 10 ] && [ "$hour" -lt 16 ]
}

# ── Tick counters (for structured logging) ───────────────────────────────────
TICK_START=$(date +%s%N 2>/dev/null || echo 0)
COUNT_OPEN_SCANNED=0
COUNT_GITHUB_STATE_CHECKS=0
COUNT_SLACK_API_CALLS=0
COUNT_COMPLETIONS=0
COUNT_NUDGES=0
COUNT_CLOSURES=0
COUNT_PRUNED=0

# ── Structured tick summary ──────────────────────────────────────────────────
emit_tick_summary() {
  local elapsed_ms=0
  local tick_end
  tick_end=$(date +%s%N 2>/dev/null || echo 0)
  if [ "$TICK_START" -gt 0 ] && [ "$tick_end" -gt 0 ]; then
    elapsed_ms=$(( (tick_end - TICK_START) / 1000000 ))
  fi

  jq -nc \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson open_scanned "$COUNT_OPEN_SCANNED" \
    --argjson github_state_checks "$COUNT_GITHUB_STATE_CHECKS" \
    --argjson slack_api_calls "$COUNT_SLACK_API_CALLS" \
    --argjson completions "$COUNT_COMPLETIONS" \
    --argjson nudges "$COUNT_NUDGES" \
    --argjson closures "$COUNT_CLOSURES" \
    --argjson pruned "$COUNT_PRUNED" \
    --argjson elapsed_ms "$elapsed_ms" \
    '{
      event: "tick_summary",
      timestamp: $ts,
      open_scanned: $open_scanned,
      github_state_checks: $github_state_checks,
      slack_api_calls: $slack_api_calls,
      followups: { completions: $completions, nudges: $nudges, closures: $closures },
      pruned: $pruned,
      elapsed_ms: $elapsed_ms
    }'
}

# ── Daily stats aggregation ──────────────────────────────────────────────────
update_daily_stats() {
  local today
  today=$(date -u +%Y-%m-%d)
  mkdir -p "$(dirname "$STATS_FILE")"

  if [ -f "$STATS_FILE" ]; then
    local existing_date
    existing_date=$(jq -r '.date // ""' "$STATS_FILE" 2>/dev/null)
    if [ "$existing_date" = "$today" ]; then
      # Increment existing counters
      jq \
        --argjson completions "$COUNT_COMPLETIONS" \
        --argjson nudges "$COUNT_NUDGES" \
        --argjson closures "$COUNT_CLOSURES" \
        --argjson open "$COUNT_OPEN_SCANNED" \
        --argjson pruned "$COUNT_PRUNED" \
        --argjson slack "$COUNT_SLACK_API_CALLS" \
        '.completions_sent += $completions |
         .nudges_sent += $nudges |
         .closures_sent += $closures |
         .threads_tracked = ([.threads_tracked, $open] | max) |
         .threads_resolved += $completions |
         .threads_pruned += $pruned |
         .slack_api_calls += $slack |
         .ticks_run += 1' \
        "$STATS_FILE" > "${STATS_FILE}.tmp" && mv "${STATS_FILE}.tmp" "$STATS_FILE"
      return
    fi
  fi

  # New day or no file — initialize
  jq -n \
    --arg date "$today" \
    --argjson completions "$COUNT_COMPLETIONS" \
    --argjson nudges "$COUNT_NUDGES" \
    --argjson closures "$COUNT_CLOSURES" \
    --argjson open "$COUNT_OPEN_SCANNED" \
    --argjson pruned "$COUNT_PRUNED" \
    --argjson slack "$COUNT_SLACK_API_CALLS" \
    '{
      date: $date,
      completions_sent: $completions,
      nudges_sent: $nudges,
      closures_sent: $closures,
      threads_tracked: $open,
      threads_resolved: $completions,
      threads_pruned: $pruned,
      slack_api_calls: $slack,
      ticks_run: 1
    }' > "$STATS_FILE"
}

# ── Per-person daily cap helpers ──────────────────────────────────────────────
# Counter files: daily-caps/{YYYY-MM-DD}-{user_id}.count (plain integer)
# Date uses ET to match the bot's operational timezone.

daily_cap_date() {
  TZ=America/New_York date +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d
}

daily_cap_file() {
  local user_id="$1"
  echo "${DAILY_CAP_DIR}/$(daily_cap_date)-${user_id}.count"
}

daily_cap_read() {
  local user_id="$1"
  local f
  f=$(daily_cap_file "$user_id")
  if [ -f "$f" ]; then
    cat "$f" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

daily_cap_increment() {
  local user_id="$1"
  mkdir -p "$DAILY_CAP_DIR"
  local f
  f=$(daily_cap_file "$user_id")
  local current
  current=$(daily_cap_read "$user_id")
  echo $((current + 1)) > "$f"
}

daily_cap_reached() {
  local user_id="$1"
  local current
  current=$(daily_cap_read "$user_id")
  [ "$current" -ge "$DAILY_CAP_MAX" ]
}

# Clean up counter files older than DAILY_CAP_TTL_DAYS
daily_cap_cleanup() {
  [ ! -d "$DAILY_CAP_DIR" ] && return
  local cutoff_epoch
  cutoff_epoch=$(date -d "-${DAILY_CAP_TTL_DAYS} days" +%s 2>/dev/null || date -v-${DAILY_CAP_TTL_DAYS}d +%s 2>/dev/null)
  local cleaned=0
  for f in "$DAILY_CAP_DIR"/*.count; do
    [ -f "$f" ] || continue
    # Extract date from filename: {YYYY-MM-DD}-{user_id}.count
    local basename_f
    basename_f=$(basename "$f")
    local file_date="${basename_f%%-U*}"
    # Also handle non-U prefixed user IDs
    if [[ ! "$file_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      file_date=$(echo "$basename_f" | grep -oP '^\d{4}-\d{2}-\d{2}' || echo "")
    fi
    [ -z "$file_date" ] && continue
    local file_epoch
    file_epoch=$(date -d "$file_date" +%s 2>/dev/null || echo 0)
    if [ "$file_epoch" -gt 0 ] && [ "$file_epoch" -lt "$cutoff_epoch" ]; then
      rm -f "$f"
      cleaned=$((cleaned + 1))
    fi
  done
  [ "$cleaned" -gt 0 ] && log "cleaned $cleaned daily cap file(s) older than ${DAILY_CAP_TTL_DAYS} days"
}

# Follow-up type priority (lower = higher priority)
type_priority() {
  case "$1" in
    completion) echo 0 ;;
    nudge)      echo 1 ;;
    closure)    echo 2 ;;
    *)          echo 9 ;;
  esac
}

# ── Fast path ────────────────────────────────────────────────────────────────
if [ ! -d "$TRACKER_DIR" ]; then
  log "no tracker directory — nothing to do"
  emit_tick_summary
  exit 0
fi

# Collect trackable files: open + closed (closed needed for reactivation checks)
TRACKABLE_FILES=()
for f in "$TRACKER_DIR"/*.json; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "stats.json" ] && continue
  status=$(jq -r '.status // "open"' "$f" 2>/dev/null)
  if [ "$status" = "open" ] || [ "$status" = "closed" ]; then
    TRACKABLE_FILES+=("$f")
  fi
done

if [ ${#TRACKABLE_FILES[@]} -eq 0 ]; then
  log "no trackable files — nothing to do"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

COUNT_OPEN_SCANNED=${#TRACKABLE_FILES[@]}
log "found ${#TRACKABLE_FILES[@]} trackable file(s)"

# ── TTL pruning ──────────────────────────────────────────────────────────────
PRUNED=0
CUTOFF_EPOCH=$(date -d "-${TTL_DAYS} days" +%s 2>/dev/null || date -v-${TTL_DAYS}d +%s 2>/dev/null)

for f in "$TRACKER_DIR"/*.json; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "stats.json" ] && continue
  created_at=$(jq -r '.created_at // empty' "$f" 2>/dev/null)
  [ -z "$created_at" ] && continue

  created_epoch=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$created_at" +%s 2>/dev/null || echo 0)
  if [ "$created_epoch" -gt 0 ] && [ "$created_epoch" -lt "$CUTOFF_EPOCH" ]; then
    age_days=$(( ($(date +%s) - created_epoch) / 86400 ))
    log "TTL prune: $(basename "$f") — age ${age_days}d exceeds ${TTL_DAYS}d limit (created $created_at)"
    rm -f "$f"
    PRUNED=$((PRUNED + 1))
  fi
done

COUNT_PRUNED=$PRUNED
[ "$PRUNED" -gt 0 ] && log "pruned $PRUNED tracker file(s) older than ${TTL_DAYS} days"

# ── Daily cap file cleanup ───────────────────────────────────────────────────
daily_cap_cleanup

# ── Check github-state freshness ─────────────────────────────────────────────
# Use a relaxed freshness window (300s) since we run every 30min
GITHUB_STATE_MAX_AGE_SECS=${GITHUB_STATE_MAX_AGE_SECS:-300}
GITHUB_STATE_FRESH=true
if ! github_state_assert_fresh 2>/dev/null; then
  log "WARNING: github-state file is stale or missing — skipping state checks this tick"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

# ── Tier 1: GitHub state checks ─────────────────────────────────────────────
# For each open tracker with a linked issue/PR, check if the issue is CLOSED
# or the PR is MERGED. Collect changed threads for batched Claude follow-up.

CHANGED_THREADS=()  # JSON objects for Claude drafting
TIER1_RESOLVED_FILES=()  # files resolved by Tier 1

if [ "$GITHUB_STATE_FRESH" = true ]; then
  for f in "${TRACKABLE_FILES[@]}"; do
    [ -f "$f" ] || continue
    status=$(jq -r '.status // "open"' "$f" 2>/dev/null)
    [ "$status" != "open" ] && continue

    channel=$(jq -r '.channel // empty' "$f")
    thread_ts=$(jq -r '.thread_ts // empty' "$f")
    linked_issue=$(jq -r '.linked_issue // empty' "$f")
    linked_pr=$(jq -r '.linked_pr // empty' "$f")
    human_msg=$(jq -r '.original_human_message // empty' "$f")
    bot_reply=$(jq -r '.bot_first_reply // empty' "$f")
    user_id=$(jq -r '.user_id // empty' "$f")

    [ -z "$channel" ] || [ -z "$thread_ts" ] && continue

    resolution=""
    resolution_detail=""

    # Check linked issue state (reads from github-state.json, no API calls)
    if [ -n "$linked_issue" ] && [ "$linked_issue" != "null" ]; then
      COUNT_GITHUB_STATE_CHECKS=$((COUNT_GITHUB_STATE_CHECKS + 1))
      issue_state=$(github_state_issue_field "$linked_issue" "state" 2>/dev/null)
      if [ "$issue_state" = "CLOSED" ]; then
        issue_title=$(github_state_issue_field "$linked_issue" "title" 2>/dev/null)
        resolution="issue_closed"
        resolution_detail="Issue #${linked_issue} (${issue_title}) was closed"
      fi
    fi

    # Check linked PR state (PR merged = no longer in open state file meaning merged/closed)
    if [ -n "$linked_pr" ] && [ "$linked_pr" != "null" ] && [ -z "$resolution" ]; then
      COUNT_GITHUB_STATE_CHECKS=$((COUNT_GITHUB_STATE_CHECKS + 1))
      pr_json=$(github_state_pr "$linked_pr" 2>/dev/null)
      if [ "$pr_json" = "null" ] || [ -z "$pr_json" ]; then
        # PR is no longer in state file — it was merged or closed
        resolution="pr_completed"
        resolution_detail="PR #${linked_pr} was merged or closed"
      fi
    fi

    # If something changed, add to batch
    if [ -n "$resolution" ]; then
      log "Tier 1 state change: $(basename "$f") — $resolution_detail"
      thread_json=$(jq -nc \
        --arg file "$f" \
        --arg channel "$channel" \
        --arg thread_ts "$thread_ts" \
        --arg type "completion" \
        --arg resolution "$resolution" \
        --arg resolution_detail "$resolution_detail" \
        --arg human_msg "$human_msg" \
        --arg bot_reply "$bot_reply" \
        --arg linked_issue "${linked_issue:-}" \
        --arg linked_pr "${linked_pr:-}" \
        --arg user_id "${user_id:-}" \
        '{
          file: $file,
          channel: $channel,
          thread_ts: $thread_ts,
          type: $type,
          resolution: $resolution,
          resolution_detail: $resolution_detail,
          human_msg: $human_msg,
          bot_reply: $bot_reply,
          linked_issue: $linked_issue,
          linked_pr: $linked_pr,
          user_id: $user_id
        }')
      CHANGED_THREADS+=("$thread_json")
      TIER1_RESOLVED_FILES+=("$f")
    fi
  done
fi

# ── Tier 2: Slack API thread checks ─────────────────────────────────────────
# For threads not resolved by Tier 1: fetch Slack replies, check for
# reactivation, staleness nudge eligibility, and closure eligibility.

SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_API_CALLS=0

if [ -n "$SLACK_BOT_TOKEN" ]; then
  # Build list of Tier 2 candidates (trackable files not resolved by Tier 1)
  TIER2_CANDIDATES=()
  for f in "${TRACKABLE_FILES[@]}"; do
    [ -f "$f" ] || continue
    skip=false
    for resolved in "${TIER1_RESOLVED_FILES[@]}"; do
      if [ "$f" = "$resolved" ]; then skip=true; break; fi
    done
    $skip && continue
    TIER2_CANDIDATES+=("$f")
  done

  if [ ${#TIER2_CANDIDATES[@]} -gt 0 ]; then
    log "Tier 2: checking ${#TIER2_CANDIDATES[@]} thread(s) via Slack API"

    for f in "${TIER2_CANDIDATES[@]}"; do
      [ "$SLACK_API_CALLS" -ge "$MAX_SLACK_API_CALLS" ] && {
        log "Tier 2: rate limit reached (${MAX_SLACK_API_CALLS} calls) — deferring remaining"
        break
      }
      [ -f "$f" ] || continue

      channel=$(jq -r '.channel // empty' "$f")
      thread_ts=$(jq -r '.thread_ts // empty' "$f")
      status=$(jq -r '.status // "open"' "$f")
      last_bot_reply_ts=$(jq -r '.last_bot_reply_ts // empty' "$f")
      created_at=$(jq -r '.created_at // empty' "$f")
      nudge_count=$(jq -r '.nudge_count // 0' "$f")
      nudge_sent_at=$(jq -r '.nudge_sent_at // empty' "$f")
      closure_count=$(jq -r '.closure_count // 0' "$f")
      human_msg=$(jq -r '.original_human_message // empty' "$f")
      bot_reply=$(jq -r '.bot_first_reply // empty' "$f")
      user_id=$(jq -r '.user_id // empty' "$f")

      [ -z "$channel" ] || [ -z "$thread_ts" ] && continue

      # Fetch thread replies from Slack API
      REPLY_JSON=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        "https://slack.com/api/conversations.replies?channel=${channel}&ts=${thread_ts}&limit=100")
      SLACK_API_CALLS=$((SLACK_API_CALLS + 1))

      ok=$(echo "$REPLY_JSON" | jq -r '.ok // false')
      if [ "$ok" != "true" ]; then
        log "WARNING: Slack API error for $(basename "$f") — $(echo "$REPLY_JSON" | jq -r '.error // "unknown"')"
        sleep "$SLACK_API_DELAY"
        continue
      fi

      # Find the timestamp of the last human message (not from a bot)
      LAST_HUMAN_TS=$(echo "$REPLY_JSON" | jq -r '
        [.messages[] | select(.bot_id == null and .subtype == null)] |
        sort_by(.ts) | last | .ts // empty')

      # Extract user_id from thread parent if not in tracker (legacy backfill)
      if [ -z "$user_id" ]; then
        user_id=$(echo "$REPLY_JSON" | jq -r '.messages[0].user // empty')
        if [ -n "$user_id" ]; then
          # Backfill user_id into tracker file for future ticks
          UPDATED=$(jq --arg uid "$user_id" '.user_id = $uid' "$f")
          echo "$UPDATED" > "$f"
        fi
      fi

      # ── Reactivation check ───────────────────────────────────────────────
      # If thread was closed and a human replied after closure, reactivate it
      if [ "$status" = "closed" ]; then
        closure_sent_at=$(jq -r '.closure_sent_at // empty' "$f")
        if [ -n "$LAST_HUMAN_TS" ] && [ -n "$closure_sent_at" ]; then
          closure_epoch=$(date -d "$closure_sent_at" +%s 2>/dev/null || echo 0)
          human_epoch=$(echo "$LAST_HUMAN_TS" | cut -d. -f1)
          if [ "$human_epoch" -gt "$closure_epoch" ]; then
            log "reactivation: $(basename "$f") — human replied after closure"
            UPDATED=$(jq '
              .status = "open" |
              .nudge_count = 0 |
              .closure_count = 0 |
              del(.nudge_sent_at) |
              del(.closure_sent_at) |
              del(.resolved_at)
            ' "$f")
            echo "$UPDATED" > "$f"
            # Process as fresh thread on next tick
            sleep "$SLACK_API_DELAY"
            continue
          fi
        fi
        # Closed with no new human activity — skip
        sleep "$SLACK_API_DELAY"
        continue
      fi

      # ── From here, status is "open" ────────────────────────────────────

      # Check if there are unanswered human messages (human replied after bot)
      has_unanswered=false
      if [ -n "$LAST_HUMAN_TS" ] && [ -n "$last_bot_reply_ts" ]; then
        human_epoch=$(echo "$LAST_HUMAN_TS" | cut -d. -f1)
        bot_epoch=$(echo "$last_bot_reply_ts" | cut -d. -f1)
        if [ "$human_epoch" -gt "$bot_epoch" ]; then
          has_unanswered=true
        fi
      fi

      NOW_EPOCH=$(date +%s)
      created_epoch=$(date -d "$created_at" +%s 2>/dev/null || echo 0)
      age_hours=$(( (NOW_EPOCH - created_epoch) / 3600 ))

      # ── Explicit closure (48h after nudge, no human response) ──────────
      if [ "$nudge_count" -gt 0 ] && [ "$closure_count" -eq 0 ] && \
         [ -n "$nudge_sent_at" ] && [ "$has_unanswered" = false ]; then
        nudge_epoch=$(date -d "$nudge_sent_at" +%s 2>/dev/null || echo 0)
        hours_since_nudge=$(( (NOW_EPOCH - nudge_epoch) / 3600 ))
        if [ "$hours_since_nudge" -ge "$CLOSURE_HOURS" ]; then
          log "closure eligible: $(basename "$f") — ${hours_since_nudge}h since nudge"
          thread_json=$(jq -nc \
            --arg file "$f" \
            --arg channel "$channel" \
            --arg thread_ts "$thread_ts" \
            --arg type "closure" \
            --arg human_msg "$human_msg" \
            --arg bot_reply "$bot_reply" \
            --arg user_id "${user_id:-}" \
            '{
              file: $file,
              channel: $channel,
              thread_ts: $thread_ts,
              type: $type,
              human_msg: $human_msg,
              bot_reply: $bot_reply,
              user_id: $user_id
            }')
          CHANGED_THREADS+=("$thread_json")
          sleep "$SLACK_API_DELAY"
          continue
        fi
      fi

      # ── Staleness nudge (>24h, no human activity, 1 per lifetime) ──────
      if [ "$age_hours" -ge "$STALENESS_HOURS" ] && [ "$nudge_count" -eq 0 ] && \
         [ "$has_unanswered" = false ]; then
        if is_golden_window; then
          log "nudge eligible: $(basename "$f") — ${age_hours}h old, no recent human activity"
          linked_issue=$(jq -r '.linked_issue // empty' "$f")
          linked_pr=$(jq -r '.linked_pr // empty' "$f")
          thread_json=$(jq -nc \
            --arg file "$f" \
            --arg channel "$channel" \
            --arg thread_ts "$thread_ts" \
            --arg type "nudge" \
            --arg human_msg "$human_msg" \
            --arg bot_reply "$bot_reply" \
            --arg linked_issue "${linked_issue:-}" \
            --arg linked_pr "${linked_pr:-}" \
            --arg user_id "${user_id:-}" \
            --argjson age_hours "$age_hours" \
            '{
              file: $file,
              channel: $channel,
              thread_ts: $thread_ts,
              type: $type,
              human_msg: $human_msg,
              bot_reply: $bot_reply,
              linked_issue: $linked_issue,
              linked_pr: $linked_pr,
              user_id: $user_id,
              age_hours: $age_hours
            }')
          CHANGED_THREADS+=("$thread_json")
        else
          log "nudge deferred (outside golden window): $(basename "$f")"
        fi
      fi

      sleep "$SLACK_API_DELAY"
    done

    log "Tier 2 complete: ${SLACK_API_CALLS} Slack API call(s)"
  fi
elif [ ${#TIER1_RESOLVED_FILES[@]} -eq 0 ]; then
  # No Slack token and no Tier 1 changes — nothing for Tier 2 to do
  log "SLACK_BOT_TOKEN not set — skipping Tier 2 checks"
fi

# ── Check if anything needs follow-up ────────────────────────────────────────
if [ ${#CHANGED_THREADS[@]} -eq 0 ]; then
  log "no state changes detected — done"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

log "${#CHANGED_THREADS[@]} thread(s) need follow-ups — applying daily caps"

# ── Type-aware prioritization and daily cap filtering ────────────────────────
# Sort by type priority (completion > nudge > closure) so higher-priority
# follow-ups consume cap slots first. Then filter out capped users.

# Sort CHANGED_THREADS by type priority using a temp file
SORTED_FILE=$(mktemp)
for thread_json in "${CHANGED_THREADS[@]}"; do
  type=$(echo "$thread_json" | jq -r '.type')
  prio=$(type_priority "$type")
  printf '%d\t%s\n' "$prio" "$thread_json" >> "$SORTED_FILE"
done
SORTED_THREADS=()
while IFS=$'\t' read -r _prio json; do
  SORTED_THREADS+=("$json")
done < <(sort -n "$SORTED_FILE")
rm -f "$SORTED_FILE"

# Apply daily cap — skip follow-ups for users who've hit their limit.
# We track in-flight reservations in an associative-style counter (user:count pairs)
# to correctly cap when multiple follow-ups target the same user in one tick.
CAPPED_THREADS=()
DEFERRED=0
INFLIGHT_USERS=""  # space-separated "uid:count" pairs for in-tick tracking

_inflight_count() {
  local uid="$1"
  echo "$INFLIGHT_USERS" | tr ' ' '\n' | grep "^${uid}:" | cut -d: -f2 | tail -1
}

_inflight_add() {
  local uid="$1"
  local current
  current=$(_inflight_count "$uid")
  current=${current:-0}
  # Remove old entry and add updated one
  INFLIGHT_USERS=$(echo "$INFLIGHT_USERS" | tr ' ' '\n' | grep -v "^${uid}:" | tr '\n' ' ')
  INFLIGHT_USERS="$INFLIGHT_USERS ${uid}:$((current + 1))"
}

for thread_json in "${SORTED_THREADS[@]}"; do
  uid=$(echo "$thread_json" | jq -r '.user_id // empty')
  type=$(echo "$thread_json" | jq -r '.type')

  # If no user_id, we can't enforce a cap — allow it through
  if [ -z "$uid" ]; then
    CAPPED_THREADS+=("$thread_json")
    continue
  fi

  # Check: existing daily count + in-flight reservations this tick
  existing=$(daily_cap_read "$uid")
  inflight=$(_inflight_count "$uid")
  inflight=${inflight:-0}
  total=$((existing + inflight))

  if [ "$total" -ge "$DAILY_CAP_MAX" ]; then
    log "daily cap reached for user $uid — deferring ${type} follow-up ($(echo "$thread_json" | jq -r '.file | split("/") | last'))"
    DEFERRED=$((DEFERRED + 1))
    continue
  fi

  CAPPED_THREADS+=("$thread_json")
  _inflight_add "$uid"
done

[ "$DEFERRED" -gt 0 ] && log "deferred $DEFERRED follow-up(s) due to daily caps"

CHANGED_THREADS=("${CAPPED_THREADS[@]}")

if [ ${#CHANGED_THREADS[@]} -eq 0 ]; then
  log "all follow-ups deferred by daily caps — done"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

log "${#CHANGED_THREADS[@]} follow-up(s) proceeding after cap filtering — drafting messages"

# ── Channel tone lookup ──────────────────────────────────────────────────────
# Map channel IDs to names/tone from channel-config.json and .env
get_channel_tone() {
  local channel_id="$1"
  local channel_name=""

  # Try to resolve channel ID to name via channel-config.json
  if [ -f "$CHANNEL_CONFIG" ]; then
    while IFS= read -r entry; do
      local env_var name
      env_var=$(echo "$entry" | jq -r '.env_var')
      name=$(echo "$entry" | jq -r '.name')
      local resolved_id="${!env_var:-}"
      if [ "$resolved_id" = "$channel_id" ]; then
        channel_name="$name"
        break
      fi
    done < <(jq -c '.channels[]' "$CHANNEL_CONFIG" 2>/dev/null)
  fi

  case "$channel_name" in
    "#pmf1"|"DM (Shantam)")
      echo "warm and friendly — keep it brief, non-technical, supportive" ;;
    "#agentic-devs"|"#slam-bot")
      echo "technical and concise — can reference PRs and technical details" ;;
    "#bot-scientist")
      echo "professional and science-oriented" ;;
    *)
      echo "friendly and helpful" ;;
  esac
}

# ── Claude follow-up drafting ────────────────────────────────────────────────
# Build a single prompt with all threads for one batched invocation

build_prompt() {
  local prompt="You are LovelyBot, a helpful assistant. Draft short follow-up messages for Slack threads. Each message should:
- Be 1-2 sentences max
- Match the channel tone specified
- Output ONLY the JSON array, no markdown fences

Types of follow-ups:
- completion: Work resolved. Reference the PR/issue number, let them know work landed, offer to help.
- nudge: Checking in. The thread has been open a while with no resolution. Be warm, ask if they still need help or if it's resolved.
- closure: Closing the loop. No response after a check-in. Let them know you're closing the thread but they can reply any time to reopen.

Respond with a JSON array of objects, each with \"index\" (0-based) and \"message\" fields.

Threads:
"

  local i=0
  for thread_json in "${CHANGED_THREADS[@]}"; do
    local channel human_msg bot_reply type tone
    channel=$(echo "$thread_json" | jq -r '.channel')
    human_msg=$(echo "$thread_json" | jq -r '.human_msg')
    bot_reply=$(echo "$thread_json" | jq -r '.bot_reply')
    type=$(echo "$thread_json" | jq -r '.type')
    tone=$(get_channel_tone "$channel")

    prompt+="
---
Thread ${i} (type: ${type}):
Channel tone: ${tone}
Human's original message: ${human_msg}
Bot's first reply: ${bot_reply}"

    # Add type-specific context
    case "$type" in
      completion)
        local resolution_detail
        resolution_detail=$(echo "$thread_json" | jq -r '.resolution_detail')
        prompt+="
Resolution: ${resolution_detail}"
        ;;
      nudge)
        local age_hours linked_issue linked_pr
        age_hours=$(echo "$thread_json" | jq -r '.age_hours')
        linked_issue=$(echo "$thread_json" | jq -r '.linked_issue')
        linked_pr=$(echo "$thread_json" | jq -r '.linked_pr')
        prompt+="
Thread age: ${age_hours} hours"
        [ -n "$linked_issue" ] && [ "$linked_issue" != "" ] && prompt+="
Linked issue: #${linked_issue} (still open)"
        [ -n "$linked_pr" ] && [ "$linked_pr" != "" ] && prompt+="
Linked PR: #${linked_pr} (still open)"
        ;;
      closure)
        prompt+="
Note: A check-in was sent 48+ hours ago with no response. Close the loop warmly."
        ;;
    esac

    prompt+="
---
"
    i=$((i + 1))
  done

  echo "$prompt"
}

PROMPT=$(build_prompt)

# Draft follow-ups via the Claude CLI (bot uses OAuth, not ANTHROPIC_API_KEY).
# Falls back to the REST API if ANTHROPIC_API_KEY is set (e.g. local dev).
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  RESPONSE=$(curl -s --max-time 30 \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    "https://api.anthropic.com/v1/messages" \
    -d "$(jq -n \
      --arg prompt "$PROMPT" \
      '{
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{role: "user", content: $prompt}]
      }')")
  DRAFTS=$(echo "$RESPONSE" | jq -r '.content[0].text // empty' 2>/dev/null)
elif [ -n "$CLAUDE_BIN" ] && [ -x "$CLAUDE_BIN" ]; then
  # Non-interactive Claude CLI invocation. </dev/null prevents the CLI from
  # waiting on stdin (which it does for 3s by default). 2>/dev/null discards
  # the warning banner so $DRAFTS contains only the model's text response.
  DRAFTS=$("$CLAUDE_BIN" -p "$PROMPT" \
    --model claude-haiku-4-5-20251001 \
    --output-format text </dev/null 2>/dev/null) || true
else
  log "ERROR: no Claude transport available (neither ANTHROPIC_API_KEY nor claude CLI) — cannot draft follow-ups"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

if [ -z "$DRAFTS" ]; then
  log "ERROR: failed to get Claude drafts — empty response"
  emit_tick_summary
  update_daily_stats
  exit 0
fi

# Validate JSON array. Claude (esp. via the CLI) likes to wrap responses in
# ```json ... ``` fences, so strip those before parsing.
if ! echo "$DRAFTS" | jq -e 'type == "array"' >/dev/null 2>&1; then
  DRAFTS=$(echo "$DRAFTS" | sed -e 's/^```json$//' -e 's/^```$//' | sed -n '/^\[/,/\]$/p')
  if ! echo "$DRAFTS" | jq -e 'type == "array"' >/dev/null 2>&1; then
    log "ERROR: Claude response is not a valid JSON array — skipping posts"
    emit_tick_summary
    update_daily_stats
    exit 0
  fi
fi

# ── Post follow-ups and update trackers ──────────────────────────────────────
POSTED=0

for i in $(seq 0 $((${#CHANGED_THREADS[@]} - 1))); do
  thread_json="${CHANGED_THREADS[$i]}"
  file=$(echo "$thread_json" | jq -r '.file')
  channel=$(echo "$thread_json" | jq -r '.channel')
  thread_ts=$(echo "$thread_json" | jq -r '.thread_ts')
  type=$(echo "$thread_json" | jq -r '.type')

  # Get the drafted message for this index
  message=$(echo "$DRAFTS" | jq -r --argjson idx "$i" '.[] | select(.index == $idx) | .message // empty')

  if [ -z "$message" ]; then
    log "WARNING: no draft for thread $i ($(basename "$file")) — skipping"
    continue
  fi

  # Post to Slack thread
  COUNT_SLACK_API_CALLS=$((COUNT_SLACK_API_CALLS + 1))
  if "$SLACK_POST" --channel "$channel" --thread-ts "$thread_ts" --text "$message" >/dev/null 2>&1; then
    log "posted ${type} follow-up to $channel thread $thread_ts"
    POSTED=$((POSTED + 1))

    # Increment daily cap counter for this user
    post_uid=$(echo "$thread_json" | jq -r '.user_id // empty')
    [ -n "$post_uid" ] && daily_cap_increment "$post_uid"
    NOW_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    case "$type" in
      completion) COUNT_COMPLETIONS=$((COUNT_COMPLETIONS + 1)) ;;
      nudge)      COUNT_NUDGES=$((COUNT_NUDGES + 1)) ;;
      closure)    COUNT_CLOSURES=$((COUNT_CLOSURES + 1)) ;;
    esac

    # Update tracker based on follow-up type
    if [ -f "$file" ]; then
      case "$type" in
        completion)
          UPDATED=$(jq \
            --arg resolved_at "$NOW_TS" \
            '.status = "resolved" | .follow_up_count = (.follow_up_count + 1) | .resolved_at = $resolved_at' \
            "$file")
          ;;
        nudge)
          UPDATED=$(jq \
            --arg nudge_sent_at "$NOW_TS" \
            '.nudge_count = ((.nudge_count // 0) + 1) | .nudge_sent_at = $nudge_sent_at | .follow_up_count = (.follow_up_count + 1)' \
            "$file")
          ;;
        closure)
          UPDATED=$(jq \
            --arg closure_sent_at "$NOW_TS" \
            '.status = "closed" | .closure_count = ((.closure_count // 0) + 1) | .closure_sent_at = $closure_sent_at | .follow_up_count = (.follow_up_count + 1)' \
            "$file")
          ;;
      esac
      echo "$UPDATED" > "$file"
    fi
  else
    log "ERROR: failed to post ${type} follow-up to $channel thread $thread_ts"
  fi
done

log "tick complete: ${POSTED}/${#CHANGED_THREADS[@]} follow-ups posted"
emit_tick_summary
update_daily_stats
exit 0
