# Stage: Evaluate

## Input

- Scan manifest from Stage 01 (categorized, sorted do-later issues)
- `shared/evaluation-criteria.md` -- decision framework

## Process

For each issue in the scan manifest:

1. **Check for related code changes** since the issue was deferred:
   - Search issue body for file paths or function names
   - Run `git log --oneline --since="<issue-updated-date>"` on mentioned files
   - Flag if significant changes detected

2. **Check for related issue activity**:
   - Look for cross-references in the issue body (e.g., `#123`)
   - Check if referenced issues have been closed or resolved
   - Flag if related work completed

3. **Apply priority rules** (from evaluation-criteria.md):
   - Security/compliance issues: always recommend re-evaluation
   - Issues older than 6 months with no context change: recommend close
   - Issues with significant related changes: recommend reopen
   - Otherwise: recommend keep

4. **Assign recommendation**: one of:
   - **reopen** -- Context has changed, issue should be acted on. Include suggested `bot:*` label.
   - **keep** -- Still deferred, no context change. Note review date.
   - **close** -- Stale, no longer relevant. Recommend `wontfix`.

5. **Write a one-line rationale** for each recommendation.

## Output

Evaluated issue list: each issue from the scan manifest now has a recommendation (reopen/keep/close) with rationale and suggested label (for reopens).

## Completion

Proceed to `stages/03-report/` with the evaluated issue list.
