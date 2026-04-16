# Docs Audit Workspace (L1)

Documentation drift detection. Two modes: incremental (git-history-aware, for nightly runs) and full (brute-force all docs).

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/slack/slack-post.md` | Always | Post summary to #bot-ops |
| `shared/skills/pr.md` | When fixes made | PR for doc updates |
| `CLAUDE.md` | Always | Docs routing table for mapping code to docs |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Docs audit doesn't check production |
| `shared/references/credentials.md` | No API access needed |
| Other workspaces | Irrelevant context |
| Full `docs/` | Agents load specific sections |

## Stage Selection

| Mode | Stage | Trigger |
|---|---|---|
| Incremental | `stages/incremental/` | `audit-docs` (nightly) |
| Full | `stages/full/` | `audit-docs-full` (weekly) |
