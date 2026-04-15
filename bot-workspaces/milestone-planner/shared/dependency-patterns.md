# Dependency Patterns

Common dependency patterns for milestone sequencing.

## Dependency Types

### Hard Dependencies (track these)
- **Data model first**: schema changes must merge before code that uses new fields
- **API before consumer**: backend endpoints before frontend that calls them
- **Foundation before feature**: shared utilities/types before features that import them
- **Infrastructure before application**: config/deploy changes before code that relies on them

### Soft Dependencies (do NOT track)
- "It would be nice to do X first" — not a real blocker
- Code review preference — reviewers can handle any order
- Documentation — can be written in parallel with implementation

## Wave Patterns

### Linear Chain
```
A → B → C → D
```
Each issue depends on the previous. Slowest pattern — minimize chains.

### Fan-Out
```
A → B
A → C
A → D
```
One foundation issue unblocks multiple parallel issues. Common and efficient.

### Fan-In
```
B → D
C → D
```
Multiple issues must complete before integration. Use for final validation/integration steps.

### Diamond
```
A → B → D
A → C → D
```
Combination of fan-out and fan-in. Common for "build foundation, implement features in parallel, integrate."

## Expressing Dependencies

Use HTML comments in issue bodies for machine-readable tracking:
```markdown
<!-- blocked-by: 101,102 -->
```

The milestone-builder reads these comments to determine when to unblock issues.

## Anti-Patterns

- **Artificial chains**: don't create sequential dependencies when work can be parallel
- **Hidden dependencies**: if issue B reads from a table that issue A creates, that's a hard dependency — make it explicit
- **Circular dependencies**: if A needs B and B needs A, merge them into one issue or refactor the boundary
