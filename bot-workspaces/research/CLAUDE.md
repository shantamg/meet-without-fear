# Research Workspace (L1)

Deep-research workspace that investigates a GitHub issue before it enters the build pipeline. Fans out parallel sub-agents (codebase, web, internal) to gather context, synthesizes findings into a structured issue comment, then graduates the issue to the next workspace.

## Modes

Determine the current stage from the meta tag in the latest bot comment. If no meta tag exists, this is a fresh issue -- start at `01-gather`.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/github-ops.md` | Stage 01, 03 | Issue reading, label operations |
| `CLAUDE.md` | Stage 01 | Docs routing table for codebase research |
| `docs/` (specific docs) | Stage 01 | Relevant architecture docs identified during codebase research |
| `shared/references/slack-format.md` | Stage 02 | Formatting conventions for issue comments |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code wholesale | Sub-agents in Stage 01 search targeted files only |
| `shared/diagnostics/` | No production investigation -- this is pre-build research |
| `shared/slack/` | Output goes to GitHub, not Slack |
| `shared/skills/pr.md` | No PR created in this workspace |
| Other workspace stage files | Only read current stage CONTEXT.md |

## Stage Progression

1. `01-gather` -- Read the issue, fan out parallel sub-agents for codebase research, web research, and internal research
2. `02-synthesize` -- Compile findings into a structured research comment posted on the issue
3. `03-graduate` -- Swap label from `bot:research` to the appropriate downstream workspace

## Orchestrator Rules

- Single-pass: each stage runs once (no re-entry loop)
- State tracking: HTML comment metadata in issue comments (`<!-- bot:research-meta: {...} -->`)
- One issue per invocation (no batching)
- Sub-agents in Stage 01 run in parallel, not sequentially
- If the issue already has a research comment from a prior run, skip to `03-graduate`
