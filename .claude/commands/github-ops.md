# GitHub Ops

Standard patterns for GitHub issue and PR operations. This is a reusable reference — other skills should follow these patterns.

**Do not invoke this skill directly** — it documents the shared GitHub workflows that other skills use.

## Configuration

See `.claude/config/services.json` for repo, reviewer, and user-mapping constants.

- **Repo**: `shantamg/meet-without-fear`
- **PR reviewers**: `shantamg` (always added to PRs)
- **Issue assignees**: context-dependent — see "Issue assignment rules" below

## Duplicate check

Before creating any issue, always check for duplicates:

```bash
gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
```

- Search for key terms from the issue title
- Check both open and recently closed issues
- If a matching open issue exists, comment on it instead of creating a new one

## Issue assignment rules

**Default: NO dev assignees.** Bot-generated issues (from health checks, security audits, automated scans) must NOT assign or tag `shantamg`. The daily strategy and bot's own issue scanning surface work — devs don't need individual pings.

**Exception — explicit requests:** If a human directly asks for an issue via Slack DM or channel message, assign the issue to the **requester**. Check the `[PROVENANCE]` block for the requester identity, then look up their GitHub username in `.claude/config/services.json` → `github.slack_to_github_users`.

### How to determine assignees

```
1. Check if [PROVENANCE] block exists and has a requester
2. Look up the requester's Slack user ID in services.json → github.slack_to_github_users
3. If found:
   → Assign to that user (they explicitly asked for this)
4. If no provenance or requester not in mapping:
   → Do NOT add --assignee flag (bot-generated work)
```

## Issue creation

```bash
gh issue create --repo shantamg/meet-without-fear \
  --title "TITLE" \
  --body "$(cat <<'EOF'
## Description
[description]

## Evidence
- **Source**: [Sentry link / log excerpt / Mixpanel data]
- **Impact**: [users/sessions affected]
- **Time window**: [when it occurred]

## Suggested fix
[proposed solution or "TBD"]

---
Investigated by Claude Agent
EOF
)" \
  --label LABEL
```

**Note:** The `--assignee` flag is intentionally omitted from the template. Only add it when the assignment rules above indicate a specific assignee.

### Labels

| Issue type | Label |
|-----------|-------|
| Bug | `bug` |
| Feature request | `enhancement` |
| Ops / infrastructure | `infrastructure` |
| User feedback | `feedback` |

## Cross-referencing

When creating a related issue, comment on the existing one:
```bash
gh issue comment EXISTING_ISSUE --repo shantamg/meet-without-fear --body "Related: #NEW_ISSUE — [brief description]"
```

## Issue search

```bash
gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
```

## PR comment replies

- **Issue comments** (conversation tab):
  ```bash
  gh api repos/shantamg/meet-without-fear/issues/<number>/comments -f body="..."
  ```
- **Review comments** (inline on diff):
  ```bash
  gh api repos/shantamg/meet-without-fear/pulls/<number>/comments/<comment_id>/replies -f body="..."
  ```

## Thresholds for auto-creating issues

Used by health-check and investigate skills:

| Condition | Create issue? |
|-----------|--------------|
| Sentry error with >5 events or >1 user | Yes |
| Error correlating with user activity drops | Yes |
| Log noise repeating >50 times in 24h | Yes |
| Pipeline failure (started but not completed) | Yes |
| Performance degradation (>5s, throttling) | Yes |
| Single-occurrence transient error | No |
| Known/already-tracked issue | No |
| Expected operational noise | No |
