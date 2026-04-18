#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"

LOGFILE="$BOT_LOG_DIR/bot-expert-review.log"

# Find all open issues with the bot:expert-review label (excluding wontfix)
ISSUES=$(gh issue list --repo "$GITHUB_REPO" --label "bot:expert-review" --state open --json number,title,labels --limit 20 2>/dev/null | jq '[.[] | select([.labels[].name] | index("wontfix") | not)]') || {
  echo "[$(date)] GitHub API error fetching bot:expert-review issues" >> "$LOGFILE"
  exit 1
}

ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')
if [ "$ISSUE_COUNT" -eq 0 ]; then
  exit 0
fi

echo "[$(date)] Found $ISSUE_COUNT issue(s) with bot:expert-review label" >> "$LOGFILE"

# Process one issue at a time (each cron run advances one step per issue)
for NUMBER in $(echo "$ISSUES" | jq -r '.[].number'); do
  TITLE=$(echo "$ISSUES" | jq -r ".[] | select(.number == $NUMBER) | .title")
  echo "[$(date)] Processing issue #$NUMBER: $TITLE" >> "$LOGFILE"

  "$BOT_SCRIPTS_DIR/run-claude.sh" "bot-expert-review-$NUMBER" \
    "Run /bot-expert-review $NUMBER — advance the expert review by exactly one step, then exit." \
    "$PROJECT_DIR/.claude/commands/bot-expert-review.md"
done
