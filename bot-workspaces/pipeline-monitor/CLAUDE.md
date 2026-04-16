# Pipeline Monitor (L1)

Autonomous watcher that monitors active milestone-builder pipelines for failures and stalled work. Runs periodically via cron with session continuity (`--resume`), giving it memory of prior checks within the same milestone.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/tick/CONTEXT.md` | Always | Monitor checklist |
| `shared/references/github-ops.md` (root) | Always | GitHub label and issue operations |
| `shared/slack/slack-post.md` (root) | Always | Slack notification to #bot-ops for auto-graduations (checks 7-9) |
| `shared/references/slack-format.md` (root) | Always | Slack message formatting conventions |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Monitor doesn't touch code — only reads GitHub state |
| `docs/` | Not needed for monitoring |
| `shared/diagnostics/` | No production debugging |
| Other workspace stage files | Irrelevant — monitor operates independently |

## Stage Progression

1. `tick` — Single stage, re-entered every cron cycle via `--resume`

## Orchestrator Rules

- One milestone per invocation (session key = `monitor-milestone-{issue}`)
- **Read-only analysis** — check labels, PRs, issue states. Self-heal label issues.
- **Never merge PRs or dispatch agents** — that's the milestone-builder's job
- **Never create worktrees** — runs with `--no-worktree`
- Self-heal: fix wrong labels, promote stalled waves, clean stale `bot:in-progress`
- Response detection: re-trigger interview workspaces when humans respond to bot questions
- Auto-graduate: add `bot:verify` on approved PRs, re-trigger milestones when all sub-issues close
- Slack notify: post to #bot-ops (`$BOT_OPS_CHANNEL_ID`) when auto-graduating (checks 7-9)
- Escalate: comment tagging humans for issues that can't be auto-fixed
- Session continuity: remembers what it checked and fixed on prior ticks
