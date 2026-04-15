# Milestone Conventions

Branch naming, PR format, and merge strategy for milestone-driven plans.

## Branch Naming

### Milestone branches

```
milestone/{plan-name}
```

Examples:
- `milestone/product-v2`
- `milestone/auth-rework`
- `milestone/health-scoring-redesign`

The `{plan-name}` is derived from the parent issue title: lowercase, hyphenated, stripped of special characters.

### Feature branches (off milestone)

```
feat/{description}-{issue-number}
```

Examples:
- `feat/scaffold-workspaces-585`
- `feat/label-dispatcher-596`
- `feat/project-orchestrator-601`

Feature branches are created from the milestone branch HEAD (not from `main`).

### Nested milestone branches (child plans)

When a sub-issue is itself a multi-issue plan:

```
milestone/{parent-plan}--{child-plan}
```

Examples:
- `milestone/product-v2--auth-rework`
- `milestone/product-v2--ui-refresh`

Child milestone branches are based off the parent milestone branch.

## PR Format

### Feature PR (targeting milestone branch)

**Title:** `{type}({area}): {description} (#{issue})`

Examples:
- `feat(workspaces): scaffold project-orchestrator workspace (#601)`
- `fix(dispatcher): handle missing label-registry entries (#603)`

**Body:**
```markdown
## Summary
<1-3 bullet points describing what was done>

## Test plan
- [ ] <testing checklist items>

Related to #{issue-number}
```

**Target branch:** `milestone/{plan-name}` (never `main`)

**Reviewers:** None (the project orchestrator reviews PRs directly in its monitor stage and runs a review-refine loop until the quality check passes)

### Milestone PR (targeting main)

**Title:** `feat: {plan-name} — milestone merge (#{parent-issue})`

Example:
- `feat: ICM workspace migration — milestone merge (#584)`

**Body:**
```markdown
## Summary
Merges the `milestone/{plan-name}` branch to `main`.

### Issues Closed
- #{N} — {title}
- #{M} — {title}
...

### PRs Merged
- PR #{P} — {title}
- PR #{Q} — {title}
...

### What Was Built
<2-5 bullet summary of the overall deliverable>

Related to #{parent-issue-number}
```

**Target branch:** `main`

**Reviewers:** `shantamg` (human review required)

## Merge Strategy

| PR type | Merge method | Review required |
|---|---|---|
| Feature -> milestone | Squash merge | Orchestrator quality check (no formal reviewer requested) |
| Milestone -> main | Merge commit | Human review required |

### Why squash for features?

Each feature PR becomes a single commit on the milestone branch. This keeps the milestone branch history clean — one commit per issue.

### Why merge commit for milestone?

Preserves the full commit history from the milestone branch. The human reviewer can see each squashed feature commit.

## Label Flow

```
Issue created
  |
  v
blocked      (has unresolved dependencies)
  |  OR
  v
bot:{workspace}  (all dependencies resolved, dispatched for build)
  |
  v
bot:pr       (PR created, under review)
  |
  v
open         (PR merged — issue stays open for human verification)
```

## Milestone Lifecycle

1. **Created** by Stage 01 (initialize) — branch pushed, plan.json written
2. **Active** during Stage 03 (monitor) — PRs merging, issues closing
3. **Complete** when all sub-issues are closed
4. **Finalized** by Stage 04 — milestone-to-main PR created
5. **Merged** by human — milestone branch deleted after merge
