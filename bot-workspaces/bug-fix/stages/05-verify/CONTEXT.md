# Stage 05: Verify

## Input

- Code changes committed on feature branch (from Stage 04)
- Test strategy from the fix plan

## Process

### 1. Run tests

```bash
cd && pnpm test
```

This runs all tests across the monorepo (vitest for backend, jest-expo for mobile).

If tests fail:
- Read the failure output carefully
- Fix the issue (could be in the fix itself or in the test)
- Re-run until all tests pass
- Commit the fix with a clear message

### 2. Run type checks

```bash
cd && pnpm check
```

This runs TypeScript type checking across all packages. Fix any type errors introduced by the change.

### 3. Verify the fix addresses the original issue

Re-read the issue description and confirm:
- The root cause identified in Stage 02 is addressed
- The fix handles edge cases noted in the plan
- No regressions were introduced (test suite passes)

### 4. Push the branch

```bash
git push -u origin <branch-name>
```

## Output

- All tests passing
- Type checks clean
- Branch pushed to remote
- Ready for PR creation

## Failure Handling

| Failure | Action |
|---|---|
| Test failure in changed code | Fix the implementation or test, recommit |
| Test failure in unrelated code | Note it in the PR body as a pre-existing issue |
| Type error in changed code | Fix the type issue, recommit |
| Type error in unrelated code | Note it in the PR body |

## Exit Criteria

- `pnpm test` passes (exit code 0)
- `pnpm check` passes (exit code 0)
- Branch pushed to remote

## Completion

Proceed to `stages/06-pr/` to create the pull request.
