#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/config.sh"
GH_COST_TRACE_AUTO=1 source "$SCRIPT_DIR/lib/gh-cost-trace.sh"
source "$SCRIPT_DIR/lib/shared.sh"
# Phase 5 migration: read PR state from the github-state-scanner state
# file when fresh, fall back to gh pr view otherwise. Same defensive
# pattern as Phase 2's workspace-dispatcher migration.
source "$SCRIPT_DIR/lib/github-state.sh"

# check_github_state_file_usable — silently returns false when the
# scanner state file is missing or stale, so check-github.sh can fall
# back to direct gh calls during scanner outages without spamming stderr.
check_github_state_file_usable() {
  [ -f "$GITHUB_STATE_FILE" ] || return 1
  github_state_assert_fresh >/dev/null 2>&1
}

LOCKFILE="${LOCK_PREFIX}-check-github.lock"
[ -f "$LOCKFILE" ] && exit 0
touch "$LOCKFILE"
# Chain gh_cost_trace_end so the auto-trace trap installed by
# lib/gh-cost-trace.sh still fires. A bare `trap ... EXIT` here would
# overwrite it and suppress cost logging for this script entirely.
trap "gh_cost_trace_end 2>/dev/null || true; rm -f $LOCKFILE" EXIT

LOGFILE="${BOT_LOG_DIR}/check-github.log"

# Clean up claim files older than 24 hours to prevent unbounded growth
find "$CLAIMS_DIR" -name "claimed-gh-*.txt" -mmin +1440 -delete 2>/dev/null || true

LAST_TS_FILE="$BOT_STATE_DIR/github-last-checked.txt"
LAST_CHECKED=$(cat "$LAST_TS_FILE" 2>/dev/null || echo "")

# Build the gh api URL — query params must be in the URL for GET requests
NOTIF_URL="/notifications?participating=true"
if [ -n "$LAST_CHECKED" ]; then
  NOTIF_URL="${NOTIF_URL}&since=${LAST_CHECKED}"
fi

# Fetch unread notifications
NOTIFICATIONS=$(gh api "$NOTIF_URL" --jq ".[]" 2>/dev/null) || {
  echo "[$(date)] GitHub API error" >> "$LOGFILE"
  exit 1
}

# Catch-up sweep: every 15 minutes, also fetch all notifications from the last 2 hours
# (including already-read ones) to catch any that were auto-read before the cron claimed them
CATCHUP_FILE="$BOT_STATE_DIR/github-last-catchup.txt"
LAST_CATCHUP=$(cat "$CATCHUP_FILE" 2>/dev/null || echo "0")
NOW_EPOCH=$(date +%s)
CATCHUP_INTERVAL=900  # 15 minutes

if [ $(( NOW_EPOCH - LAST_CATCHUP )) -ge $CATCHUP_INTERVAL ]; then
  TWO_HOURS_AGO=$(date -u -d "@$((NOW_EPOCH - 7200))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -r $((NOW_EPOCH - 7200)) +"%Y-%m-%dT%H:%M:%SZ")
  CATCHUP_NOTIFICATIONS=$(gh api "/notifications?all=true&participating=true&since=${TWO_HOURS_AGO}" --jq ".[]" 2>/dev/null) || true

  if [ -n "$CATCHUP_NOTIFICATIONS" ]; then
    # Merge with unread notifications (claims dedup will prevent double-processing)
    if [ -n "$NOTIFICATIONS" ]; then
      NOTIFICATIONS=$(printf '%s\n%s' "$NOTIFICATIONS" "$CATCHUP_NOTIFICATIONS")
    else
      NOTIFICATIONS="$CATCHUP_NOTIFICATIONS"
    fi
  fi

  echo "$NOW_EPOCH" > "$CATCHUP_FILE"
fi

# ─── Mention polling fallback ────────────────────────────────────────────────
# GitHub's notifications API sometimes drops events entirely. Every 15 minutes,
# search for recent @MwfBot mentions in issue/PR comments and synthesize
# notifications for any the notification system missed.
MENTION_POLL_FILE="$BOT_STATE_DIR/github-last-mention-poll.txt"
LAST_MENTION_POLL=$(cat "$MENTION_POLL_FILE" 2>/dev/null || echo "0")
MENTION_POLL_INTERVAL=900  # 15 minutes

if [ $(( NOW_EPOCH - LAST_MENTION_POLL )) -ge $MENTION_POLL_INTERVAL ]; then
  ONE_HOUR_AGO=$(date -u -d "@$((NOW_EPOCH - 3600))" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -r $((NOW_EPOCH - 3600)) +"%Y-%m-%dT%H:%M:%SZ")

  # Search for recent issue comments mentioning @MwfBot
  MENTION_COMMENTS=$(gh api "search/issues?q=repo:${GITHUB_REPO}+mentions:MwfBot+updated:>=${ONE_HOUR_AGO}&per_page=20" \
    --jq '.items[] | {number: .number, title: .title, type: (if .pull_request then "PullRequest" else "Issue" end)}' 2>/dev/null) || MENTION_COMMENTS=""

  if [ -n "$MENTION_COMMENTS" ]; then
    echo "$MENTION_COMMENTS" | jq -c '.' | while IFS= read -r ITEM; do
      M_NUMBER=$(echo "$ITEM" | jq -r '.number')
      M_TITLE=$(echo "$ITEM" | jq -r '.title')
      M_TYPE=$(echo "$ITEM" | jq -r '.type')

      # Check if we already have a claim for this item (any recent claim with this number)
      if ls "$CLAIMS_DIR"/claimed-gh-*-mention-"${M_NUMBER}".txt 2>/dev/null | head -1 | grep -q .; then
        continue
      fi

      # Fetch the most recent comment that mentions @MwfBot
      # Always use issues endpoint — it returns regular comments for both PRs and issues.
      # The pulls/.../comments endpoint only returns inline review comments.
      RECENT_COMMENT=$(gh api "repos/${GITHUB_REPO}/issues/${M_NUMBER}/comments?per_page=10&direction=desc" \
        --jq '[.[] | select(.body | test("@MwfBot"; "i"))][0] | {id: .id, body: .body, author: .user.login, created: .created_at}' 2>/dev/null) || continue

      [ -z "$RECENT_COMMENT" ] || [ "$RECENT_COMMENT" = "null" ] && continue

      C_ID=$(echo "$RECENT_COMMENT" | jq -r '.id')
      C_CREATED=$(echo "$RECENT_COMMENT" | jq -r '.created')

      # Skip if comment is older than our poll window
      if [[ "$C_CREATED" < "$ONE_HOUR_AGO" ]]; then
        continue
      fi

      # Check if we already processed this via notifications (check for any claim with this comment ID hash)
      C_HASH=$(echo "${C_ID}" | md5sum | cut -c1-8)
      if ls "$CLAIMS_DIR"/claimed-gh-*"${C_HASH}"*.txt 2>/dev/null | head -1 | grep -q .; then
        continue
      fi

      # Claim it
      MENTION_CLAIM="$CLAIMS_DIR/claimed-gh-mention-poll-${C_HASH}-mention-${M_NUMBER}.txt"
      if ! (set -o noclobber; echo "$$" > "$MENTION_CLAIM") 2>/dev/null; then
        continue
      fi

      C_BODY=$(echo "$RECENT_COMMENT" | jq -r '.body')
      C_AUTHOR=$(echo "$RECENT_COMMENT" | jq -r '.author')
      M_LABEL=$( [ "$M_TYPE" = "PullRequest" ] && echo "PR" || echo "Issue" )

      # Skip if bot already responded after this mention (prevents duplicate work
      # from manual triggers, delayed notifications, or overlapping poll windows)
      BOT_REPLIED=$(gh api "repos/${GITHUB_REPO}/issues/${M_NUMBER}/comments?per_page=10&direction=desc" \
        --jq "[.[] | select((${BOT_USER_JQ_MATCH}) and .created_at > \"${C_CREATED}\")] | length" 2>/dev/null || echo "0")
      if [ "$BOT_REPLIED" -gt 0 ]; then
        echo "[$(date)] Mention-poll: skipping ${M_LABEL} #${M_NUMBER} — bot already responded after the mention" >> "$LOGFILE"
        continue
      fi

      echo "[$(date)] Mention-poll fallback: found @MwfBot mention in ${M_LABEL} #${M_NUMBER} by ${C_AUTHOR} (comment ${C_ID})" >> "$LOGFILE"

      # Add 👀 reaction
      COMMENT_API_URL="repos/${GITHUB_REPO}/issues/comments/${C_ID}"
      EYES_JSON=$(gh api "${COMMENT_API_URL}/reactions" -f content="eyes" 2>/dev/null || echo "")
      EYES_RID=$(echo "$EYES_JSON" | jq -r '.id // empty' 2>/dev/null || echo "")

      # Invoke Claude (high priority — human interaction)
      (
        set +e
        PRIORITY=high "$BOT_SCRIPTS_DIR/run-claude.sh" "respond-github-${M_NUMBER}" \
          "Use the /respond-github skill with these details:

${M_LABEL}: #${M_NUMBER}
Repo: ${GITHUB_REPO}
Comment ID: ${C_ID}
Comment Author: ${C_AUTHOR}
Comment Body:
${C_BODY}

Respond to this specific comment on ${M_LABEL} #${M_NUMBER}. Use /respond-github ${M_NUMBER} ${GITHUB_REPO} ${C_ID} ${C_AUTHOR}"

        if [ -n "${EYES_RID}" ]; then
          gh api -X DELETE "${COMMENT_API_URL}/reactions/${EYES_RID}" 2>/dev/null || true
        fi
      ) &
    done
  fi

  echo "$NOW_EPOCH" > "$MENTION_POLL_FILE"
fi

# Exit if no notifications
if [ -z "$NOTIFICATIONS" ]; then
  exit 0
fi

# Update last-checked to now (ISO 8601)
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LAST_TS_FILE"

# Process each notification as a JSON line
echo "$NOTIFICATIONS" | jq -c '.' | while IFS= read -r NOTIF; do
  NOTIF_ID=$(echo "$NOTIF" | jq -r '.id')
  REASON=$(echo "$NOTIF" | jq -r '.reason')
  SUBJECT_TYPE=$(echo "$NOTIF" | jq -r '.subject.type')
  SUBJECT_TITLE=$(echo "$NOTIF" | jq -r '.subject.title')
  SUBJECT_URL=$(echo "$NOTIF" | jq -r '.subject.url')
  REPO=$(echo "$NOTIF" | jq -r '.repository.full_name')
  COMMENT_URL=$(echo "$NOTIF" | jq -r '.subject.latest_comment_url // empty')
  UPDATED_AT=$(echo "$NOTIF" | jq -r '.updated_at // empty')

  # Handle PullRequest and Issue notifications
  if [ "$SUBJECT_TYPE" != "PullRequest" ] && [ "$SUBJECT_TYPE" != "Issue" ]; then
    continue
  fi

  # Atomic claim to prevent double-processing
  # Include updated_at hash so re-requests and new comments get processed
  # (review re-requests update the same notification with a new updated_at)
  CLAIM_KEY="${NOTIF_ID}-$(echo "${UPDATED_AT}" | md5sum | cut -c1-8)"
  CLAIM_FILE="$CLAIMS_DIR/claimed-gh-${CLAIM_KEY}.txt"
  if ! (set -o noclobber; echo "$$" > "$CLAIM_FILE") 2>/dev/null; then
    continue
  fi

  # Extract number from URL (e.g. .../pulls/123 or .../issues/123)
  ITEM_NUMBER=$(echo "$SUBJECT_URL" | grep -oP '/(pulls|issues)/\K[0-9]+')
  ITEM_LABEL=$( [ "$SUBJECT_TYPE" = "PullRequest" ] && echo "PR" || echo "Issue" )

  echo "[$(date)] New GitHub notification: reason=$REASON type=$SUBJECT_TYPE ${ITEM_LABEL}=#${ITEM_NUMBER} title='$SUBJECT_TITLE'" >> "$LOGFILE"

  # Immediate 👀 reaction on the triggering comment (before spawning Claude)
  # Capture reaction ID so we can remove 👀 when the agent finishes
  EYES_REACTION_ID=""
  if [ -n "$COMMENT_URL" ]; then
    EYES_JSON=$(gh api "${COMMENT_URL}/reactions" -f content="eyes" 2>/dev/null || echo "")
    EYES_REACTION_ID=$(echo "$EYES_JSON" | jq -r '.id // empty' 2>/dev/null || echo "")
  fi

  case "$REASON" in
    review_requested)
      # Tagged as a reviewer (initial or re-request) — invoke the review-pr skill (PRs only)
      if [ "$SUBJECT_TYPE" = "PullRequest" ]; then
        # Skip merged/closed PRs — prevents infinite review loops.
        #
        # Phase 5: read this from the github-state file when fresh. The
        # scanner only tracks OPEN PRs, so the rule becomes simple — if
        # the PR is in .prs, it's open; if not, it's not. This also
        # eliminates the "UNKNOWN" failure mode of the old gh-call
        # version: previously, when `gh pr view --json state` failed for
        # any transient reason (rate limit, network blip, gh CLI cache),
        # PR_STATE defaulted to "UNKNOWN" and the script silently skipped
        # the review request. Legitimate reviews fell on the floor. The
        # state-file path can't fail in that mode — it either finds the
        # entry or it doesn't.
        if check_github_state_file_usable; then
          PR_STATE_ENTRY=$(github_state_pr "$ITEM_NUMBER" 2>/dev/null || echo "null")
          if [ "$PR_STATE_ENTRY" = "null" ]; then
            PR_STATE="NOT_OPEN"  # Not in scanner = not open (closed/merged/missing)
          else
            PR_STATE="OPEN"
          fi
        else
          PR_STATE=$(gh pr view "$ITEM_NUMBER" --repo "$REPO" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
        fi
        if [ "$PR_STATE" != "OPEN" ]; then
          echo "[$(date)] Skipping review_requested for ${PR_STATE} PR #${ITEM_NUMBER}" >> "$LOGFILE"
          gh api -X PATCH "/notifications/threads/${NOTIF_ID}" 2>/dev/null || true
          rm -f "$CLAIM_FILE"
          continue
        fi

        # Skip if the bot already reviewed at the current HEAD commit.
        # Without this guard the bot loops: review → updated_at changes →
        # GitHub re-sends review_requested → bot reviews again.
        # Accepts both legacy (MwfBot) and App (mwf-bot-app[bot]) identities.
        #
        # Phase 5: read head_sha and last_bot_review_sha from the state file.
        # The scanner extracts last_bot_review_sha from latestReviews, so we
        # don't need a separate gh pr view call. Falls back to direct gh call
        # if the state file is unavailable.
        HEAD_SHA=""
        LAST_BOT_REVIEW_SHA=""
        if check_github_state_file_usable && [ "$PR_STATE_ENTRY" != "null" ]; then
          HEAD_SHA=$(echo "$PR_STATE_ENTRY" | jq -r '.head_sha // empty')
          LAST_BOT_REVIEW_SHA=$(echo "$PR_STATE_ENTRY" | jq -r '.last_bot_review_sha // empty')
        else
          # Fallback: state file unavailable or PR not in it — use direct gh call
          PR_JSON=$(gh pr view "$ITEM_NUMBER" --repo "$REPO" \
            --json headRefOid,reviews 2>/dev/null || echo "")
          if [ -n "$PR_JSON" ]; then
            HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid // empty')
            LAST_BOT_REVIEW_SHA=$(echo "$PR_JSON" | jq -r \
              "[.reviews[] | select(${BOT_AUTHOR_JQ_MATCH})] | last | .commit.oid // empty")
          fi
        fi
        if [ -n "$HEAD_SHA" ] && [ -n "$LAST_BOT_REVIEW_SHA" ] && [ "$HEAD_SHA" = "$LAST_BOT_REVIEW_SHA" ]; then
          echo "[$(date)] Skipping review_requested for PR #${ITEM_NUMBER}: bot already reviewed at HEAD ${HEAD_SHA:0:8}" >> "$LOGFILE"
          rm -f "$CLAIM_FILE"
          continue
        fi

        # Phase 4: extract PR slice from github-state.json into a session
        # context file so the /review-pr skill reads metadata from there
        # instead of making its own gh pr view calls inside the Claude session.
        SESSION_CONTEXT_FILE="/tmp/slam-bot/review-pr-${ITEM_NUMBER}-session-context.json"
        mkdir -p /tmp/slam-bot 2>/dev/null || true
        if check_github_state_file_usable; then
          jq -c --arg n "$ITEM_NUMBER" '{
            source: "github-state-scanner",
            generated_at: .generated_at,
            pr: .prs[$n]
          }' "$GITHUB_STATE_FILE" > "$SESSION_CONTEXT_FILE" 2>/dev/null || true
        fi
        # If state file wasn't usable or jq failed, fetch directly as fallback
        if [ ! -s "$SESSION_CONTEXT_FILE" ]; then
          PR_FALLBACK=$(gh pr view "$ITEM_NUMBER" --repo "$REPO" \
            --json number,title,state,headRefName,baseRefName,author,labels,reviewDecision,isDraft 2>/dev/null || echo "")
          if [ -n "$PR_FALLBACK" ]; then
            # Normalize to match state-file schema
            echo "$PR_FALLBACK" | jq -c '{
              source: "gh-fallback",
              generated_at: now | todate,
              pr: {
                number: .number,
                title: .title,
                baseRefName: .baseRefName,
                headRefName: .headRefName,
                author_login: .author.login,
                isDraft: .isDraft,
                reviewDecision: .reviewDecision,
                labels: [(.labels // [])[].name]
              }
            }' > "$SESSION_CONTEXT_FILE" 2>/dev/null || true
          fi
        fi

        (
          set +e
          SESSION_CONTEXT="$SESSION_CONTEXT_FILE" \
          PRIORITY=high "$BOT_SCRIPTS_DIR/run-claude.sh" "review-pr-${ITEM_NUMBER}" \
            "Use the /review-pr skill: /review-pr ${ITEM_NUMBER} ${REPO}

[SESSION_CONTEXT]
PR metadata has been pre-loaded into $SESSION_CONTEXT_FILE from the github-state scanner.
Read that file for PR title, author, base/head branch, labels, checks, and review status.
Do NOT call \`gh pr view --json\` — all metadata you need is in the session context file.
The only \`gh\` read call allowed is \`gh pr diff\` (for the actual diff text).
[END SESSION_CONTEXT]"

          # Remove 👀 on completion
          if [ -n "${EYES_REACTION_ID}" ] && [ -n "${COMMENT_URL}" ]; then
            gh api -X DELETE "${COMMENT_URL}/reactions/${EYES_REACTION_ID}" 2>/dev/null || true
          fi
          # Clean up session context file
          rm -f "$SESSION_CONTEXT_FILE"
        ) &
      else
        echo "[$(date)] Skipping review_requested for non-PR $NOTIF_ID" >> "$LOGFILE"
        rm -f "$CLAIM_FILE"
        continue
      fi
      ;;
    mention|comment|team_mention|author)
      # Fetch the specific comment that triggered this notification
      COMMENT_ID=""
      COMMENT_BODY=""
      COMMENT_AUTHOR=""

      if [ -n "$COMMENT_URL" ]; then
        COMMENT_JSON=$(gh api "$COMMENT_URL" 2>/dev/null || echo "")
        if [ -n "$COMMENT_JSON" ]; then
          COMMENT_ID=$(echo "$COMMENT_JSON" | jq -r '.id // empty')
          COMMENT_BODY=$(echo "$COMMENT_JSON" | jq -r '.body // empty')
          COMMENT_AUTHOR=$(echo "$COMMENT_JSON" | jq -r '.user.login // empty')
        fi
      fi

      # Only respond to comments where bot is explicitly @mentioned.
      # For reason=mention/team_mention, GitHub already confirmed we were tagged.
      # For reason=comment/author, we're just subscribed — only respond if comment
      # body contains @MwfBot (case-insensitive). This prevents the bot from
      # jumping into conversations where humans are just discussing.
      if [ "$REASON" = "comment" ] || [ "$REASON" = "author" ]; then
        if ! echo "$COMMENT_BODY" | grep -qi "@MwfBot"; then
          echo "[$(date)] Skipping ${ITEM_LABEL} #${ITEM_NUMBER} — reason=$REASON but bot not @mentioned in comment" >> "$LOGFILE"
          rm -f "$CLAIM_FILE"
          # Remove 👀 reaction since we're not going to respond
          if [ -n "${EYES_REACTION_ID}" ] && [ -n "${COMMENT_URL}" ]; then
            gh api -X DELETE "${COMMENT_URL}/reactions/${EYES_REACTION_ID}" 2>/dev/null || true
          fi
          continue
        fi
      fi

      if [ -n "$COMMENT_ID" ] && [ -n "$COMMENT_BODY" ]; then
        # Skip if bot already responded after this comment (prevents duplicate work
        # from manual triggers, delayed notifications, or overlapping paths)
        COMMENT_CREATED=$(echo "$COMMENT_JSON" | jq -r '.created_at // empty')
        if [ -n "$COMMENT_CREATED" ]; then
          BOT_REPLIED=$(gh api "repos/${REPO}/issues/${ITEM_NUMBER}/comments?per_page=10&direction=desc" \
            --jq "[.[] | select((${BOT_USER_JQ_MATCH}) and .created_at > \"${COMMENT_CREATED}\")] | length" 2>/dev/null || echo "0")
          if [ "$BOT_REPLIED" -gt 0 ]; then
            echo "[$(date)] Skipping ${ITEM_LABEL} #${ITEM_NUMBER} — bot already responded after the triggering comment" >> "$LOGFILE"
            rm -f "$CLAIM_FILE"
            if [ -n "${EYES_REACTION_ID}" ] && [ -n "${COMMENT_URL}" ]; then
              gh api -X DELETE "${COMMENT_URL}/reactions/${EYES_REACTION_ID}" 2>/dev/null || true
            fi
            continue
          fi
        fi

        # Write a secondary claim keyed by comment ID hash so the mention-poll
        # fallback can detect this comment was already handled via notifications
        NOTIF_C_HASH=$(echo "${COMMENT_ID}" | md5sum | cut -c1-8)
        touch "$CLAIMS_DIR/claimed-gh-notif-${NOTIF_C_HASH}-mention-${ITEM_NUMBER}.txt" 2>/dev/null || true

        # Pass full comment context to the skill
        # Write comment body to a temp file to avoid shell quoting issues
        COMMENT_FILE="${LOCK_PREFIX}-comment-${NOTIF_ID}.txt"
        echo "$COMMENT_BODY" > "$COMMENT_FILE"

        # Wrap in subshell to remove 👀 on completion (like Slack ✅ pattern)
        # set +e so cleanup runs even if run-claude.sh exits non-zero
        (
          set +e
          PRIORITY=high "$BOT_SCRIPTS_DIR/run-claude.sh" "respond-github-${ITEM_NUMBER}" \
            "Use the /respond-github skill with these details:

${ITEM_LABEL}: #${ITEM_NUMBER}
Repo: ${REPO}
Comment ID: ${COMMENT_ID}
Comment Author: ${COMMENT_AUTHOR}
Comment Body:
$(cat "$COMMENT_FILE")

Respond to this specific comment on ${ITEM_LABEL} #${ITEM_NUMBER}. Use /respond-github ${ITEM_NUMBER} ${REPO} ${COMMENT_ID} ${COMMENT_AUTHOR}"

          # Remove 👀 on completion — the agent's reply is the real signal
          if [ -n "${EYES_REACTION_ID}" ] && [ -n "${COMMENT_URL}" ]; then
            gh api -X DELETE "${COMMENT_URL}/reactions/${EYES_REACTION_ID}" 2>/dev/null || true
          fi
        ) &

        # Clean up temp file after a delay (background process will have read the prompt)
        (sleep 5 && rm -f "$COMMENT_FILE") &
      else
        # Fallback: no comment URL or fetch failed — pass what we have
        (
          set +e
          PRIORITY=high "$BOT_SCRIPTS_DIR/run-claude.sh" "respond-github-${ITEM_NUMBER}" \
            "Use the /respond-github skill: /respond-github ${ITEM_NUMBER} ${REPO}

You were mentioned or someone commented on ${ITEM_LABEL} #${ITEM_NUMBER} in ${REPO}.
Title: ${SUBJECT_TITLE}
Could not fetch specific comment details. Check recent comments on the ${ITEM_LABEL}."

          # Remove 👀 on completion
          if [ -n "${EYES_REACTION_ID}" ] && [ -n "${COMMENT_URL}" ]; then
            gh api -X DELETE "${COMMENT_URL}/reactions/${EYES_REACTION_ID}" 2>/dev/null || true
          fi
        ) &
      fi
      ;;
    *)
      echo "[$(date)] Skipping notification $NOTIF_ID with reason=$REASON" >> "$LOGFILE"
      rm -f "$CLAIM_FILE"
      continue
      ;;
  esac

  # Mark notification as read
  gh api -X PATCH "/notifications/threads/$NOTIF_ID" 2>/dev/null || true
done
