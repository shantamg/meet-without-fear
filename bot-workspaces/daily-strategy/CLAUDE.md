# Daily Strategy Workspace (L1)

Generate a proactive daily strategy briefing with prioritized recommendations and autonomy-tiered actions, posted to #daily-summary.

Replaces the retrospective daily-digest with a forward-looking plan: what work to proceed with, what to start soon, and what to suggest.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/credentials.md` | Always | API access |
| `shared/diagnostics/check-mixpanel.md` | Stage 1 | Usage patterns |
| `shared/diagnostics/check-sentry.md` | Stage 1 | Error summary |
| `shared/diagnostics/render-logs.md` | Stage 1 | Production errors |
| `shared/references/github-ops.md` | Stage 1 | Issue/PR query patterns |
| `shared/scanners/sentry-patterns.md` | Stage 1 | Proactive error pattern detection |
| `shared/scanners/mixpanel-friction.md` | Stage 1 | User friction detection |
| `shared/scanners/idle-issues.md` | Stage 1 | Idle high-priority issue detection |
| `shared/scanners/code-health.md` | Stage 1 | Technical debt scanning |
| `shared/slack/slack-post.md` | Stage 2 | Post strategy message |
| `shared/references/slack-format.md` | Stage 2 | Message formatting |

## What NOT to Load

| Resource | Why |
|---|---|
| repo source code | Strategy gathers data, doesn't touch code |
| `shared/github/create-issue.md` | Strategy reports, doesn't create issues |
| `shared/skills/pr.md` | No code changes |
| Other workspaces | Irrelevant context |

## Stage Progression

1. `1-gather` — Parallel sub-agents collect data from all sources
2. `2-strategize` — Classify work by autonomy tier, compose strategy, post to Slack

## Orchestrator Rules

- Single-pass: gather data, compose, post, exit
- Cron-triggered: no label swap needed at completion
- If all data sources fail, post a short "Strategy briefing failed to gather data. Check bot logs." message and exit
