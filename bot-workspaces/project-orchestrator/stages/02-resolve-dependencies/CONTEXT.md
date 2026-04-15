# Stage 02: Resolve Dependencies

## Input

- `plan.json` from Stage 01 (sub-issue list with numbers and state)
- `shared/dependency-parser.md` for parsing rules

## Process

1. **Parse dependencies for each sub-issue**: For every sub-issue in plan.json, extract dependency metadata using the rules and priority order in `shared/dependency-parser.md` (machine-readable comments, inline body references, sub-issue list annotations).

2. **Build dependency graph (DAG)**: Construct a directed acyclic graph. Each node is a sub-issue number; edges point from dependency to dependent.

   Validate the graph:
   - No cycles (if found, log warning and break the cycle at the highest-numbered edge)
   - All dependency targets exist in the sub-issue list or are already closed

3. **Identify Wave 1**: Sub-issues with no unresolved dependencies (all deps are either closed or not in the plan). These are immediately buildable.

4. **Label sub-issues**:
   - Wave 1 (no blockers): add their `bot:{workspace}` dispatch label
   - All others: add `blocked` label

5. **Write dependency-graph.json**: Save the full DAG for Stage 03. Schema:

```json
{
  "parent_issue": 700,
  "milestone_branch": "milestone/health-scoring-redesign",
  "graph": {
    "585": {
      "title": "...",
      "depends_on": [],
      "depended_by": [588],
      "state": "OPEN",
      "label": "ready"
    }
  },
  "waves": { "1": [585], "2": [588] }
}
```

All sub-issues labeled on GitHub (`bot:{workspace}` dispatch label or `blocked`).

## Exit Criteria

- dependency-graph.json written with all sub-issues
- Every sub-issue has either a `bot:{workspace}` dispatch label or `blocked` label
- At least one sub-issue is ready for dispatch (otherwise the plan is stuck)
- No unresolvable cycles in the DAG

## Completion

Proceed to `stages/03-monitor/` with dependency-graph.json.

If zero issues are ready (all have unresolved dependencies), halt and comment on the parent issue:
```
Dependency resolution failed: all sub-issues have unresolved dependencies, creating a deadlock. Please review the dependency graph and break at least one cycle.
```
