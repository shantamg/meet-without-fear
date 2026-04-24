#!/bin/bash
# daily-strategy-precheck.sh — Pre-check for scheduled daily-strategy workspace.
#
# Convention: exit 0 = work found (dispatcher invokes Claude),
#             exit 1 = nothing to do (dispatcher skips Claude).
#
# Daily strategy always has work to do (scheduled briefings), so this
# precheck only gates on GitHub API budget. If the remaining rate limit
# is too low for the 10 parallel sub-agents, posts a fallback notice to
# #most-important-thing and exits 1 (skip Claude).
#
# Minimum thresholds: 200 GraphQL points, 200 REST calls. The daily-strategy
# workspace typically uses ~150 GraphQL points and ~100 REST calls per run
# across its 10 sub-agents.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="$BOT_LOG_DIR/daily-strategy.log"
log() { echo "[$(date)] $*" >> "$LOGFILE" 2>/dev/null || true; }

MIN_GRAPHQL=200
MIN_REST=200

# ── Check rate limit ─────────────────────────────────────────────────────
RAW=$(gh api rate_limit 2>&1)
RC=$?
if [ $RC -ne 0 ]; then
  log "ERROR: gh api rate_limit failed (rc=$RC) — skipping daily-strategy"
  # Can't check budget → post fallback and skip
  CHANNEL_ID="${MOST_IMPORTANT_THING_CHANNEL_ID:-}"
  if [ -n "$CHANNEL_ID" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    curl -s -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$CHANNEL_ID" \
         --arg text ":warning: Strategy briefing skipped — GitHub API unavailable. Check bot logs." \
         '{channel: $ch, text: $text}')" > /dev/null 2>&1 || true
  fi
  exit 1
fi

GRAPHQL_REMAINING=$(echo "$RAW" | jq -r '.resources.graphql.remaining // 0' 2>/dev/null || echo "0")
REST_REMAINING=$(echo "$RAW" | jq -r '.resources.core.remaining // 0' 2>/dev/null || echo "0")

log "Budget check: graphql=$GRAPHQL_REMAINING (min $MIN_GRAPHQL), rest=$REST_REMAINING (min $MIN_REST)"

if [ "$GRAPHQL_REMAINING" -lt "$MIN_GRAPHQL" ] || [ "$REST_REMAINING" -lt "$MIN_REST" ]; then
  log "Insufficient API budget — posting fallback notice"

  CHANNEL_ID="${MOST_IMPORTANT_THING_CHANNEL_ID:-}"
  if [ -n "$CHANNEL_ID" ] && [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    curl -s -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-Type: application/json" \
      -d "$(jq -n --arg ch "$CHANNEL_ID" \
         --arg text ":warning: Strategy briefing skipped — GitHub API budget low (GraphQL: ${GRAPHQL_REMAINING} remaining, REST: ${REST_REMAINING} remaining). Will retry next scheduled run." \
         '{channel: $ch, text: $text}')" > /dev/null 2>&1 || true
    log "Fallback notice posted to #most-important-thing"
  else
    log "WARNING: No MOST_IMPORTANT_THING_CHANNEL_ID or SLACK_BOT_TOKEN — cannot post fallback notice"
  fi

  exit 1
fi

log "Budget sufficient — proceeding with daily-strategy"
echo "budget_ok graphql=$GRAPHQL_REMAINING rest=$REST_REMAINING"
exit 0
