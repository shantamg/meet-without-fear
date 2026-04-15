# Stage: Merge or Tag

## State file — read from this, do not re-fetch

Stage 01 has already run `gh pr list --json ...` ONCE per cron cycle and written the full state of every open PR to:

**`/tmp/slam-bot/pr-reviewer-state.json`**

You **MUST** read PR metadata from this file. You **MUST NOT** run `gh pr view`, `gh pr list`, or `gh api repos/.../pulls/N` for any of the following fields, because they are already in the state file:

- `number`, `title`, `baseRefName`, `headRefName`, `author_login`
- `mergeable`, `mergeStateStatus`, `reviewDecision`
- `labels` (array of strings)
- `statusCheckRollup` (CI state per check)
- `updatedAt`

Re-fetching these via `gh` is a **strict violation** of the bot's GitHub API budget policy (see #1649).

At the start of this stage, source the helper and verify freshness:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
pr_reviewer_state_assert_fresh || exit 1

BASE_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" baseRefName)

# Guard: the state file's labels are the authoritative source for the
# bot:review-changes-needed check. No gh pr view needed.
if pr_reviewer_state_has_label "$PR_NUMBER" bot:review-changes-needed; then
  echo "PR #$PR_NUMBER still has bot:review-changes-needed — routing back to scan, NOT merging"
  exit 0
fi
```

### What you still need to fetch with `gh`

This stage legitimately needs a few things outside the state file. These are the **only** allowed `gh` calls:

- `gh pr view {N} --json comments --jq '... select(.body | test("Bot review")) ...'` — needed to verify the LAST bot review comment was LGTM (not Changes-needed). This is the safety check before tagging humans on a main-targeted PR.
- `gh pr merge {N}` — the actual merge for non-main targets
- `gh pr comment {N}` — post verification comment (non-main) or tag humans (main)
- `gh issue comment {X}` — post verification comment on the linked issue
- `gh pr edit {N} --remove-label` — ONLY the batched single edit at step 6

## Input

- PR number from scan work queue (classified as LGTM / ready to merge)
- `BASE_BRANCH` pulled from the state file above

## Process

### 1. Initialize the label accumulator and skip if another agent owns the PR

```bash
LABELS_TO_ADD=""
LABELS_TO_REMOVE=""

if pr_reviewer_state_has_label "$PR_NUMBER" bot:in-progress; then
  echo "PR #$PR_NUMBER already has bot:in-progress — another agent owns it, skipping"
  exit 0
fi
```

### 2. Claim the PR (the one early `gh pr edit` in this stage)

```bash
gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear --add-label "bot:in-progress"
LABELS_TO_REMOVE="bot:in-progress"   # flush at stage exit
```

### 3. Branch: merge non-main, tag humans for main

**`BASE_BRANCH` came from the state file — do not call `gh pr view --json baseRefName`.**

#### 3a. If `BASE_BRANCH` is NOT `main` (milestone or feature branch)

Squash-merge automatically:

```bash
gh pr merge "$PR_NUMBER" --repo shantamg/meet-without-fear --squash --delete-branch
```

Post a verification comment on the linked issue (do NOT close the issue — it stays open until a human verifies and adds `user-verified`):

```bash
gh issue comment "$ISSUE_NUMBER" --repo shantamg/meet-without-fear --body "$(cat <<EOF
## Fix merged

**PR**: #$PR_NUMBER
**What changed**: <summary of the PR>
**How to verify**: <steps or what to look for>

This issue will stay open until a human verifies the fix and adds the \`user-verified\` label.
EOF
)"
```

#### 3b. If `BASE_BRANCH` IS `main`

**Safety check: verify the LAST bot review comment is actually LGTM** (not "Changes needed"). The state file tells us `bot:review-changes-needed` is absent (checked at the top of this stage), but the label state and the most recent review comment can drift — double-check by fetching just the comments field:

```bash
LAST_BOT_REVIEW=$(gh pr view "$PR_NUMBER" --repo shantamg/meet-without-fear --json comments \
  --jq '[.comments[] |
    select(.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]") |
    select(.body | test("Bot review")) |
    .body
  ] | last')

if echo "$LAST_BOT_REVIEW" | grep -qi "Changes needed"; then
  echo "Safety check failed: last bot review on #$PR_NUMBER was 'Changes needed' — routing back to scan, NOT tagging humans"
  # Still flush the bot:in-progress removal so the claim is released
  gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear --remove-label "bot:in-progress"
  exit 0
fi
```

Only after both guards pass, tag humans for final review:

```bash
gh pr comment "$PR_NUMBER" --repo shantamg/meet-without-fear \
  --body "Bot review complete — LGTM. Ready for human review and merge. @shantamg @mengerink"
```

Add `bot:needs-human-review` to the accumulated label set:

```bash
LABELS_TO_ADD="bot:needs-human-review"
# LABELS_TO_REMOVE already contains bot:in-progress
```

### 4. Post-merge cleanup (non-main only)

- Comment on any downstream issues that were blocked by this PR

### 5. Flush label changes — batched single edit

**This is the rule.** All label adds and removes from this stage flush in **one** `gh pr edit` call at the very end:

```bash
if [ -n "$LABELS_TO_ADD" ] || [ -n "$LABELS_TO_REMOVE" ]; then
  gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear \
    ${LABELS_TO_ADD:+--add-label "$LABELS_TO_ADD"} \
    ${LABELS_TO_REMOVE:+--remove-label "$LABELS_TO_REMOVE"}
fi
```

Splitting add and remove into two calls doubles the GitHub API cost for no benefit.

### 6. Post-merge note for squash-merged branches

For non-main squash merges, `gh pr merge --delete-branch` already deletes the head branch, and the PR is CLOSED. Those PRs will NOT appear in the next tick's state file — nothing further to do.

For main-targeted PRs tagged for humans, the PR stays OPEN with `bot:needs-human-review` until a human acts. The next Stage 01 tick will see it with the new label set and skip it (rule: never re-tag a PR that's already in `bot:needs-human-review`).

## Output

- PR merged (non-main) OR humans tagged (main-targeted)
- `bot:in-progress` removed
- `bot:needs-human-review` added (main only)
- All label changes batched into ONE `gh pr edit` call

## Completion

Return to scan loop to process next PR in work queue. This is the final stage for each individual PR.
