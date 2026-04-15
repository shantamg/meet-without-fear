#!/bin/bash
# pr-reviewer-precheck.sh — Label-driven pre-check for the pr-reviewer workspace.
# Exits 0 (with summary on stdout) if any PR needs bot action.
# Exits 1 if no PRs need attention (no Claude session needed).
#
# With the label lifecycle (bot:needs-review → bot:in-progress → bot:reviewed →
# bot:needs-human-review), Claude is only needed when a trigger label is present
# or a PR has drifted into conflict. Everything else is terminal state.
#
# As of Phase 3 (#1741), this script reads from the global github-state.json
# maintained by github-state-scanner.sh instead of making its own `gh pr list`
# call. This eliminates a GraphQL API call per precheck tick.
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/shared.sh"
source "$SCRIPT_DIR/lib/github-state.sh"

LOGFILE="$BOT_LOG_DIR/pr-reviewer-precheck.log"
log() { echo "[$(date)] $1" >> "$LOGFILE" 2>/dev/null || true; }

# Assert the global state file is fresh. If the scanner daemon is down,
# log and skip — cron retries next tick.
if ! github_state_assert_fresh 2>/dev/null; then
  log "Global state file missing or stale — skipping precheck (is github-state-scanner.sh running?)"
  exit 1
fi

# Filter client-side from the global state file. A single jq pipeline produces
# one line per matching PR with its matched criterion.
# Priority order matches the original script:
#   1. bot:needs-review (primary trigger)
#   2. bot:review-changes-needed (self-correction loop)
#   3. bot:review-pr (human override)
#   4. bot:pr-reviewer (human override)
#   5. author is a bot identity + mergeable=CONFLICTING (always auto-rebase).
#      Accepts BOTH the legacy PAT identity ("MwfBot") and the GitHub App
#      bot-user identity ("mwf-bot-app[bot]") — see #1654 / #1652 for the
#      App migration rationale.
#
# jq computes a per-PR list of matching criteria, then emits "#N: reason" for
# each. A PR can match multiple criteria; the `unique_by(.number)` at the end
# ensures we show only the highest-priority reason per PR.
SUMMARY=$(jq -r '
  [ .prs | to_entries[] | .value |
    . as $pr |
    (
      (if ($pr.labels | any(. == "bot:needs-review"))          then "bot:needs-review" else null end),
      (if ($pr.labels | any(. == "bot:review-changes-needed")) then "review-changes-needed" else null end),
      (if ($pr.labels | any(. == "bot:review-pr"))             then "bot:review-pr override" else null end),
      (if ($pr.labels | any(. == "bot:pr-reviewer"))           then "bot:pr-reviewer override" else null end),
      (if (($pr.author_login == "MwfBot" or $pr.author_login == "mwf-bot-app[bot]") and $pr.mergeable == "CONFLICTING") then "conflicting" else null end)
    ) as $reason |
    select($reason != null) |
    { number: $pr.number, reason: $reason }
  ] |
  unique_by(.number) |
  sort_by(.number) |
  .[] |
  "#\(.number): \(.reason)"
' "$GITHUB_STATE_FILE" 2>/dev/null)

if [ -z "$SUMMARY" ]; then
  log "No trigger labels or conflicts found — skipping Claude"
  exit 1
fi

COUNT=$(echo "$SUMMARY" | wc -l | tr -d ' ')
log "Found ${COUNT} PRs needing action: ${SUMMARY}"
echo "$SUMMARY"
exit 0
