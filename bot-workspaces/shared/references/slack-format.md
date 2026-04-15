# Slack Formatting Rules

Standard formatting conventions for all Slack messages. Referenced by slack-post and any workspace that posts to Slack.

## API Parameters

- Always use `content_type: "text/plain"` (NOT `text/markdown`)
- Slack uses its own **mrkdwn** syntax, not standard Markdown

## Syntax Reference

| Element | Slack mrkdwn | NOT this |
|---|---|---|
| Bold | `*bold*` | `**bold**` |
| Italic | `_italic_` | `*italic*` |
| Strikethrough | `~strike~` | `~~strike~~` |
| Link | `<https://url\|display text>` | `[text](url)` |
| Bullet | `•` (U+2022) | `-` or `*` |
| User mention | `<@U12345>` | `@username` |
| Channel mention | `<#C12345>` | `#channel` |

## Structure Conventions

- Use `*bold*` for section headers
- Use `•` for bullet points, each on its own line
- Separate sections with a blank line (`\n\n`)
- Keep each bullet to one line
- Use `<url|display text>` for links
- Only include sections that have content

## Channel IDs

See `.claude/config/services.json` for channel ID constants. Always use channel IDs, not names.

## Safety

- Never post sensitive data (env vars, tokens, DB contents, connection strings)
- Keep messages concise — Slack truncates long messages
