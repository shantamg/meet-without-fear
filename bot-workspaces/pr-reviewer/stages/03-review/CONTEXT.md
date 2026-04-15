# Stage: Review

## State file — read from this, do not re-fetch

Stage 01 has already run `gh pr list --json ...` ONCE per cron cycle and written the full state of every open PR to:

**`/tmp/slam-bot/pr-reviewer-state.json`**

You **MUST** read PR metadata from this file. You **MUST NOT** run `gh pr view`, `gh pr list`, or `gh api repos/.../pulls/N` for any of the following fields, because they are already in the state file:

- `number`, `title`, `baseRefName`, `headRefName`, `author_login`
- `mergeable`, `mergeStateStatus`, `reviewDecision`
- `labels` (array of strings)
- `statusCheckRollup` (CI state per check)
- `updatedAt`

Re-fetching these via `gh` is a **strict violation** of the bot's GitHub API budget policy and is the primary cause of the rate-limit exhaustion incidents tracked in #1649. Do not do it.

At the start of this stage, source the helper and verify freshness:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
pr_reviewer_state_assert_fresh || exit 1

# Pull the fields this stage needs out of the state file.
TITLE=$(pr_reviewer_state_field "$PR_NUMBER" title)
BASE_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" baseRefName)
```

### What you still need to fetch with `gh`

This stage does legitimately need a few things that are NOT in the state file. These are the **only** allowed `gh` calls in this stage:

- `gh pr diff {N}` — the actual file diff (too large to prefetch)
- `gh pr view {N} --json comments` — needed to find the PR's prior "Bot review" comment (if any) and detect re-review. Use `--jq` to filter to just the bot's comments; do not fetch unrelated fields.
- `gh issue view {X}` — the linked issue referenced in the PR body (`Fixes #X`)
- `gh issue list --search ...` — related-work research for the review (limited use)
- `gh pr comment {N}` — post your review
- `gh pr edit {N} --add-label / --remove-label` — ONLY the batched single edit at step 10

Anything beyond this list is a bug — the scan stage already has what you need.

## Input

- PR number from scan work queue (classified as unreviewed or re-review after new commits)
- `references/review-checklist.md` — quality criteria

## Process

### 1. Initialize the label accumulators

```bash
LABELS_TO_ADD=""
LABELS_TO_REMOVE=""
```

### 2. Skip if another agent owns the PR

Check the state file — no API call needed:

```bash
if pr_reviewer_state_has_label "$PR_NUMBER" bot:in-progress; then
  echo "PR #$PR_NUMBER already has bot:in-progress — another agent owns it, skipping"
  exit 0
fi
```

### 3. Claim the PR (the only early `gh pr edit` in this stage)

The claim has to land before the review work, so concurrent ticks see it and skip:

```bash
gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear --add-label "bot:in-progress"
LABELS_TO_REMOVE="bot:in-progress"   # will flush at stage exit
```

### 4. Check for prior bot reviews (re-review detection)

Match **both** the legacy identity (`MwfBot`) and the new GitHub App bot-user (`mwf-bot-app[bot]`) — historical comments stay attributed to the old identity:

```bash
PRIOR_REVIEWS=$(gh pr view "$PR_NUMBER" --repo shantamg/meet-without-fear --json comments \
  --jq '[.comments[] |
    select(.author.login == "MwfBot" or .author.login == "mwf-bot-app[bot]") |
    select(.body | test("Bot review")) |
    {body, createdAt}
  ]')
```

If `$PRIOR_REVIEWS` contains an entry with "Changes needed", capture the list of prior items so you can check each one against the new commits.

### 5. Read the full diff

```bash
gh pr diff "$PR_NUMBER" --repo shantamg/meet-without-fear
```

### 6. Read the linked issue (from PR body `Fixes #X` or `Closes #X`)

```bash
gh issue view "$ISSUE_NUMBER" --repo shantamg/meet-without-fear
```

### 7. Gather context (related-work research)

```bash
# Placeholders: substitute real values for the ALL_CAPS vars below.
#   KEYWORDS:      space-separated terms from PR title + touched filenames
#   CHANGED_FILES: space-separated file paths from `gh pr diff` / `git diff`

# Search issues for related bugs or prior work in this area
gh issue list --repo shantamg/meet-without-fear --search "$KEYWORDS" --state all --limit 10 --json number,title,state

# Search vector memory for related code patterns and issues
/opt/slam-bot/scripts/memory/search.sh --code "$KEYWORDS"
/opt/slam-bot/scripts/memory/search.sh --collections "issues" "$KEYWORDS"

# Check recent file history for churn/regressions
git log --since="2 weeks ago" --oneline -- $CHANGED_FILES
```

Use this context to catch re-introduced bugs, conflicts with recent changes, or missed patterns.

### 8. Quality check against the review checklist

- Correctness: does the code do what the issue asks?
- Completeness: are all requirements addressed?
- Convention compliance: follows project patterns?
- No security issues (injection, leaked secrets, etc.)
- No accidental file changes (unrelated diffs)
- Tests present if behavior changed
- **Doc drift check**: look for a "Doc Impact Check" comment from `github-actions[bot]` on the PR. If one exists with ❌ entries, the PR changes code in areas with corresponding docs that were NOT updated. Include each missing doc update as a "Changes needed" item. If no Doc Impact Check comment exists (GitHub Action may not have run), check the PR diff directly against `docs/code-to-docs-mapping.json`.

### 9. Re-review handling

If this is a re-review (prior "Changes needed" exists):

- Check each item from the prior review against the new commits
- Only LGTM if ALL prior feedback items have been addressed
- If items remain unaddressed, post "Changes still needed" listing what's outstanding

### 10. Post the review comment and build the label change set

Post the review as a comment — this is separate from the batched label edit:

```bash
gh pr comment "$PR_NUMBER" --repo shantamg/meet-without-fear --body "$REVIEW_BODY"
```

Then build the complete label change set for the stage. **Always**:

- Add `bot:reviewed`
- Remove `bot:in-progress` (already in `LABELS_TO_REMOVE` from step 3)
- Remove `bot:needs-review` (trigger consumed)

**If LGTM**:

- Also remove `bot:review-changes-needed` (might be lingering from a prior cycle)

**If Changes needed**:

- Also add `bot:review-changes-needed` — this signals the self-correction loop to Stage 04. Do **NOT** add `bot:needs-human-review`; that's Stage 05's exclusive responsibility.

```bash
# Always-applied changes
LABELS_TO_ADD="bot:reviewed"
LABELS_TO_REMOVE="bot:in-progress,bot:needs-review"

# Outcome-dependent additions
if [ "$REVIEW_OUTCOME" = "LGTM" ]; then
  LABELS_TO_REMOVE="$LABELS_TO_REMOVE,bot:review-changes-needed"
elif [ "$REVIEW_OUTCOME" = "CHANGES_NEEDED" ]; then
  LABELS_TO_ADD="$LABELS_TO_ADD,bot:review-changes-needed"
fi
```

### 11. Flush label changes — batched single edit

**This is the rule.** Every label add and remove from this stage flushes in **one** `gh pr edit` call:

```bash
if [ -n "$LABELS_TO_ADD" ] || [ -n "$LABELS_TO_REMOVE" ]; then
  gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear \
    ${LABELS_TO_ADD:+--add-label "$LABELS_TO_ADD"} \
    ${LABELS_TO_REMOVE:+--remove-label "$LABELS_TO_REMOVE"}
fi
```

Splitting add and remove into two calls doubles the GitHub API cost for no benefit.

## Output

- Review comment posted on PR
- `bot:reviewed` applied; `bot:in-progress` and `bot:needs-review` removed
- `bot:review-changes-needed` applied (if changes needed) or removed (if LGTM)

## Completion

Return to scan loop.

- **LGTM PRs** route to Stage 05 on next tick
- **Changes-needed PRs** route to Stage 04 on next tick (self-correction loop); do NOT route changes-needed PRs to Stage 05 in the same pass
