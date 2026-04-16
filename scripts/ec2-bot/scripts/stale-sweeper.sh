#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
source "$SCRIPT_DIR/lib/shared.sh"

LOGFILE="$BOT_LOG_DIR/stale-sweeper.log"
REPO="$GITHUB_REPO"
SLACK_SCRIPT="$BOT_SCRIPTS_DIR/slack-post.sh"
BOT_OPS="${BOT_OPS_CHANNEL_ID:?BOT_OPS_CHANNEL_ID not set}"
STALE_HOURS=24

# Labels that exempt items from sweeping
EXCLUDE_LABELS=("wontfix" "do-later" "later" "bot:expert-review" "brainstorm" "from-brainstorm" "codex")

log() { echo "[$(date)] $*" >> "$LOGFILE"; }
log "Starting stale sweeper run"

# ─── Helpers ─────────────────────────────────────────────────────────────────

is_excluded() {
  local item_labels="$1"
  for label in "${EXCLUDE_LABELS[@]}"; do
    if echo "$item_labels" | jq -e --arg l "$label" 'map(.name) | index($l) != null' >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

is_stale() {
  local updated_at="$1"
  local cutoff
  cutoff=$(date -u -d "-${STALE_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           date -u -v-${STALE_HOURS}H +%Y-%m-%dT%H:%M:%SZ)
  [[ "$updated_at" < "$cutoff" ]]
}

# ─── Gather open items authored by the bot ──────────────────────────────────
# Queries each accepted bot identity separately (gh --author only accepts
# a single login) and merges the results, deduplicating by PR/issue number.
# Accepts both legacy (MwfBot) and App (mwf-bot-app[bot]) identities.

ISSUES="[]"
PRS="[]"
for bot_login in "${BOT_USER_LOGINS[@]}"; do
  LIST=$(gh issue list --repo "$REPO" --state open --author "$bot_login" \
    --json number,title,labels,updatedAt --limit 100 2>/dev/null) || LIST="[]"
  ISSUES=$(jq -s 'add | unique_by(.number)' <(echo "$ISSUES") <(echo "$LIST"))

  LIST=$(gh pr list --repo "$REPO" --state open --author "$bot_login" \
    --json number,title,labels,updatedAt,reviewDecision,mergeable --limit 100 2>/dev/null) || LIST="[]"
  PRS=$(jq -s 'add | unique_by(.number)' <(echo "$PRS") <(echo "$LIST"))
done

# ─── Triage each PR (CLI-only, no Claude) ────────────────────────────────────

ACTIONS_TAKEN=()
CLAUDE_QUEUE=()

PR_COUNT=$(echo "$PRS" | jq 'length')
for i in $(seq 0 $((PR_COUNT - 1))); do
  PR=$(echo "$PRS" | jq ".[$i]")
  NUMBER=$(echo "$PR" | jq -r '.number')
  TITLE=$(echo "$PR" | jq -r '.title')
  LABELS=$(echo "$PR" | jq '.labels')
  UPDATED=$(echo "$PR" | jq -r '.updatedAt')
  REVIEW=$(echo "$PR" | jq -r '.reviewDecision // "NONE"')
  MERGEABLE=$(echo "$PR" | jq -r '.mergeable // "UNKNOWN"')

  # Skip excluded labels
  if is_excluded "$LABELS"; then
    continue
  fi

  # Skip recently updated
  if ! is_stale "$UPDATED"; then
    continue
  fi

  # ── PR with merge conflicts → Claude: rebase/fix ──
  if [ "$MERGEABLE" = "CONFLICTING" ]; then
    CLAUDE_QUEUE+=("PR #${NUMBER} has merge conflicts. Check out the branch, resolve the conflicts, and push. Title: ${TITLE}")
    log "PR #$NUMBER: merge conflicts detected — queuing for Claude"
    continue
  fi

  # ── PR approved but not merged → simple comment + Slack ping ──
  if [ "$REVIEW" = "APPROVED" ]; then
    gh pr comment "$NUMBER" --repo "$REPO" \
      --body "This PR has been approved and is ready to merge. Flagging for attention." 2>/dev/null && \
      ACTIONS_TAKEN+=("PR <https://github.com/$REPO/pull/$NUMBER|#$NUMBER> — $TITLE: approved, pinged for merge") || \
      log "PR #$NUMBER: failed to post approved comment"
    continue
  fi

  # ── PR with changes requested → Claude: address feedback ──
  if [ "$REVIEW" = "CHANGES_REQUESTED" ]; then
    CLAUDE_QUEUE+=("PR #${NUMBER} has changes requested. Read the review comments, address the feedback, push fixes, and reply to each comment. Title: ${TITLE}")
    log "PR #$NUMBER: changes requested — queuing for Claude"
    continue
  fi

  # ── PR has review comments (but no formal decision) → Claude: make the changes ──
  COMMENT_COUNT=$(gh api "repos/$REPO/pulls/$NUMBER/comments" --jq 'length' 2>/dev/null || echo "0")
  REVIEW_COUNT=$(gh api "repos/$REPO/pulls/$NUMBER/reviews" --jq '[.[] | select(.state != "PENDING")] | length' 2>/dev/null || echo "0")
  if [ "$COMMENT_COUNT" -gt 0 ] || [ "$REVIEW_COUNT" -gt 0 ]; then
    CLAUDE_QUEUE+=("PR #${NUMBER} has review feedback. Check out the branch, read the review comments, make the requested changes, push, and reply to each comment. Title: ${TITLE}")
    log "PR #$NUMBER: has review comments — queuing for Claude"
    continue
  fi

  # ── PR waiting on review, no activity → review it ──
  CLAUDE_QUEUE+=("PR #${NUMBER} has no reviews yet. Review the code — look for bugs, logic errors, security issues, and anything that doesn't look right. Post your review via gh. Title: ${TITLE}")
  log "PR #$NUMBER: no review activity — queuing review for Claude"
done

# ─── Triage each Issue (CLI-only check, Claude for fixes) ────────────────────

ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')
for i in $(seq 0 $((ISSUE_COUNT - 1))); do
  ISSUE=$(echo "$ISSUES" | jq ".[$i]")
  NUMBER=$(echo "$ISSUE" | jq -r '.number')
  TITLE=$(echo "$ISSUE" | jq -r '.title')
  LABELS=$(echo "$ISSUE" | jq '.labels')
  UPDATED=$(echo "$ISSUE" | jq -r '.updatedAt')

  # Skip excluded labels
  if is_excluded "$LABELS"; then
    continue
  fi

  # Skip recently updated
  if ! is_stale "$UPDATED"; then
    continue
  fi

  # Check for linked PRs
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

  if [ "$LINKED_PRS" -gt 0 ]; then
    # Issue has a linked PR — skip, the PR triage handles it
    continue
  fi

  # Issue with no linked PR → Claude: investigate and fix
  CLAUDE_QUEUE+=("Issue #${NUMBER} has been open for >24h with no linked PR. Investigate and create a fix PR if possible. If you can't fix it, post a specific comment explaining what's blocking. Title: ${TITLE}")
  log "Issue #$NUMBER: no linked PR — queuing for Claude"
done

# ─── Early exit if nothing to do ─────────────────────────────────────────────

TOTAL_ACTIONS=$((${#ACTIONS_TAKEN[@]} + ${#CLAUDE_QUEUE[@]}))
if [ "$TOTAL_ACTIONS" -eq 0 ]; then
  log "No stale items need attention — exiting"
  exit 0
fi

log "Actions taken directly: ${#ACTIONS_TAKEN[@]}, items queued for Claude: ${#CLAUDE_QUEUE[@]}"

# ─── Invoke Claude only for items that need AI ───────────────────────────────

if [ "${#CLAUDE_QUEUE[@]}" -gt 0 ]; then
  # Build numbered task list
  TASK_LIST=""
  for idx in "${!CLAUDE_QUEUE[@]}"; do
    TASK_LIST+="$((idx + 1)). ${CLAUDE_QUEUE[$idx]}"$'\n'
  done

  "$BOT_SCRIPTS_DIR/run-claude.sh" "stale-sweeper" \
    "Process these stale GitHub items. For each one, take the described action.
Use sub-agents with isolation: \"worktree\" for any code changes (same pattern as fix-bugs).
Request reviewers --reviewer shantamg on any new PRs.
Never auto-close issues or auto-merge PRs.

${TASK_LIST}

When done, post a summary to #bot-ops (${BOT_OPS}) via /slack-post listing what you did for each item. Include clickable GitHub links." \
    "$HOME/meet-without-fear/.claude/commands/stale-sweeper.md"
fi

# ─── Post Slack summary for non-Claude actions ──────────────────────────────

if [ "${#ACTIONS_TAKEN[@]}" -gt 0 ] && [ "${#CLAUDE_QUEUE[@]}" -eq 0 ]; then
  # Only CLI actions, no Claude session to post summary — post ourselves
  SUMMARY="*Stale Sweeper — $(date +%Y-%m-%d)*"$'\n\n'
  for action in "${ACTIONS_TAKEN[@]}"; do
    SUMMARY+="• ${action}"$'\n'
  done
  "$SLACK_SCRIPT" --channel "$BOT_OPS" --text "$SUMMARY" 2>/dev/null || \
    log "Failed to post Slack summary"
fi

log "Stale sweeper run complete"
