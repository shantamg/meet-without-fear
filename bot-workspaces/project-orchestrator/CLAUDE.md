# Project Orchestrator Workspace (L1)

Autonomously execute multi-issue plans end-to-end: create milestone branch, resolve dependency graph, label sub-issues for dispatch, review and merge PRs, promote blocked work, and produce a final milestone-to-main PR.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/dependency-parser.md` | Stage 02 | Dependency metadata parsing rules |
| `shared/review-conventions.md` | Stage 03 | PR quality-check criteria |
| `shared/milestone-conventions.md` | Stages 01, 03, 04 | Branch naming, PR format |
| `shared/github/create-issue.md` | Stage 03 | Issue commenting |
| `shared/skills/pr.md` | Stage 04 | Final milestone PR creation |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Sub-agents load code; orchestrator manages issues/PRs |
| `docs/` | Sub-agents consult docs; orchestrator does not |
| Other workspaces | Irrelevant context |
| `shared/diagnostics/` | Orchestrator does not investigate bugs |
| `shared/slack/` | Communicates via GitHub issues/PRs, not Slack |

## Stage Progression

1. `01-initialize` — Read parent issue, create milestone branch, write plan.json
2. `02-resolve-dependencies` — Parse blocked-by metadata, build DAG, label first wave
3. `03-monitor` — Tick loop: promote, review, merge, spawn builds, notify downstream
4. `04-finalize` — All done: create milestone-to-main PR, write summary

## Orchestrator Rules

- All PRs target the milestone branch (never `main`)
- Milestone branch PRs do NOT require formal GitHub reviews — quality check then merge
- Maximum 3 sub-agents per tick (PR fixes + new builds combined)
- Each sub-agent uses `isolation: "worktree"`
- Sub-agents branch off the milestone branch
- Maximum 3 review cycles per PR before flagging for human attention
- On completion, the final milestone-to-main PR requires human review
