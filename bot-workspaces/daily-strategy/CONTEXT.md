# Daily Strategy — Workspace Context

## Purpose

Generate a twice-daily strategy briefing posted to two channels: a short "Most Important Thing" in #most-important-thing (one item + rationale + response prompt) and a comprehensive daily summary in #daily-summary (full breakdown). Re-presents unanswered items until the team responds. Runs at 7 AM PT and 7 PM PT.

## Stage Pointers

- `stages/1-gather/CONTEXT.md` — Parallel sub-agent data collection + previous briefing response check
- `stages/2-strategize/CONTEXT.md` — Most Important Thing selection, autonomy classification, deferral handling, Slack posting

## Shared Resources Used

- `shared/references/credentials.md` — API credentials
- `shared/diagnostics/check-mixpanel.md` — Usage data
- `shared/diagnostics/check-sentry.md` — Error data
- `shared/diagnostics/render-logs.md` — Production errors
- `shared/references/github-ops.md` — GitHub query patterns
- `shared/slack/slack-post.md` — Post messages + thread replies to both channels
- `shared/references/slack-format.md` — mrkdwn formatting

## Key Conventions

- **#most-important-thing**: Short message (one item + rationale + link), thread reply is just a response prompt
- **#daily-summary**: Comprehensive briefing (Most Important Thing + Proceeding + Suggestion + Pipeline), thread reply has full retrospective and scanner results
- Re-present unanswered items from the previous briefing at the top
- When team defers an item with a reason, comment on the GitHub issue and stop re-presenting it
- See `.claude/config/services.json` for channel IDs
