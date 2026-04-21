# Daily Strategy Workspace (L1)

Generate a twice-daily "Most Important Thing" strategy briefing posted to #most-important-thing. Each briefing leads with a single highest-priority item, clearly marks what needs team input vs. what the bot will handle autonomously, and re-presents unanswered items until the team responds.

Runs at 7 AM ET and 7 PM ET. Morning sets the day's plan; evening checks in on progress and tees up tomorrow.

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
| `shared/github/create-issue.md` | Strategy reports, doesn't create issues (except deferral comments) |
| `shared/skills/pr.md` | No code changes |
| Other workspaces | Irrelevant context |

## Stage Progression

1. `1-gather` — Parallel sub-agents collect data from all sources + check previous briefing responses
2. `2-strategize` — Lead with Most Important Thing, classify by autonomy tier, handle deferrals, post to Slack

## Response Loop

The workspace implements a persistent response loop with a *consensus requirement*:

1. **Post** — Each briefing presents items and asks for input
2. **Check** — Next run checks the previous briefing's thread for responses
3. **Require consensus** — Both Shantam and Darryl must agree before an item proceeds or is deferred. A single response is not enough; partial responses carry forward with a note about who has weighed in
4. **Carry forward** — Unanswered or partially-answered items re-appear at the top of the next briefing
5. **Surface disagreements** — If one wants to proceed and the other wants to defer, present both perspectives and ask them to align
6. **Document deferrals** — When *both* agree to defer with a reason, the bot records that reason as a comment on the GitHub issue and removes the item from re-presentation

## Orchestrator Rules

- Single-pass: gather data, compose, post, exit
- Cron-triggered (twice daily): no label swap needed at completion
- If all data sources fail, post a short "Strategy briefing failed to gather data. Check bot logs." message and exit
