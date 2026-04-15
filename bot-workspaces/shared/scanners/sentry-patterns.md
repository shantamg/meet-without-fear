# Sentry Error Pattern Scanner

Detect actionable error patterns from Sentry that warrant bot action.

## Prerequisites

- Load `shared/references/credentials.md` for Sentry API access
- Load `shared/diagnostics/check-sentry.md` for query patterns

## Process

### 1. Fetch recent Sentry issues

Query the Peter App Sentry project for issues from the last 24 hours:

```bash
# Get unresolved issues sorted by frequency
curl -s -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&statsPeriod=24h" \
  | jq '.[] | {id: .id, title: .title, count: .count, firstSeen: .firstSeen, lastSeen: .lastSeen, level: .level}'
```

### 2. Classify each issue

| Pattern | Classification | Autonomy Tier |
|---|---|---|
| Recurring error (3+ occurrences in 24h) | High frequency — needs investigation | `proceed` |
| New error type (first seen in last 24h) | New regression — may be from recent deploy | `proceed` if correlates with recent merge, else `suggestion` |
| Error spike (10x normal frequency) | Urgent — possible production incident | `proceed` |
| Known/expected errors (rate limiting, etc.) | Noise — skip | — |

### 3. Correlate with recent deploys

```bash
# Check recent commits on main
git log --oneline -10 --since="24 hours ago" -- repo root 
```

For each new error:
- Match the error's stack trace file paths against recently changed files
- If a match is found, flag as "likely introduced by commit <hash>"
- Suggest `bot:investigate` label on a new issue

### 4. Check for existing issues

Before recommending action, check if an issue already exists for this error:

```bash
gh issue list --repo shantamg/meet-without-fear --search "<error title keywords>" --state open --limit 5
```

Skip errors that already have open issues.

## Output Format

```
## Sentry Error Findings

**Status:** [clean | issues-found]
**Items found:** N

### Items
1. **[Error title]** — [severity: based on frequency and level]
   - Frequency: N occurrences in 24h
   - First seen: [timestamp]
   - Correlation: [linked to commit X | no correlation found]
   - Existing issue: [#N | none]
   - Suggested action: [create issue with bot:investigate | monitor | escalate]
   - Autonomy tier: [proceed | proceed | suggestion]
```
