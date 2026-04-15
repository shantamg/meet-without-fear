# Brainstorm Workspace (L1)

Digest a brainstorm session transcript into a structured GitHub issue with sub-issues for action items.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/github/create-issue.md` | Both stages | Issue creation |
| `shared/references/github-ops.md` | Both stages | Duplicate checks, labeling |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Brainstorm is analytical, not diagnostic |
| `shared/slack/` | Output goes to GitHub issues |
| repo root source code | Not needed for brainstorm processing |
| Other workspaces | Irrelevant context |

## Stage Progression

1. `1-digest` — Extract themes, decisions, open questions from transcript
2. `2-create-issues` — Create parent issue + sub-issues for action items
