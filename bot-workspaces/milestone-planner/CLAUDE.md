# Milestone Planner (L1)

Take unstructured input (brainstorm digest, issue list, feature description) and produce a structured milestone plan with sub-issues, dependency graph, labels, and sequencing.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/decomposition-guide.md` | Stage 02 | Right-sizing rules for sub-issues |
| `shared/dependency-patterns.md` | Stage 03 | Common dependency DAG patterns |
| `shared/references/github-ops.md` | Stage 04 | GitHub issue creation and labeling |
| `shared/github/create-issue.md` | Stage 04 | Issue creation patterns |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Planner operates on issues, not app code |
| `docs/` | Not needed for planning |
| `shared/diagnostics/` | No diagnostic work involved |
| `shared/slack/` | Output goes to GitHub, not Slack |
| Other workspace stage files | Only reference workspace CLAUDE.md for label lookup |

## Stage Progression

1. `01-gather` — Read input issue and referenced issues, identify full scope
2. `02-decompose` — Break scope into discrete, right-sized sub-issues
3. `03-sequence` — Build dependency graph and identify parallel waves
4. `04-publish` — Create sub-issues on GitHub, update parent issue with plan

## Orchestrator Rules

- One milestone plan per invocation (no batching)
- All sub-issues must be independently buildable by a single agent
- Right size = one PR, one workspace, clear success criteria
- On completion, `bot:milestone-planner` is removed — human reviews the plan and adds `bot:milestone-builder` when ready
