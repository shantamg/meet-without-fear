# Stale Sweeper Workspace (L1)

Process stale GitHub issues and PRs. The cron script pre-triages items and tells each what action to take.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/github-ops.md` | Always | Issue/PR patterns |
| `shared/slack/slack-post.md` | Stage 2 | Summary to #bot-ops (`$BOT_OPS_CHANNEL_ID`) |
| `shared/skills/pr.md` | Stage 2 (if fixing) | PR creation for fixes |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Stale sweeper doesn't investigate production |
| `docs/` | Only load if a stale item references docs |
| Other workspaces | Irrelevant context |

## Stage Progression

1. `1-identify` — Query GitHub for stale items
2. `2-process` — Act on each item, post summary
