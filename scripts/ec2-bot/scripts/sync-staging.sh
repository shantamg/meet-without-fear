#!/bin/bash
# sync-staging.sh — Keep bot/staging in sync with main and surface new work.
#
# Two responsibilities:
#   1. Merge main → bot/staging (keeps staging up-to-date with human changes)
#   2. If bot/staging has commits ahead of main, create a PR to merge them
#
# Runs twice daily via cron (morning and evening).
# Uses a separate worktree to avoid interfering with main checkout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="${BOT_LOG_DIR}/sync-staging.log"
WORKTREE_DIR="/tmp/${BOT_NAME}-staging-sync-$$"

log() { echo "[$(date)] $1" >> "$LOGFILE"; }

cleanup() {
  if [ -d "$WORKTREE_DIR" ]; then
    cd "$REPO_ROOT" 2>/dev/null || true
    git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

log "Starting staging sync"

cd "$REPO_ROOT"
git fetch origin main bot/staging 2>/dev/null || { log "ERROR: git fetch failed"; exit 1; }

# ─── Step 1: Merge main → bot/staging ─────────────────────────────────────────
# Check if main has commits not on bot/staging
MAIN_AHEAD=$(git rev-list --count origin/bot/staging..origin/main 2>/dev/null || echo "0")

if [ "$MAIN_AHEAD" -gt 0 ]; then
  log "main is $MAIN_AHEAD commits ahead of bot/staging — merging"

  git worktree add "$WORKTREE_DIR" origin/bot/staging 2>/dev/null || {
    log "ERROR: failed to create worktree for bot/staging"
    exit 1
  }
  cd "$WORKTREE_DIR"
  git checkout bot/staging 2>/dev/null || git checkout -b bot/staging origin/bot/staging 2>/dev/null

  if git merge origin/main --no-edit 2>> "$LOGFILE"; then
    git push origin bot/staging 2>> "$LOGFILE"
    log "Merged $MAIN_AHEAD commits from main → bot/staging"
  else
    git merge --abort 2>/dev/null || true
    log "ERROR: merge conflict merging main → bot/staging — needs manual resolution"

    # Alert in Slack
    "$BOT_SCRIPTS_DIR/slack-post.sh" \
      --channel "$BOT_OPS_CHANNEL_ID" \
      --text "⚠️ *bot/staging merge conflict* — main has $MAIN_AHEAD commits that conflict with bot/staging. Needs manual resolution." 2>/dev/null || true
  fi

  cd "$REPO_ROOT"
else
  log "bot/staging is up-to-date with main"
fi

# ─── Step 2: Check if bot/staging has work ahead of main ──────────────────────
git fetch origin main bot/staging 2>/dev/null || true
STAGING_AHEAD=$(git rev-list --count origin/main..origin/bot/staging 2>/dev/null || echo "0")

if [ "$STAGING_AHEAD" -eq 0 ]; then
  log "No new work on bot/staging — nothing to PR"
  exit 0
fi

log "bot/staging has $STAGING_AHEAD commits ahead of main"

# ─── Ghost-commit detection ────────────────────────────────────────────────
# If the tree contents of bot/staging and main are identical, every commit ahead
# is a "ghost": its changes already exist on main via a different SHA (typically
# a human PR that superseded the bot's PR). Reset staging to main so future
# rollup PRs start from a clean baseline and aren't polluted with noise.
if git diff --quiet origin/main origin/bot/staging 2>/dev/null; then
  log "bot/staging has $STAGING_AHEAD commits ahead but no file delta vs main — resetting to main"
  if git push --force-with-lease origin "origin/main:refs/heads/bot/staging" 2>> "$LOGFILE"; then
    log "Reset bot/staging to origin/main (dropped $STAGING_AHEAD ghost commit(s))"
    "$BOT_SCRIPTS_DIR/slack-post.sh" \
      --channel "$BOT_OPS_CHANNEL_ID" \
      --text "🧹 Reset \`bot/staging\` to \`main\` — dropped $STAGING_AHEAD ghost commit(s) (tree content already on main via different SHAs)." 2>/dev/null || true
  else
    log "ERROR: force-push to reset bot/staging failed (possible concurrent push?)"
  fi
  exit 0
fi

# Check if there's already an open staging PR
EXISTING_PR=$(gh pr list --repo "$GITHUB_REPO" --head bot/staging --base main --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")

if [ -n "$EXISTING_PR" ]; then
  log "Staging PR #$EXISTING_PR already open — skipping creation"
  exit 0
fi

# Build the PR body from the file-level diff (not the commit list). The commit
# list often includes ghost commits whose content already landed on main via
# different SHAs, making the PR look bigger than it is.
DIFF_STAT=$(git diff --stat origin/main...origin/bot/staging 2>/dev/null | head -30)
CHANGES=$(git log origin/main..origin/bot/staging --oneline 2>/dev/null | head -20)
TODAY=$(date +%Y-%m-%d)

PR_BODY="## Bot Staging Merge — $TODAY

**File-level delta against main:**

\`\`\`
$DIFF_STAT
\`\`\`

<details>
<summary>Commits on bot/staging ($STAGING_AHEAD total — may include ghosts whose content already landed on main)</summary>

\`\`\`
$CHANGES
\`\`\`
</details>

[Compare view](https://github.com/$GITHUB_REPO/compare/main...bot/staging)

These changes were created autonomously by the bot and accumulated on \`bot/staging\`. Review and merge when ready."

PR_URL=$(gh pr create --repo "$GITHUB_REPO" \
  --head bot/staging \
  --base main \
  --title "Bot/staging — $TODAY ($STAGING_AHEAD commits)" \
  --body "$PR_BODY" \
  --label "bot:needs-human-review" 2>&1) || {
  log "ERROR: failed to create staging PR: $PR_URL"
  exit 1
}

log "Created staging PR: $PR_URL"

# Notify in Slack
"$BOT_SCRIPTS_DIR/slack-post.sh" \
  --channel "$BOT_OPS_CHANNEL_ID" \
  --text "📦 *Bot staging PR ready for review* — $STAGING_AHEAD commits
<$PR_URL|View PR> • <https://github.com/$GITHUB_REPO/compare/main...bot/staging|Compare>" 2>/dev/null || true
