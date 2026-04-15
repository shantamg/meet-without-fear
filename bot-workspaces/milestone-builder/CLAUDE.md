# Milestone Builder (L1)

Execute structured milestone plans end-to-end: create milestone branch, dispatch agents wave by wave, review and merge PRs to the milestone branch, produce a final milestone→main PR when done.

## Modes

Determine the current mode by checking the parent issue comments for a `<!-- milestone-initialized -->` marker:

| Condition | Mode | Entry Stage |
|---|---|---|
| No `<!-- milestone-initialized -->` comment found | First run — initialize | `01-initialize` |
| `<!-- milestone-initialized -->` comment exists | Monitoring — check progress | `02-monitor` |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/milestone-conventions.md` | Stages 01, 03 | Branch naming, PR format, merge strategy |
| `shared/dependency-parser.md` | Stages 01, 02 | Parse blocked-by metadata from sub-issues |
| `shared/review-conventions.md` | Stage 02 | Quality check criteria for PR reviews |
| `shared/references/github-ops.md` (root) | Stages 01, 02 | GitHub label and issue operations |
| `shared/skills/pr.md` (root) | Stage 03 | PR creation for milestone→main |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Sub-agents handle code; orchestrator manages workflow only |
| `docs/` | Not needed for milestone orchestration |
| `shared/diagnostics/` | No diagnostic work involved |
| `shared/slack/` | Output goes to GitHub, not Slack |
| Other workspace stage files | Each invocation sees only its own workspace |

## Stage Progression

1. `01-initialize` — Read parent issue, create milestone branch, validate plan structure
2. `02-monitor` — Tick loop: promote blocked→ready, review PRs, merge to milestone branch, check completion
3. `03-finalize` — All sub-issues closed → create milestone→main PR, tag humans for review

## Orchestrator Rules

- One milestone per invocation
- Max 3 concurrent agents per tick (respects dispatcher concurrency)
- Max 3 review/fix cycles per PR before flagging for human help
- PRs targeting milestone branch: bot reviews and merges autonomously (squash)
- PRs targeting main: bot creates, tags humans, does NOT merge
