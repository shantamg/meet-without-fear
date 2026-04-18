#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
source "$SCRIPT_DIR/lib/github-state.sh"

LOGFILE="$BOT_LOG_DIR/fix-bugs.log"

# Pre-check: fetch open bug AND security issues from the state file (zero API cost),
# then filter to only those with no activity (no comments, no linked PRs).
# Exit early if none qualify.
if github_state_assert_fresh 2>/dev/null; then
  # Read from state file — zero API calls
  BUG_NUMBERS=$(github_state_issues_with_label "bug" 2>/dev/null)
  SEC_NUMBERS=$(github_state_issues_with_label "security" 2>/dev/null)
  BOTPR_NUMBERS=$(github_state_issues_with_label "bot-pr" 2>/dev/null)
  ALL_NUMBERS=$(printf '%s\n%s\n%s' "$BUG_NUMBERS" "$SEC_NUMBERS" "$BOTPR_NUMBERS" | sort -un | grep -v '^$')

  # Filter out wontfix
  FILTERED=""
  for NUM in $ALL_NUMBERS; do
    if ! github_state_issue_has_label "$NUM" "wontfix" 2>/dev/null; then
      FILTERED="$FILTERED $NUM"
    fi
  done
  ALL_NUMBERS=$(echo "$FILTERED" | xargs)

  # Build BUGS JSON array for downstream compatibility
  BUGS="[]"
  for NUM in $ALL_NUMBERS; do
    BUGS=$(echo "$BUGS" | jq --argjson n "$NUM" '. + [{"number": $n}]')
  done
  # Also build BOTPR_ISSUES for post-session cleanup
  BOTPR_ISSUES="[]"
  for NUM in $BOTPR_NUMBERS; do
    [ -z "$NUM" ] && continue
    BOTPR_ISSUES=$(echo "$BOTPR_ISSUES" | jq --argjson n "$NUM" '. + [{"number": $n}]')
  done
else
  # State file stale — fall back to direct gh calls
  BUG_ISSUES=$(gh issue list --repo "$GITHUB_REPO" --label bug --state open --json number,labels --limit 50 2>/dev/null) || BUG_ISSUES="[]"
  SEC_ISSUES=$(gh issue list --repo "$GITHUB_REPO" --label security --state open --json number,labels --limit 50 2>/dev/null) || SEC_ISSUES="[]"
  BOTPR_ISSUES=$(gh issue list --repo "$GITHUB_REPO" --label bot-pr --state open --json number,labels --limit 50 2>/dev/null) || BOTPR_ISSUES="[]"

  BUGS=$(echo "$BUG_ISSUES" "$SEC_ISSUES" "$BOTPR_ISSUES" | jq -s 'add | unique_by(.number) | [.[] | select([.labels[].name] | index("wontfix") | not)]') || {
    echo "[$(date)] GitHub API error fetching bug/security/bot-pr issues" >> "$LOGFILE"
    exit 1
  }
fi

BUG_COUNT=$(echo "$BUGS" | jq 'length')
if [ "$BUG_COUNT" -eq 0 ]; then
  exit 0
fi

# Filter: only bugs with no activity (0 comments and no linked fix PRs)
# Note: don't exclude author comments — slam-bot both creates issues and comments
# on them with fixes, so any comment (even from the author) means it's been touched.
UNTOUCHED_BUGS="[]"
for NUMBER in $(echo "$BUGS" | jq -r '.[].number'); do
  # Check comment count (any comment = activity)
  COMMENT_COUNT=$(gh api "repos/$GITHUB_REPO/issues/$NUMBER/comments" --jq 'length' 2>/dev/null || echo "0")

  # Check for linked PRs that reference this issue
  LINKED_PRS=$(gh api graphql -f query='
    query {
      repository(owner: "'"${GITHUB_REPO%%/*}"'", name: "'"${GITHUB_REPO##*/}"'") {
        issue(number: '"$NUMBER"') {
          timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 10) {
            nodes {
              ... on CrossReferencedEvent {
                source {
                  ... on PullRequest { number state }
                }
              }
            }
          }
        }
      }
    }' --jq '.data.repository.issue.timelineItems.nodes | [.[] | select(.source.number != null)] | length' 2>/dev/null || echo "0")

  if [ "$COMMENT_COUNT" -eq 0 ] && [ "$LINKED_PRS" -eq 0 ]; then
    UNTOUCHED_BUGS=$(echo "$UNTOUCHED_BUGS" | jq --argjson num "$NUMBER" '. + [$num]')
  fi
done

UNTOUCHED_COUNT=$(echo "$UNTOUCHED_BUGS" | jq 'length')
if [ "$UNTOUCHED_COUNT" -eq 0 ]; then
  echo "[$(date)] $BUG_COUNT open bug/security/bot-pr issue(s) found but all have activity — skipping" >> "$LOGFILE"
  exit 0
fi

echo "[$(date)] Found $UNTOUCHED_COUNT untouched bug/security/bot-pr issue(s) — invoking Claude" >> "$LOGFILE"

# Capture which bot-pr issues exist BEFORE invoking Claude
BOTPR_NUMBERS=$(echo "$BOTPR_ISSUES" | jq -r '.[].number' 2>/dev/null) || BOTPR_NUMBERS=""

"$BOT_SCRIPTS_DIR/run-claude.sh" "fix-bugs" \
  "Run /fix-bugs — but ONLY process these issue numbers (they have no activity yet): $(echo "$UNTOUCHED_BUGS" | jq -r 'join(", ")'). Skip all other bug issues." \
  "$PROJECT_DIR/.claude/commands/fix-bugs.md"

# Post-session cleanup: remove bot-pr label from issues that now have linked PRs.
# This is programmatic (like Slack emoji management) so we don't rely on Claude doing it.
if [ -n "$BOTPR_NUMBERS" ]; then
  for ISSUE_NUM in $BOTPR_NUMBERS; do
    LINKED_PR_COUNT=$(gh api graphql -f query='
      query {
        repository(owner: "'"${GITHUB_REPO%%/*}"'", name: "'"${GITHUB_REPO##*/}"'") {
          issue(number: '"$ISSUE_NUM"') {
            timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 10) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    ... on PullRequest { number state }
                  }
                }
              }
            }
          }
        }
      }' --jq '.data.repository.issue.timelineItems.nodes | [.[] | select(.source.number != null)] | length' 2>/dev/null || echo "0")

    if [ "$LINKED_PR_COUNT" -gt 0 ]; then
      gh issue edit "$ISSUE_NUM" --repo "$GITHUB_REPO" --remove-label bot-pr 2>/dev/null && \
        echo "[$(date)] Removed bot-pr label from issue #$ISSUE_NUM (has $LINKED_PR_COUNT linked PR(s))" >> "$LOGFILE" || \
        echo "[$(date)] Failed to remove bot-pr label from issue #$ISSUE_NUM" >> "$LOGFILE"
    fi
  done
fi
