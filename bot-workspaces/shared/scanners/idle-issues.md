# Idle Issue Scanner

Detect high-priority issues that are idle, unblocked, or ready for work but not being acted on.

## Prerequisites

- GitHub CLI (`gh`) access

## Process

### 1. Find idle high-priority issues

```bash
# Issues with priority labels, no updates in >3 days
gh issue list --repo shantamg/meet-without-fear --state open --label "priority:high" \
  --json number,title,updatedAt,labels,assignees --limit 50

gh issue list --repo shantamg/meet-without-fear --state open --label "priority:critical" \
  --json number,title,updatedAt,labels,assignees --limit 50

gh issue list --repo shantamg/meet-without-fear --state open --label "bug" \
  --json number,title,updatedAt,labels,assignees --limit 50

gh issue list --repo shantamg/meet-without-fear --state open --label "security" \
  --json number,title,updatedAt,labels,assignees --limit 20
```

Filter to issues where `updatedAt` is more than 3 days ago.

### 2. Find unblocked issues

Issues where the `blocked` label was recently removed (now ready for work):

```bash
# Recently updated issues that no longer have blocked label
gh issue list --repo shantamg/meet-without-fear --state open \
  --json number,title,updatedAt,labels --limit 100 \
  | jq '[.[] | select(.updatedAt > "'$(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%SZ)'" and ([.labels[].name] | index("blocked") | not) and ([.labels[].name] | any(startswith("bot:"))))]'
```

### 3. Find issues with all dependencies resolved

For issues with `<!-- blocked-by: X,Y -->` metadata:
- Check if all referenced blocking issues are closed
- If all blockers are resolved but the issue still has `blocked` label, flag it

### 4. Find high-interest community issues

```bash
# Issues with reactions or many comments (signals community interest)
gh issue list --repo shantamg/meet-without-fear --state open \
  --json number,title,comments,reactionGroups --limit 50 \
  | jq '[.[] | select((.comments > 5) or ([.reactionGroups[].users.totalCount] | add > 3))]'
```

### 5. Rank and classify

| Priority | Criteria | Autonomy Tier |
|---|---|---|
| Critical | `priority:critical` idle >1 day | `proceed` |
| High | `priority:high` idle >3 days, all blockers resolved | `proceed` |
| High | `bug` idle >3 days with clear repro steps | `proceed` |
| Medium | `security` idle >3 days | `proceed` |
| Medium | Recently unblocked with `bot:*` label | `proceed` |
| Low | High-interest feature requests | `suggestion` |

## Output Format

```
## Idle Issue Findings

**Status:** [clean | issues-found]
**Items found:** N

### Items
1. **#N: [Issue title]** — [severity: critical/high/medium/low]
   - Priority: [label]
   - Idle since: [date]
   - Blockers: [all resolved | N open]
   - Suggested action: [apply bot:investigate | apply bot:pr | apply bot:research | escalate to human]
   - Autonomy tier: [proceed | proceed | suggestion]
```
