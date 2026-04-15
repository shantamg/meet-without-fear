# Evaluation Criteria

Decision framework for the do-later review. Applied in Stage 02 for each deferred issue.

## Priority Rules (applied in order)

1. **Security/compliance issues**: Always recommend **reopen**, regardless of age or context change. These should not remain deferred indefinitely. Suggested label: `bot:bug-fix` or `bot:expert-review` depending on complexity.

2. **Significant related code changes**: If files or modules mentioned in the issue have had meaningful commits since deferral, recommend **reopen**. The context has shifted and the issue may now be actionable or already partially addressed.

3. **Related issues resolved**: If cross-referenced issues (`#NNN`) have been closed, recommend **reopen**. The blocking condition may be cleared.

4. **Stale with no context change**: If the issue is older than 6 months and none of the above apply, recommend **close** as wontfix. Long-deferred items with no new context are unlikely to be acted on.

5. **Default**: If none of the above apply, recommend **keep**. The issue is still validly deferred.

## Determining the Target Label (for reopens)

| Issue Category | Suggested Label |
|---|---|
| `bug` | `bot:bug-fix` |
| `security` | `bot:bug-fix` |
| `enhancement` | `bot:expert-review` |
| `research` | `bot:expert-review` |
| `uncategorized` | `bot:expert-review` |

## What Counts as "Significant" Code Changes

- More than 5 commits touching mentioned files
- Any refactor or deletion of mentioned code paths
- New features in the same module/service
- Migration changes affecting mentioned tables/models

## What Does NOT Count

- Formatting-only changes (lint, whitespace)
- Documentation updates
- Unrelated test additions
- Dependency bumps
