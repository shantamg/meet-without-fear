# General PR (L1)

General-purpose issue-to-PR workspace. Read an issue, implement what it describes, create a PR. No triage, no selection — just execute.

## Modes

| Mode | Trigger | Entry Stage |
|---|---|---|
| Execute issue | Issue labeled `bot:pr` | `01-implement` |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `CLAUDE.md` | Stage 01 | Docs routing table to find relevant docs |
| `shared/skills/pr.md` | Stage 02 | PR creation conventions |
| `shared/references/github-ops.md` | Stage 02 | GitHub operations patterns |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` wholesale | Use docs routing table to load only relevant docs |
| Other workspace folders | Each invocation sees only its own workspace |
| `shared/diagnostics/` | No diagnostic work — implement what the issue says |
| `shared/slack/` | Output goes to GitHub, not Slack |

## Stage Progression

1. `01-implement` — Read issue, investigate relevant code/docs, implement changes, run tests
2. `02-pr` — Create branch, commit, push, create PR with issue linking (see `shared/skills/pr.md`)

## Orchestrator Rules

- One issue per invocation
- Work on a dedicated branch: `feat/<short-description>-<issue-number>`
- Run tests before creating PR
- If tests fail, fix before proceeding to PR stage
