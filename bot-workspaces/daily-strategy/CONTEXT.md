# Daily Strategy — Workspace Context

## Purpose

Generate a twice-daily "Most Important Thing" strategy briefing that leads with the single highest-priority item, tells the team what needs their input vs. what the bot will handle, and re-presents unanswered items until the team responds. Runs at 7 AM ET and 7 PM ET.

## Stage Pointers

- `stages/1-gather/CONTEXT.md` — Parallel sub-agent data collection + previous briefing response check
- `stages/2-strategize/CONTEXT.md` — Most Important Thing selection, autonomy classification, deferral handling, Slack posting

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
- Main message: lead with *The Most Important Thing*, then other items by autonomy tier
- Thread reply: structured breakdown with retrospective data and scanner results
- Re-present unanswered items from the previous briefing at the top
- When team defers an item with a reason, comment on the GitHub issue and stop re-presenting it
- See `.claude/config/services.json` for #daily-summary channel ID
