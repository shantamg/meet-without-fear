#!/bin/bash
# gh-cost-trace.sh — Per-script GitHub API cost tracking for cron scripts.
#
# Source from any script to record GraphQL and REST point consumption
# over the script's lifetime. Uses `gh api rate_limit` deltas (rate_limit
# queries do not count against the budget themselves).
#
# Caveat: deltas include consumption from concurrent bot processes, so
# per-script numbers are upper bounds. Aggregated across many runs, the
# relative ranking of callers is still informative.
#
# Usage (auto-trace):
#   GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
#
# Usage (explicit):
#   source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
#   gh_cost_trace_start
#   ... work ...
#   gh_cost_trace_end
#
# Env:
#   GH_CALLER       — optional caller name (defaults to $0 basename)
#   API_BUDGET_DIR  — output directory (set by config.sh)
#
# Output: $API_BUDGET_DIR/script-costs-YYYY-MM-DD.jsonl
#
# shellcheck shell=bash

# Idempotent guard — sourcing twice is a no-op
if [ -n "${_GH_COST_TRACE_LOADED:-}" ]; then
  return 0 2>/dev/null || true
fi
_GH_COST_TRACE_LOADED=1

gh_cost_trace_start() {
  # Silently bail if gh isn't on PATH
  command -v gh >/dev/null 2>&1 || return 0
  command -v jq >/dev/null 2>&1 || return 0

  local raw
  raw=$(gh api rate_limit 2>/dev/null) || return 0
  [ -z "$raw" ] && return 0

  # Extract "used" counters. These are cumulative within the current
  # reset window, so delta = end_used - start_used.
  GH_COST_TRACE_START_GQL=$(echo "$raw" | jq -r '.resources.graphql.used // 0' 2>/dev/null)
  GH_COST_TRACE_START_REST=$(echo "$raw" | jq -r '.resources.core.used // 0' 2>/dev/null)
  GH_COST_TRACE_START_GQL_RESET=$(echo "$raw" | jq -r '.resources.graphql.reset // 0' 2>/dev/null)
  GH_COST_TRACE_TS_START=$(date -u +%s)
  GH_COST_TRACE_CALLER="${GH_CALLER:-$(basename "${BASH_SOURCE[-1]:-$0}")}"
  export GH_COST_TRACE_START_GQL GH_COST_TRACE_START_REST GH_COST_TRACE_TS_START GH_COST_TRACE_CALLER GH_COST_TRACE_START_GQL_RESET
}

gh_cost_trace_end() {
  [ -z "${GH_COST_TRACE_START_GQL:-}" ] && return 0
  command -v gh >/dev/null 2>&1 || return 0
  command -v jq >/dev/null 2>&1 || return 0

  local raw
  raw=$(gh api rate_limit 2>/dev/null) || return 0
  [ -z "$raw" ] && return 0

  local end_gql end_rest end_reset
  end_gql=$(echo "$raw" | jq -r '.resources.graphql.used // 0' 2>/dev/null)
  end_rest=$(echo "$raw" | jq -r '.resources.core.used // 0' 2>/dev/null)
  end_reset=$(echo "$raw" | jq -r '.resources.graphql.reset // 0' 2>/dev/null)

  # If the reset epoch changed, the window rolled mid-run — the delta
  # is meaningless because `used` resets to 0. Skip the entry rather
  # than log a confusing negative or under-counted value.
  if [ "$end_reset" != "$GH_COST_TRACE_START_GQL_RESET" ]; then
    return 0
  fi

  local delta_gql=$((end_gql - GH_COST_TRACE_START_GQL))
  local delta_rest=$((end_rest - GH_COST_TRACE_START_REST))
  local dur=$(($(date -u +%s) - GH_COST_TRACE_TS_START))

  local budget_dir="${API_BUDGET_DIR:-${BOT_STATE_DIR:-/opt/slam-bot/state}/api-budget}"
  mkdir -p "$budget_dir" 2>/dev/null || return 0
  local today
  today=$(date -u +%Y-%m-%d)
  local jsonl_file="$budget_dir/script-costs-${today}.jsonl"

  local entry
  entry=$(jq -nc \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg caller "$GH_COST_TRACE_CALLER" \
    --argjson graphql_cost "$delta_gql" \
    --argjson rest_cost "$delta_rest" \
    --argjson duration_sec "$dur" \
    --arg pid "$$" \
    '{ts: $ts, caller: $caller, graphql_cost: $graphql_cost, rest_cost: $rest_cost, duration_sec: $duration_sec, pid: $pid}' 2>/dev/null) || return 0

  [ -z "$entry" ] && return 0

  {
    flock -x 9
    echo "$entry" >> "$jsonl_file"
  } 9>"${jsonl_file}.lock" 2>/dev/null || true
}

# Auto-trace if the caller sets GH_COST_TRACE_AUTO=1
if [ "${GH_COST_TRACE_AUTO:-0}" = "1" ]; then
  gh_cost_trace_start
  # Preserve any existing EXIT trap
  _existing_exit_trap=$(trap -p EXIT 2>/dev/null | sed -E "s/^trap -- '(.*)' EXIT$/\1/")
  if [ -n "$_existing_exit_trap" ]; then
    trap "gh_cost_trace_end; $_existing_exit_trap" EXIT
  else
    trap gh_cost_trace_end EXIT
  fi
  unset _existing_exit_trap
fi
