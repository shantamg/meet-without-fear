#!/bin/bash
# api-budget-monitor.sh — Sample GitHub API rate limits every 10 minutes.
#
# Runs via cron every 10 minutes. Appends a JSONL entry to the rate-limit
# time series file with current GraphQL and REST rate limit snapshots.
# Also reads the github-state-scanner's cost data from the state file.
#
# Modes:
#   api-budget-monitor.sh            # default: sample + append to time series
#   api-budget-monitor.sh --once     # alias for default (for cron clarity)
#
# Time series file: $API_BUDGET_DIR/rate-limit-timeseries.jsonl
# Retention: 7 days (pruned on each run)
#
# shellcheck shell=bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="${BOT_LOG_DIR}/api-budget-monitor.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOGFILE"
}

mkdir -p "$API_BUDGET_DIR" 2>/dev/null || true

# ── Sample rate limits ─────────────────────────────────────────────────────
sample_rate_limits() {
  local raw
  raw=$(gh api rate_limit 2>&1)
  local rc=$?
  if [ $rc -ne 0 ]; then
    log "ERROR: gh api rate_limit failed (rc=$rc): $raw"
    return 1
  fi

  # Extract GraphQL and REST core limits
  local entry
  entry=$(echo "$raw" | jq -c \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      ts: $ts,
      graphql: {
        limit:     .resources.graphql.limit,
        remaining: .resources.graphql.remaining,
        used:      .resources.graphql.used,
        reset:     (.resources.graphql.reset | todate)
      },
      core: {
        limit:     .resources.core.limit,
        remaining: .resources.core.remaining,
        used:      .resources.core.used,
        reset:     (.resources.core.reset | todate)
      }
    }' 2>/dev/null)

  if [ -z "$entry" ] || [ "$entry" = "null" ]; then
    log "ERROR: jq transform failed for rate_limit response"
    return 1
  fi

  # Enrich with scanner state file cost data (if available)
  if [ -f "${GITHUB_STATE_FILE:-/opt/slam-bot/state/github-state.json}" ]; then
    local scanner_cost
    scanner_cost=$(jq -c '.scanner_cost // {}' "${GITHUB_STATE_FILE:-/opt/slam-bot/state/github-state.json}" 2>/dev/null || echo '{}')
    entry=$(echo "$entry" | jq -c --argjson sc "$scanner_cost" '. + {scanner_cost: $sc}')
  fi

  echo "$entry" >> "$RATE_LIMIT_TIMESERIES"
  log "sample: graphql=$(echo "$entry" | jq -r '.graphql.remaining')/$(echo "$entry" | jq -r '.graphql.limit') core=$(echo "$entry" | jq -r '.core.remaining')/$(echo "$entry" | jq -r '.core.limit')"
}

# ── Prune old entries (keep 7 days) ───────────────────────────────────────
prune_timeseries() {
  [ -f "$RATE_LIMIT_TIMESERIES" ] || return 0
  local cutoff
  cutoff=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
  [ -z "$cutoff" ] && return 0

  local tmp="${RATE_LIMIT_TIMESERIES}.tmp.$$"
  if jq -c --arg cutoff "$cutoff" 'select(.ts >= $cutoff)' "$RATE_LIMIT_TIMESERIES" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$RATE_LIMIT_TIMESERIES"
  else
    rm -f "$tmp"
    log "WARNING: prune_timeseries skipped — jq failed or produced empty output"
  fi
}

# ── Prune old workspace-calls files (keep 7 days) ────────────────────────
prune_workspace_calls() {
  local cutoff_date
  cutoff_date=$(date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d 2>/dev/null || echo "")
  [ -z "$cutoff_date" ] && return 0

  shopt -s nullglob
  for f in "$API_BUDGET_DIR"/workspace-calls-*.jsonl; do
    local file_date
    file_date=$(basename "$f" | sed 's/workspace-calls-//; s/\.jsonl//')
    if [[ "$file_date" < "$cutoff_date" ]]; then
      rm -f "$f"
      log "pruned old workspace-calls file: $(basename "$f")"
    fi
  done
  shopt -u nullglob
}

# ── Main ──────────────────────────────────────────────────────────────────
case "${1:-}" in
  --once|"")
    sample_rate_limits
    prune_timeseries
    prune_workspace_calls
    ;;
  -h|--help)
    echo "Usage: api-budget-monitor.sh [--once]"
    echo "Samples GitHub API rate limits and appends to time series."
    ;;
  *)
    echo "unknown option: $1" >&2
    exit 2
    ;;
esac
