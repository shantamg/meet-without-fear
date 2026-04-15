#!/bin/bash
# bug-fix-precheck.sh — Pre-check for scheduled bug-fix workspace.
#
# Convention: exit 0 = work found (dispatcher invokes Claude),
#             exit 1 = nothing to do (dispatcher skips Claude).
#
# Outputs the untouched issue numbers on stdout so the dispatcher
# can log what was found.
#
# Activity detection uses zero API calls in the happy path:
#   1. Labels beyond bug/security/bot-pr → touched (bot adds labels during processing)
#   2. Open PR with closing_issues referencing this issue → touched
#   3. Fallback: single gh api call for comment count (only for issues passing 1+2)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/github-state.sh"

LOGFILE="$BOT_LOG_DIR/fix-bugs.log"

log() {
  echo "[$(date)] $*" >> "$LOGFILE" 2>/dev/null || true
}

# ── Collect candidate issues from state file (zero API calls) ──────────────
if ! github_state_assert_fresh 2>/dev/null; then
  log "State file stale — skipping precheck (will retry next tick)"
  exit 1
fi

BUG_NUMBERS=$(github_state_issues_with_label "bug" 2>/dev/null || true)
SEC_NUMBERS=$(github_state_issues_with_label "security" 2>/dev/null || true)
BOTPR_NUMBERS=$(github_state_issues_with_label "bot-pr" 2>/dev/null || true)
ALL_NUMBERS=$(printf '%s\n%s\n%s' "$BUG_NUMBERS" "$SEC_NUMBERS" "$BOTPR_NUMBERS" | sort -un | grep -v '^$' || true)

if [ -z "$ALL_NUMBERS" ]; then
  exit 1  # No bugs at all
fi

# ── Filter out wontfix (from state file) ───────────────────────────────────
FILTERED=""
for NUM in $ALL_NUMBERS; do
  if ! github_state_issue_has_label "$NUM" "wontfix" 2>/dev/null; then
    FILTERED="$FILTERED $NUM"
  fi
done
ALL_NUMBERS=$(echo "$FILTERED" | xargs)

if [ -z "$ALL_NUMBERS" ]; then
  exit 1
fi

# ── Activity detection ─────────────────────────────────────────────────────
# Trigger labels are the ones that caused the issue to appear in our list.
# Any label beyond these means the bot or a human has already processed it.
TRIGGER_LABELS='["bug","security","bot-pr"]'

UNTOUCHED=""
for NUMBER in $ALL_NUMBERS; do
  # Check 1 (state file, zero cost): has labels beyond trigger labels?
  HAS_EXTRA_LABELS=$(jq -r --arg n "$NUMBER" --argjson triggers "$TRIGGER_LABELS" \
    '.issues[$n].labels | map(select(. as $l | $triggers | index($l) | not)) | length' \
    "$GITHUB_STATE_FILE" 2>/dev/null || echo "0")
  if [ "$HAS_EXTRA_LABELS" -gt 0 ]; then
    continue
  fi

  # Check 2 (state file, zero cost): any open PR fixing this issue?
  HAS_FIXING_PR=$(jq -r --argjson n "$NUMBER" \
    '[.prs | to_entries[].value.closing_issues // [] | .[] | select(. == $n)] | length' \
    "$GITHUB_STATE_FILE" 2>/dev/null || echo "0")
  if [ "$HAS_FIXING_PR" -gt 0 ]; then
    continue
  fi

  # Check 3 (1 API call, fallback): has any comments?
  # Only reached for issues with no extra labels and no fixing PRs.
  COMMENT_COUNT=$(gh api "repos/$GITHUB_REPO/issues/$NUMBER/comments" --jq 'length' 2>/dev/null || echo "0")
  if [ "$COMMENT_COUNT" -gt 0 ]; then
    continue
  fi

  UNTOUCHED="$UNTOUCHED $NUMBER"
done

UNTOUCHED=$(echo "$UNTOUCHED" | xargs)

if [ -z "$UNTOUCHED" ]; then
  BUG_COUNT=$(echo "$ALL_NUMBERS" | wc -w | xargs)
  log "$BUG_COUNT open bug/security/bot-pr issue(s) found but all have activity — skipping"
  exit 1  # Nothing to do
fi

log "Found untouched issues: $UNTOUCHED — invoking Claude"
echo "$UNTOUCHED"  # Output for dispatcher log
exit 0  # Work found
