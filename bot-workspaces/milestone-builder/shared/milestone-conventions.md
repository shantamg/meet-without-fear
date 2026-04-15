# Milestone Conventions

Branch naming, PR format, and merge strategy for milestone-driven plans.

## Branch Naming

### Milestone branches

```
milestone/{plan-name}
```

The `{plan-name}` is derived from the parent issue title: lowercase, hyphenated, stripped of special characters.

Examples: `milestone/auth-rework`, `milestone/health-scoring-redesign`

### Feature branches (off milestone)

```
feat/{description}-{issue-number}
```

Feature branches are created from the milestone branch HEAD (not from `main`).

Examples: `feat/scaffold-workspaces-585`, `feat/label-dispatcher-596`

## PR Format

### Feature PR (targeting milestone branch)

**Title:** `{type}({area}): {description} (#{issue})`
**Target:** `milestone/{plan-name}` (never `main`)
**Reviewers:** None (milestone-builder reviews and merges autonomously)

**Body:**
```markdown
## Summary
<1-3 bullet points>

## Test plan
- [ ] <checklist>

Related to #{issue-number}
```

### Milestone PR (targeting main)

**Title:** `feat: {plan-name} — milestone merge (#{parent-issue})`
**Target:** `main`
**Reviewers:** `shantamg`

**Body:**
```markdown
## Summary
Merges the `milestone/{plan-name}` branch to `main`.

### Issues Closed
- #{N} — {title}

### PRs Merged
- PR #{P} — {title}

### What Was Built
<2-5 bullet summary>

Related to #{parent-issue-number}
```

## Merge Strategy

| PR type | Merge method | Review required |
|---|---|---|
| Feature → milestone | Squash merge | Bot quality check only |
| Milestone → main | Merge commit | Human review required |

## Label Flow

```
Issue created → blocked (has unresolved deps) OR bot:{workspace} (no deps, dispatched)
  → bot:pr (PR created) → open (PR merged — stays open for human verification)
```
