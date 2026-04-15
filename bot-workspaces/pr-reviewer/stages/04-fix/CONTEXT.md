# Stage: Fix

## State file — read from this, do not re-fetch

Stage 01 has already run `gh pr list --json ...` ONCE per cron cycle and written the full state of every open PR to:

**`/tmp/slam-bot/pr-reviewer-state.json`**

You **MUST** read PR metadata from this file. You **MUST NOT** run `gh pr view`, `gh pr list`, or `gh api repos/.../pulls/N` for any of the following fields, because they are already in the state file:

- `number`, `title`, `baseRefName`, `headRefName`, `author_login`
- `mergeable`, `mergeStateStatus`, `reviewDecision`
- `labels` (array of strings)
- `statusCheckRollup` (CI state per check — each entry has `{name, state}`)
- `updatedAt`

Re-fetching these via `gh` is a **strict violation** of the bot's GitHub API budget policy (see #1649).

At the start of this stage, source the helper and verify freshness:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
pr_reviewer_state_assert_fresh || exit 1

HEAD_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" headRefName)
BASE_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" baseRefName)

# Extract failing checks from the state file — no gh pr checks needed for
# the NAMES of failing checks; you still need `gh run view` for log details.
FAILING_CHECKS=$(jq -r --arg n "$PR_NUMBER" \
  '.prs[$n].statusCheckRollup[] | select(.state == "FAILURE") | .name' \
  "$PR_REVIEWER_STATE_FILE")
```

### What you still need to fetch with `gh`

This stage legitimately needs things outside the state file. These are the **only** allowed `gh` calls:

- `gh pr checks {N}` — **only** if you need the check URLs or conclusion details beyond `{name, state}` (which are already in the state file). Prefer inspecting `$FAILING_CHECKS` from the state file first.
- `gh run view {run_id} --log` — read the log for a specific failing run
- `gh pr view {N} --json comments --jq '... select(.body | test("Bot review")) ...'` — **only** if the review feedback is needed and isn't otherwise available (you should have received it via the dispatch context if this is a review-feedback fix)
- `gh pr comment {N}` — on exhaustion (3rd fix cycle)
- `gh pr edit {N} --add-label / --remove-label` — ONLY the batched single edit at step 7

## Input

- PR number from scan work queue (classified as failing checks OR `bot:review-changes-needed`)
- Review comment or CI check output

## Process

### 1. Initialize label accumulators and skip if another agent owns the PR

```bash
LABELS_TO_ADD=""
LABELS_TO_REMOVE=""

if pr_reviewer_state_has_label "$PR_NUMBER" bot:in-progress; then
  echo "PR #$PR_NUMBER already has bot:in-progress — another agent owns it, skipping"
  exit 0
fi
```

### 2. Claim the PR (early `gh pr edit` — the one exception)

```bash
gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear --add-label "bot:in-progress"
LABELS_TO_REMOVE="bot:in-progress"  # will flush at stage exit
```

### 3. Determine fix type

- **Failing checks**: you already have `$FAILING_CHECKS` from the state file read at the top. For log details, call `gh run view` on specific runs.
- **Review feedback**: read the last "Bot review" comment from the PR (see the allowed `gh pr view` pattern in the header).

### 4. Checkout the PR branch

`HEAD_BRANCH` came from the state file; **do not re-fetch it via `gh pr view`**:

```bash
git fetch origin
git worktree add "../fix-pr-$PR_NUMBER" "origin/$HEAD_BRANCH"
cd "../fix-pr-$PR_NUMBER"
```

### 5. Diagnose and fix

- Lint/type errors: apply automated fixes
- Test failures: read test output, fix assertions or code
- Review feedback: address each item from the review comment
- **Doc drift fixes**: if the review comment mentions missing doc updates:
  1. Read `docs/code-to-docs-mapping.json` to identify which docs correspond to the changed code
  2. For each flagged doc, read it and identify sections that describe the code that was changed in this PR
  3. Read the actual code changes (`git diff main...HEAD` for the relevant files)
  4. Update the doc content to accurately reflect the new code behavior
  5. Set the `updated` frontmatter field to today's date

### 6. Commit and push

```bash
git add -A
git commit -m "fix: address review feedback / CI failures"
git push origin "$HEAD_BRANCH"
```

Then clean up the worktree:

```bash
cd -
git worktree remove "../fix-pr-$PR_NUMBER"
```

### 7. Build the label change set and flush

After pushing fixes, the label changes are:

- Remove `bot:in-progress` (already in `LABELS_TO_REMOVE`)
- Remove `bot:review-changes-needed`
- Add `bot:needs-review` (re-triggers Stage 03 re-review on next tick)

```bash
LABELS_TO_REMOVE="bot:in-progress,bot:review-changes-needed"
LABELS_TO_ADD="bot:needs-review"
```

**Batched flush — this is the rule. One `gh pr edit`, not two:**

```bash
if [ -n "$LABELS_TO_ADD" ] || [ -n "$LABELS_TO_REMOVE" ]; then
  gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear \
    ${LABELS_TO_ADD:+--add-label "$LABELS_TO_ADD"} \
    ${LABELS_TO_REMOVE:+--remove-label "$LABELS_TO_REMOVE"}
fi
```

Splitting add and remove into two calls doubles the GitHub API cost for no benefit.

### 8. Track fix attempts — exhaust after 3

If this is the 3rd fix cycle for this PR, do NOT continue re-looping. Instead:

- Post a comment requesting human help (`gh pr comment`)
- Use this label set instead of the one in step 7:
  ```bash
  LABELS_TO_REMOVE="bot:in-progress,bot:review-changes-needed"
  LABELS_TO_ADD="bot:needs-human-review"
  ```
- Flush via the same batched `gh pr edit` call

## Output

- Fixed code pushed to PR branch + `bot:review-changes-needed` removed + `bot:in-progress` removed + `bot:needs-review` added (batched into one edit)
- OR: comment requesting human help + `bot:needs-human-review` applied + `bot:in-progress` removed (3rd attempt)

## Completion

Return to scan loop. PR will be re-classified on next tick:

- If fix was pushed → re-review in Stage 03
- If human help requested → humans take over
