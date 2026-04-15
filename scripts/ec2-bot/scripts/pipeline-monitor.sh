#!/bin/bash
# pipeline-monitor.sh — Watches active milestone pipelines for failures
#
# Finds all issues with bot:milestone-builder label and runs/resumes a
# monitor session for each. Uses --session for continuity across ticks.
#
# State caching: For each milestone, fetches sub-issue labels and computes
# a fingerprint. Skips Claude invocation if nothing has changed since the
# last tick, preventing unnecessary API usage.
#
# Cron entry:
#   */10 * * * * /opt/slam-bot/scripts/pipeline-monitor.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"

LOGFILE="${BOT_LOG_DIR}/pipeline-monitor.log"
PIPELINE_STATE_DIR="${BOT_STATE_DIR}/pipeline-monitor"
mkdir -p "$PIPELINE_STATE_DIR" 2>/dev/null || true

log() { echo "[$(date)] $1" >> "$LOGFILE"; }

# compute_milestone_fingerprint — Fetch sub-issues and their labels, return a hash.
# Changes to sub-issue labels (e.g., bot:in-progress added/removed, bot:failed,
# new sub-issues created) will produce a different fingerprint.
compute_milestone_fingerprint() {
  local milestone_number="$1"
  # Get sub-issues: their numbers, labels, and state (open/closed)
  local sub_issues
  sub_issues=$(gh issue list --repo "$GITHUB_REPO" --search "linked:$milestone_number" --state all \
    --json number,labels,state --limit 50 2>/dev/null || echo "[]")
  # Also get PRs linked to the milestone
  local prs
  prs=$(gh pr list --repo "$GITHUB_REPO" --search "linked:$milestone_number" --state open \
    --json number,labels,mergeable --limit 20 2>/dev/null || echo "[]")
  # Combine and hash — sort for deterministic output
  echo "${sub_issues}${prs}" | jq -S '.' | (md5sum 2>/dev/null || md5) | awk '{print $1}'
}

# Find all issues with bot:milestone-builder label (active milestones)
MILESTONES=$(gh issue list --repo "$GITHUB_REPO" --label "bot:milestone-builder" --state open \
  --json number,title --limit 20 2>/dev/null) || {
  log "GitHub API error fetching milestones"
  exit 1
}

COUNT=$(echo "$MILESTONES" | jq 'length')
if [ "$COUNT" -eq 0 ]; then
  # No active milestones — nothing to monitor
  exit 0
fi

log "Found $COUNT active milestone(s)"

echo "$MILESTONES" | jq -c '.[]' | while IFS= read -r MILESTONE; do
  NUMBER=$(echo "$MILESTONE" | jq -r '.number')
  TITLE=$(echo "$MILESTONE" | jq -r '.title')
  SESSION_KEY="monitor-milestone-$NUMBER"

  # State comparison: skip Claude if nothing changed since last tick
  FINGERPRINT=$(compute_milestone_fingerprint "$NUMBER")
  CACHE_FILE="$PIPELINE_STATE_DIR/milestone-${NUMBER}.fingerprint"
  if [ -f "$CACHE_FILE" ]; then
    CACHED=$(cat "$CACHE_FILE" 2>/dev/null || echo "")
    if [ "$FINGERPRINT" = "$CACHED" ]; then
      log "Skipping milestone #$NUMBER — no state change since last tick"
      continue
    fi
  fi

  log "Milestone #$NUMBER state changed — invoking monitor (session=$SESSION_KEY)"

  PROMPT="Pipeline monitor tick for milestone #${NUMBER}.

Issue: #${NUMBER}
Title: ${TITLE}

Read stages/tick/CONTEXT.md for your monitoring checklist.
First: gh issue view ${NUMBER} --repo ${GITHUB_REPO} to get current state.
Then check all sub-issues, their labels, open PRs, and wave status."

  # Run in foreground (one milestone at a time to avoid GitHub API rate limits)
  MODEL=sonnet PRIORITY=low "$SCRIPT_DIR/run-claude.sh" \
    --workspace pipeline-monitor \
    --session "$SESSION_KEY" \
    --no-worktree \
    "$PROMPT" || {
    log "Monitor failed for milestone #$NUMBER (exit $?)"
  }

  # Update cached fingerprint after successful check
  echo "$FINGERPRINT" > "$CACHE_FILE"

  # Small delay between milestones
  sleep 2
done

log "Pipeline monitor cycle complete"
