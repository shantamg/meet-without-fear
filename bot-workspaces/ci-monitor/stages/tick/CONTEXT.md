# Stage: Tick (Loop Iteration)

## Input

- PR number from arguments
- If none: find latest open PR by bot (`gh pr list --state open --author @me`)

## Process

1. **Get PR status** (parallel):
   - `gh pr view <PR#> --json state,mergeable,mergeStateStatus,title,headRefName,isDraft`
   - `gh pr checks <PR#>`
2. **Route**:
   - Already merged/closed: report and STOP loop
   - Draft: report and STOP loop
   - All checks pass: proceed to merge
   - Checks pending: "Will check again in 5 minutes." CONTINUE loop
   - Any checks failed: proceed to diagnose

3. **Merge** (all checks pass):
   - `gh pr merge <PR#> --squash --delete-branch --admin` (fallback: without `--admin`)
   - Clean up worktree if applicable
   - STOP loop

4. **Diagnose failures**:
   - Get logs: `gh run view <RUN_ID> --log-failed`
   - Classify:
     - **FIXABLE**: lint, type errors, test failures with clear messages, build errors, missing deps
     - **NEEDS HUMAN**: flaky infra, secrets/creds needed, merge conflicts, same error after prior fix attempt
     - **UNFIXABLE**: 3+ failed attempts, opaque errors, CI config out of control
   - If NEEDS HUMAN or UNFIXABLE: report and STOP loop
   - If FIXABLE: create/enter worktree, make minimal fix, run check locally, commit, push. CONTINUE loop.

## Output

- Action taken (merged, fix pushed, stopped, waiting)
- Diagnosis details if failure

## Completion

This runs in a loop. Each tick either continues (pending/fixing) or stops (merged/closed/blocked).

On merge completion, no label swap needed.
