# Daily Strategy — Workspace Context

## Purpose

Generate a proactive daily strategy briefing that tells the team what work is planned, what needs human input, and what the bot recommends picking up. Replaces the retrospective daily-digest with a forward-looking approach.

## Stage Pointers

- `stages/1-gather/CONTEXT.md` — Parallel sub-agent data collection
- `stages/2-strategize/CONTEXT.md` — Autonomy classification, composition, Slack posting

## Shared Resources Used

- `shared/references/credentials.md` — API credentials
- `shared/diagnostics/check-mixpanel.md` — Usage data
- `shared/diagnostics/check-sentry.md` — Error data
- `shared/diagnostics/render-logs.md` — Production errors
- `shared/references/github-ops.md` — GitHub query patterns
- `shared/slack/slack-post.md` — Post main message + thread reply
- `shared/references/slack-format.md` — mrkdwn formatting

## Key Conventions

- Post main message first, then details as thread reply
- Main message: forward-looking strategy (what's happening today)
- Thread reply: structured breakdown by autonomy tier, pipeline state, and retrospective data
- See `.claude/config/services.json` for #daily-summary channel ID
