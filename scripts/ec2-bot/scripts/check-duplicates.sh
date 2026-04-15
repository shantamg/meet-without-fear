#!/bin/bash
# check-duplicates.sh — Detect and handle duplicate GitHub issues
#
# Called by workspace-dispatcher.sh before dispatching an agent.
# Compares the issue against other open issues to find potential duplicates
# using GitHub search and title word-overlap scoring.
#
# Usage:
#   check-duplicates.sh <issue_number>
#
# Exit codes:
#   0 — No duplicates found (proceed with dispatch)
#   1 — Duplicate found and handled (skip dispatch)
#   2 — Error (proceed with dispatch to be safe)
#
# Environment:
#   DUPLICATE_AUTO_CLOSE_THRESHOLD — Word overlap % to auto-close (default 80)
#   DUPLICATE_COMMENT_THRESHOLD    — Word overlap % to comment + pause (default 50)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"

REPO="$GITHUB_REPO"
LOGFILE="$BOT_LOG_DIR/check-duplicates.log"
AUTO_CLOSE_THRESHOLD="${DUPLICATE_AUTO_CLOSE_THRESHOLD:-80}"
COMMENT_THRESHOLD="${DUPLICATE_COMMENT_THRESHOLD:-50}"

log() { echo "[$(date)] $1" >> "$LOGFILE" 2>/dev/null || true; }

ISSUE_NUMBER="${1:?Usage: check-duplicates.sh <issue_number>}"

# ─── Fetch the issue ─────────────────────────────────────────────────────────

ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" \
  --json title,body,labels,createdAt 2>/dev/null) || {
  log "ERROR: Failed to fetch issue #$ISSUE_NUMBER"
  exit 2
}

ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title // ""')
ISSUE_BODY=$(echo "$ISSUE_DATA" | jq -r '.body // ""')
ISSUE_CREATED=$(echo "$ISSUE_DATA" | jq -r '.createdAt // ""')

# Already labeled duplicate — nothing to do
ALREADY_DUPLICATE=$(echo "$ISSUE_DATA" | jq -r '.labels[]?.name' 2>/dev/null | grep -c '^duplicate$' || true)
if [ "$ALREADY_DUPLICATE" -gt 0 ]; then
  log "Issue #$ISSUE_NUMBER already labeled duplicate — skipping"
  exit 1
fi

# Auto-generated expert-review-thread issues are children of a parent issue
# and their title is literally "Expert Review: " + parent title — running
# duplicate detection on them will always match the parent and trip a false
# positive. Skip entirely.
IS_REVIEW_THREAD=$(echo "$ISSUE_DATA" | jq -r '.labels[]?.name' 2>/dev/null | grep -c '^expert-review-thread$' || true)
if [ "$IS_REVIEW_THREAD" -gt 0 ]; then
  log "Issue #$ISSUE_NUMBER is an expert-review-thread — skipping duplicate detection"
  exit 0
fi

if [ -z "$ISSUE_TITLE" ]; then
  log "Issue #$ISSUE_NUMBER has no title — skipping duplicate check"
  exit 0
fi

# ─── Extract search keywords ─────────────────────────────────────────────────
# Remove common prefixes (feat, fix, chore, etc.) and stop words
# to get meaningful search terms.

normalize_title() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/^(feat|fix|chore|refactor|test|docs|ci|build|perf|style)(\([^)]*\))?[: ]+//' \
    | sed -E 's/[^a-z0-9 ]/ /g' \
    | tr -s ' '
}

# Split into words, remove stop words, keep significant terms
extract_keywords() {
  echo "$1" | tr ' ' '\n' | grep -vE '^(the|a|an|and|or|for|to|in|of|is|it|on|at|by|with|from|as|be|was|are|that|this|but|not|have|has|had|do|does|did|will|would|could|should|can|may|add|update|fix|remove|use|make|set|get|new|bot|app|all|no|so|if|we|our)$' | grep -E '.{3,}' | head -6
}

NORMALIZED=$(normalize_title "$ISSUE_TITLE")
KEYWORDS=$(extract_keywords "$NORMALIZED")
KEYWORD_COUNT=$(echo "$KEYWORDS" | wc -l | tr -d ' ')

if [ "$KEYWORD_COUNT" -lt 2 ]; then
  log "Issue #$ISSUE_NUMBER title too short for duplicate detection"
  exit 0
fi

# Build a search query from the top keywords (use first 4 for specificity)
SEARCH_TERMS=$(echo "$KEYWORDS" | head -4 | tr '\n' ' ' | sed 's/ *$//')

log "Checking #$ISSUE_NUMBER for duplicates. Keywords: $SEARCH_TERMS"

# ─── Search for similar open issues ──────────────────────────────────────────

CANDIDATES=$(gh issue list --repo "$REPO" --state open --limit 20 \
  --search "$SEARCH_TERMS" \
  --json number,title,createdAt,labels,url 2>/dev/null) || {
  log "ERROR: GitHub search failed for #$ISSUE_NUMBER"
  exit 2
}

# Remove self from results
CANDIDATES=$(echo "$CANDIDATES" | jq --argjson n "$ISSUE_NUMBER" '[.[] | select(.number != $n)]')
CANDIDATE_COUNT=$(echo "$CANDIDATES" | jq 'length')

if [ "$CANDIDATE_COUNT" -eq 0 ]; then
  log "No duplicate candidates found for #$ISSUE_NUMBER"
  exit 0
fi

log "Found $CANDIDATE_COUNT candidate(s) for #$ISSUE_NUMBER"

# ─── Score candidates by title word overlap ──────────────────────────────────

# Get the set of keywords from the source issue
SOURCE_WORDS=$(echo "$NORMALIZED" | tr ' ' '\n' | sort -u)
SOURCE_COUNT=$(echo "$SOURCE_WORDS" | grep -c '.' || true)
SOURCE_COUNT=${SOURCE_COUNT:-0}

best_score=0
best_number=""
best_title=""
best_url=""

while IFS= read -r CANDIDATE; do
  C_NUMBER=$(echo "$CANDIDATE" | jq -r '.number')
  C_TITLE=$(echo "$CANDIDATE" | jq -r '.title')
  C_CREATED=$(echo "$CANDIDATE" | jq -r '.createdAt')
  C_URL=$(echo "$CANDIDATE" | jq -r '.url')

  # Skip issues that are already labeled duplicate
  C_IS_DUP=$(echo "$CANDIDATE" | jq -r '.labels[]?.name' 2>/dev/null | grep -c '^duplicate$' || true)
  if [ "$C_IS_DUP" -gt 0 ]; then
    continue
  fi

  # Skip auto-generated derivative issues. expert-review-thread issues are
  # created by the expert-review workspace as discussion children of a parent
  # issue, and their title is literally "Expert Review: " + parent title — so
  # they will ALWAYS score ~78% similarity against their own parent and trip
  # this detector. Without this guard, every parent in a multi-pass
  # expert-review flow gets its `bot:expert-review` label stripped on the
  # second dispatcher tick (see #1600 / #1601 on 2026-04-09).
  C_IS_REVIEW_THREAD=$(echo "$CANDIDATE" | jq -r '.labels[]?.name' 2>/dev/null | grep -c '^expert-review-thread$' || true)
  if [ "$C_IS_REVIEW_THREAD" -gt 0 ]; then
    log "  Skipping candidate #$C_NUMBER — auto-generated expert-review-thread"
    continue
  fi

  C_NORMALIZED=$(normalize_title "$C_TITLE")
  C_WORDS=$(echo "$C_NORMALIZED" | tr ' ' '\n' | sort -u)

  # Calculate word overlap (Jaccard-like: intersection / union).
  # `grep -c` returns exit 1 when there are 0 matches, so the old
  # `grep -c '.' || echo "0"` pattern produced a two-line value ("0\n0") when
  # the candidate had no matching words, which then broke `$((... / UNION))`
  # with "arithmetic syntax error". Normalize empty → 0 instead.
  UNION=$(printf '%s\n%s' "$SOURCE_WORDS" "$C_WORDS" | sort -u | grep -c '.' || true)
  UNION=${UNION:-1}
  INTERSECTION=$(comm -12 <(echo "$SOURCE_WORDS") <(echo "$C_WORDS") | grep -c '.' || true)
  INTERSECTION=${INTERSECTION:-0}

  if [ "$UNION" -gt 0 ]; then
    SCORE=$((INTERSECTION * 100 / UNION))
  else
    SCORE=0
  fi

  log "  Candidate #$C_NUMBER ($C_TITLE): score=$SCORE% (overlap=$INTERSECTION/$UNION)"

  if [ "$SCORE" -gt "$best_score" ]; then
    best_score=$SCORE
    best_number=$C_NUMBER
    best_title=$C_TITLE
    best_url=$C_URL
  fi
done < <(echo "$CANDIDATES" | jq -c '.[]')

# ─── Handle results ──────────────────────────────────────────────────────────

if [ "$best_score" -lt "$COMMENT_THRESHOLD" ]; then
  log "No strong duplicates for #$ISSUE_NUMBER (best score: $best_score%)"
  exit 0
fi

# Determine which issue is the canonical one (older = canonical)
CANONICAL_NUMBER=$best_number
CANONICAL_TITLE=$best_title
CANONICAL_URL=$best_url
DUPLICATE_NUMBER=$ISSUE_NUMBER

log "Duplicate detected: #$ISSUE_NUMBER is a duplicate of #$best_number (score=$best_score%)"

if [ "$best_score" -ge "$AUTO_CLOSE_THRESHOLD" ]; then
  # High confidence — auto-close the newer issue
  COMMENT="## Duplicate Issue Detected

This issue appears to be a duplicate of **#${CANONICAL_NUMBER}** (${best_score}% title similarity).

| | This Issue | Canonical Issue |
|---|---|---|
| **Number** | #${DUPLICATE_NUMBER} | #${CANONICAL_NUMBER} |
| **Title** | ${ISSUE_TITLE} | ${CANONICAL_TITLE} |

**Action taken:** Closing this issue as a duplicate. All discussion should continue on [#${CANONICAL_NUMBER}](${CANONICAL_URL}).

If this was incorrectly identified as a duplicate, remove the \`duplicate\` label and reopen this issue."

  gh issue comment "$DUPLICATE_NUMBER" --repo "$REPO" --body "$COMMENT" 2>/dev/null || true
  gh issue edit "$DUPLICATE_NUMBER" --repo "$REPO" --add-label "duplicate" 2>/dev/null || true
  gh issue close "$DUPLICATE_NUMBER" --repo "$REPO" --reason "not planned" 2>/dev/null || true

  log "Auto-closed #$DUPLICATE_NUMBER as duplicate of #$CANONICAL_NUMBER (score=$best_score%)"
  exit 1

elif [ "$best_score" -ge "$COMMENT_THRESHOLD" ]; then
  # Medium confidence — comment but don't auto-close, skip dispatch
  COMMENT="## Possible Duplicate Detected

This issue may be a duplicate of **#${CANONICAL_NUMBER}** (${best_score}% title similarity).

| | This Issue | Possible Original |
|---|---|---|
| **Number** | #${DUPLICATE_NUMBER} | #${CANONICAL_NUMBER} |
| **Title** | ${ISSUE_TITLE} | ${CANONICAL_TITLE} |

**Action needed:** A human should confirm whether this is a duplicate.
- If duplicate: add the \`duplicate\` label and close this issue
- If not a duplicate: remove any \`bot:*\` labels, re-add the appropriate trigger label, and the bot will proceed

Bot processing is **paused** until this is resolved."

  gh issue comment "$DUPLICATE_NUMBER" --repo "$REPO" --body "$COMMENT" 2>/dev/null || true

  log "Flagged #$DUPLICATE_NUMBER as possible duplicate of #$CANONICAL_NUMBER (score=$best_score%), paused dispatch"
  exit 1
fi

exit 0
