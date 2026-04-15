#!/bin/bash
# api-budget-summary.sh — Daily API consumption breakdown and budget alerts.
#
# Reads per-workspace gh call tracking data (written by gh-budget.sh) and
# rate-limit time series (written by api-budget-monitor.sh) to answer:
#   "Which workspace consumed the most API points today?"
#
# Modes:
#   api-budget-summary.sh                   # print today's summary to stdout
#   api-budget-summary.sh --date 2026-04-12 # print summary for a specific date
#   api-budget-summary.sh --alert           # check budgets + alert #bot-ops if over
#   api-budget-summary.sh --post            # post daily summary to #bot-ops
#
# Called by:
#   - api-budget-monitor.sh could call --alert after each sample (optional)
#   - bot-health-check.sh can call --post for the daily summary
#   - Human operators for ad-hoc investigation
#
# shellcheck shell=bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="${BOT_LOG_DIR}/api-budget-summary.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOGFILE"
}

# ── Per-workspace summary ─────────────────────────────────────────────────
# Reads workspace-calls-YYYY-MM-DD.jsonl and produces a breakdown.
# Cost fields (graphql_cost, rest_cost) may be null on older entries or
# when the rate-limit reset window rolled mid-session — treated as 0.
workspace_summary() {
  local date="${1:-$(date +%Y-%m-%d)}"
  local calls_file="$API_BUDGET_DIR/workspace-calls-${date}.jsonl"

  if [ ! -f "$calls_file" ]; then
    echo "No workspace call data for $date"
    return 0
  fi

  echo "=== API Budget Summary for $date ==="
  echo ""

  echo "Per-workspace consumption (sorted by GraphQL cost):"
  jq -rs '
    group_by(.workspace) |
    map({
      workspace: .[0].workspace,
      total_calls: (map(.gh_calls // 0) | add),
      graphql_cost: (map(.graphql_cost // 0) | add),
      rest_cost: (map(.rest_cost // 0) | add),
      sessions: length
    }) |
    sort_by(-.graphql_cost) |
    .[] |
    "  \(.workspace): gql=\(.graphql_cost) rest=\(.rest_cost) calls=\(.total_calls) (\(.sessions) sessions)"
  ' "$calls_file" 2>/dev/null || echo "  (parse error)"

  echo ""

  local total_calls total_sessions total_gql total_rest
  total_calls=$(jq -s 'map(.gh_calls // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")
  total_sessions=$(jq -s 'length' "$calls_file" 2>/dev/null || echo "0")
  total_gql=$(jq -s 'map(.graphql_cost // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")
  total_rest=$(jq -s 'map(.rest_cost // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")
  echo "Total: $total_calls gh calls, $total_gql GraphQL pts, $total_rest REST reqs across $total_sessions sessions"

  echo ""

  echo "Top 5 sessions by GraphQL cost:"
  jq -rs '
    sort_by(-(.graphql_cost // 0)) |
    .[:5] |
    .[] |
    "  \(.workspace) (issue \(.issue // "n/a")): gql=\(.graphql_cost // "?") rest=\(.rest_cost // "?") calls=\(.gh_calls) at \(.ts)"
  ' "$calls_file" 2>/dev/null || echo "  (parse error)"
}

# ── Cron script summary ───────────────────────────────────────────────────
# Reads script-costs-YYYY-MM-DD.jsonl (written by lib/gh-cost-trace.sh)
# and groups by caller. Delta numbers include concurrent-process
# contamination — treat as upper bounds. Aggregated caller ranking is
# still informative for spotting heavy callers.
cron_script_summary() {
  local date="${1:-$(date +%Y-%m-%d)}"
  local script_file="$API_BUDGET_DIR/script-costs-${date}.jsonl"

  if [ ! -f "$script_file" ]; then
    echo ""
    echo "No cron script cost data for $date"
    return 0
  fi

  echo ""
  echo "=== Cron script consumption for $date ==="
  echo "(deltas include concurrent-process contamination — upper bounds)"
  echo ""

  jq -rs '
    group_by(.caller) |
    map({
      caller: .[0].caller,
      graphql_cost: (map(.graphql_cost // 0) | add),
      rest_cost: (map(.rest_cost // 0) | add),
      runs: length,
      avg_duration: ((map(.duration_sec // 0) | add) / length | floor)
    }) |
    sort_by(-.graphql_cost) |
    .[] |
    "  \(.caller): gql=\(.graphql_cost) rest=\(.rest_cost) runs=\(.runs) avg_dur=\(.avg_duration)s"
  ' "$script_file" 2>/dev/null || echo "  (parse error)"
}

# ── Rate limit timeline ───────────────────────────────────────────────────
# Shows rate limit snapshots from the time series for a given date.
rate_limit_timeline() {
  local date="${1:-$(date +%Y-%m-%d)}"

  if [ ! -f "$RATE_LIMIT_TIMESERIES" ]; then
    echo "No rate limit time series data"
    return 0
  fi

  echo ""
  echo "=== Rate Limit Timeline for $date ==="
  echo ""

  # Filter to date, show GraphQL remaining over time
  jq -r --arg date "$date" '
    select(.ts | startswith($date)) |
    "\(.ts | .[11:16]) — GraphQL: \(.graphql.remaining)/\(.graphql.limit) used=\(.graphql.used) | REST: \(.core.remaining)/\(.core.limit) used=\(.core.used)"
  ' "$RATE_LIMIT_TIMESERIES" 2>/dev/null || echo "  (no data for $date)"

  echo ""

  # Min GraphQL remaining for the day (low-water mark)
  local min_remaining
  min_remaining=$(jq -s --arg date "$date" '
    [.[] | select(.ts | startswith($date))] |
    if length == 0 then "n/a"
    else (map(.graphql.remaining) | min | tostring)
    end
  ' "$RATE_LIMIT_TIMESERIES" 2>/dev/null || echo "n/a")
  echo "GraphQL low-water mark: $min_remaining remaining"
}

# ── Budget alert check ────────────────────────────────────────────────────
# Checks if any workspace has exceeded its daily budget allocation.
check_budget_alerts() {
  local date="${1:-$(date +%Y-%m-%d)}"
  local calls_file="$API_BUDGET_DIR/workspace-calls-${date}.jsonl"
  local budget="${WORKSPACE_BUDGET_DEFAULT:-500}"

  [ -f "$calls_file" ] || return 0

  local over_budget
  over_budget=$(jq -s --argjson budget "$budget" '
    group_by(.workspace) |
    map({
      workspace: .[0].workspace,
      total_calls: (map(.gh_calls) | add)
    }) |
    map(select(.total_calls > $budget)) |
    if length == 0 then empty
    else .[] | "\(.workspace): \(.total_calls) calls (budget: \($budget))"
    end
  ' "$calls_file" 2>/dev/null)

  if [ -n "$over_budget" ]; then
    log "ALERT: workspaces over budget on $date: $over_budget"
    echo "$over_budget"
    return 1
  fi
  return 0
}

# ── Post to Slack ─────────────────────────────────────────────────────────
post_summary_to_slack() {
  local date="${1:-$(date +%Y-%m-%d)}"
  local calls_file="$API_BUDGET_DIR/workspace-calls-${date}.jsonl"

  [ -f "$calls_file" ] || { log "no data to post for $date"; return 0; }

  local total_calls total_sessions total_gql total_rest top_workspaces min_graphql
  total_calls=$(jq -s 'map(.gh_calls // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")
  total_sessions=$(jq -s 'length' "$calls_file" 2>/dev/null || echo "0")
  total_gql=$(jq -s 'map(.graphql_cost // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")
  total_rest=$(jq -s 'map(.rest_cost // 0) | add // 0' "$calls_file" 2>/dev/null || echo "0")

  top_workspaces=$(jq -rs '
    group_by(.workspace) |
    map({
      workspace: .[0].workspace,
      total_calls: (map(.gh_calls // 0) | add),
      graphql_cost: (map(.graphql_cost // 0) | add),
      rest_cost: (map(.rest_cost // 0) | add),
      sessions: length
    }) |
    sort_by(-.graphql_cost) |
    .[:5] |
    map("• `\(.workspace)`: gql=\(.graphql_cost) rest=\(.rest_cost) calls=\(.total_calls) (\(.sessions) sessions)") |
    join("\n")
  ' "$calls_file" 2>/dev/null || echo "• (no data)")

  # Top cron-script consumers (separate file written by lib/gh-cost-trace.sh)
  local top_scripts="• (no script cost data)"
  local script_file="$API_BUDGET_DIR/script-costs-${date}.jsonl"
  if [ -f "$script_file" ]; then
    top_scripts=$(jq -rs '
      group_by(.caller) |
      map({
        caller: .[0].caller,
        graphql_cost: (map(.graphql_cost // 0) | add),
        rest_cost: (map(.rest_cost // 0) | add),
        runs: length
      }) |
      sort_by(-.graphql_cost) |
      .[:5] |
      map("• `\(.caller)`: gql=\(.graphql_cost) rest=\(.rest_cost) (\(.runs) runs)") |
      join("\n")
    ' "$script_file" 2>/dev/null || echo "• (parse error)")
  fi

  min_graphql="n/a"
  if [ -f "$RATE_LIMIT_TIMESERIES" ]; then
    min_graphql=$(jq -s --arg date "$date" '
      [.[] | select(.ts | startswith($date))] |
      if length == 0 then "n/a"
      else (map(.graphql.remaining) | min | tostring)
      end
    ' "$RATE_LIMIT_TIMESERIES" 2>/dev/null || echo "n/a")
  fi

  # Check for over-budget workspaces
  local budget_status="All workspaces within budget"
  local over_budget
  over_budget=$(check_budget_alerts "$date" 2>/dev/null || true)
  if [ -n "$over_budget" ]; then
    budget_status="⚠️ Over budget:\n$(echo "$over_budget" | sed 's/^/• /')"
  fi

  local msg
  msg="📊 *API Budget Summary — ${date}*

*Totals:* ${total_calls} gh calls, ${total_gql} GraphQL pts, ${total_rest} REST reqs across ${total_sessions} sessions
*GraphQL low-water mark:* ${min_graphql} remaining

*Top workspaces (by GraphQL cost):*
${top_workspaces}

*Top cron scripts (by GraphQL cost):*
${top_scripts}

*Budget status:* ${budget_status}"

  "${SCRIPT_DIR}/slack-post.sh" \
    --channel "$BOT_OPS_CHANNEL_ID" \
    --text "$msg" > /dev/null 2>&1 || log "ERROR: failed to post summary to Slack"

  log "posted daily summary for $date"
}

# ── Alert on over-budget ──────────────────────────────────────────────────
alert_over_budget() {
  local date="${1:-$(date +%Y-%m-%d)}"
  local alert_flag="$API_BUDGET_DIR/.alerted-${date}"

  # Only alert once per day per workspace
  [ -f "$alert_flag" ] && return 0

  local over_budget
  over_budget=$(check_budget_alerts "$date" 2>/dev/null || true)
  [ -z "$over_budget" ] && return 0

  touch "$alert_flag"

  local msg
  msg="⚠️ *API Budget Alert — ${date}*

Workspaces exceeding daily budget (${WORKSPACE_BUDGET_DEFAULT} gh calls):
$(echo "$over_budget" | sed 's/^/• /')

Run \`api-budget-summary.sh --date ${date}\` for full breakdown."

  "${SCRIPT_DIR}/slack-post.sh" \
    --channel "$BOT_OPS_CHANNEL_ID" \
    --text "$msg" > /dev/null 2>&1 || log "ERROR: failed to post alert to Slack"

  log "ALERT posted: over-budget workspaces on $date"
}

# ── Main ──────────────────────────────────────────────────────────────────
case "${1:-}" in
  --date)
    date="${2:?usage: --date YYYY-MM-DD}"
    workspace_summary "$date"
    cron_script_summary "$date"
    rate_limit_timeline "$date"
    ;;
  --alert)
    alert_over_budget "${2:-$(date +%Y-%m-%d)}"
    ;;
  --post)
    post_summary_to_slack "${2:-$(date +%Y-%m-%d)}"
    ;;
  "")
    workspace_summary
    cron_script_summary
    rate_limit_timeline
    ;;
  -h|--help)
    echo "Usage: api-budget-summary.sh [--date YYYY-MM-DD | --alert | --post]"
    echo ""
    echo "  (no args)     Print today's summary to stdout"
    echo "  --date DATE   Print summary for a specific date"
    echo "  --alert       Check budgets and alert #bot-ops if over"
    echo "  --post        Post daily summary to #bot-ops"
    ;;
  *)
    echo "unknown option: $1" >&2
    exit 2
    ;;
esac
