# Stage: Sequence

## Input

- `output/issues.md` from Stage 02
- `shared/dependency-patterns.md` — common dependency patterns

## Process

1. **Read issues document** and dependency patterns guide

2. **Build dependency graph**: for each sub-issue, determine:
   - What other sub-issues must complete before this one can start?
   - Is this dependency hard (code depends on it) or soft (nice-to-have ordering)?
   - Only track hard dependencies

3. **Identify waves** (groups of issues that can run in parallel):
   - **Wave 1**: issues with no dependencies (can start immediately)
   - **Wave 2**: issues that depend only on Wave 1 items
   - **Wave N**: issues that depend only on items in earlier waves
   - Within each wave, all issues can run in parallel

4. **Validate the DAG**:
   - No circular dependencies
   - Every issue appears in exactly one wave
   - Wave 1 is not empty (there must be a starting point)
   - Critical path is reasonable (not artificially long chains)

5. **Write dependency graph** to `output/dependency-graph.md`:
   - DAG as a list: each issue with its `blocked-by` references
   - Wave breakdown: which issues are in each wave
   - Critical path: longest chain from start to finish

## Output

`output/dependency-graph.md` — dependency DAG with wave breakdown.

## Completion

Proceed to `stages/04-publish/` with the dependency graph.
