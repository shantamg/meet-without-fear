# Slack Triage -- Workspace Context

## Purpose

Monitor #pmf1 for actionable messages and triage them. Classify each message as BUG, FEATURE, QUESTION, FEEDBACK, or OBSERVATION, then dispatch the appropriate action (investigate, create issue, answer, or react).

## Stage Pointers

- `stages/1-fetch-and-classify/CONTEXT.md` -- Fetch messages from Slack, scan for images, filter noise, classify each message
- `stages/2-dispatch/CONTEXT.md` -- Act on classified messages: reply, create issues, investigate bugs, react to observations

## Reference Material

- `references/classification-guide.md` -- Classification criteria with concrete examples for each type
- `references/response-templates.md` -- Response patterns and templates per message type

## Shared Resources Used

| Resource | Purpose |
|---|---|
| `shared/references/slack-format.md` | Slack mrkdwn syntax rules -- `*bold*`, `<url\|text>`, `\u2022` bullets |
| `shared/slack/slack-post.md` | Post thread replies via `slack-post.sh` |
| `shared/github/create-issue.md` | Issue creation with dedup, provenance, cross-referencing |
| `shared/github/attach-image.md` | Upload Slack screenshots to GitHub issues |
| `shared/references/github-ops.md` | Clickable link format, label taxonomy, duplicate checks |
| `shared/references/credentials.md` | Credential fallback chain (env -> bot .env -> app .env) |

## Key Configuration

| Key | Value | Source |
|---|---|---|
| #pmf1 channel ID | `C0A3FF86FB7` | `.claude/config/services.json` |
| Bot user ID | `U0ALQHDUVSM` | `.claude/config/services.json` |
| GitHub repo | `shantamg/meet-without-fear` | `.claude/config/services.json` |
| Image scan token | `SLACK_MCP_XOXB_TOKEN` | Environment variable |

## Key Conventions

- Always reply in threads, never as new channel messages
- Skip bot messages (user ID `U0ALQHDUVSM`), reactions-only, "ok"/"thanks", and messages already replied to by the bot
- Slack MCP cannot see file attachments -- always scan with `scripts/slack-get-images.mjs` in parallel with message fetch
- Images from Slack messages get uploaded to GitHub issues via `shared/github/attach-image.md`
- Use Slack mrkdwn syntax, NOT standard Markdown
- All GitHub links in Slack use clickable format: `<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>`
