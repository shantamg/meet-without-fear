# Slack Format

Standard formatting rules for posting messages to Slack. This is a reusable reference — other skills should follow these rules when composing Slack messages.

**Do not invoke this skill directly** — it documents the formatting conventions that Slack-posting skills must follow.

## API parameters

- Always use `content_type: "text/plain"` (NOT `text/markdown`)
- Slack uses its own **mrkdwn** syntax, not standard Markdown

## Syntax reference

| Element | Slack mrkdwn | NOT this |
|---------|-------------|----------|
| Bold | `*bold*` | `**bold**` |
| Italic | `_italic_` | `*italic*` |
| Strikethrough | `~strike~` | `~~strike~~` |
| Code | `` `code` `` | same |
| Code block | ` ```code``` ` | same |
| Link | `<https://url\|display text>` | `[text](url)` |
| Bullet | `•` (U+2022) | `-` or `*` |
| User mention | `<@U12345>` | `@username` |
| Channel mention | `<#C12345>` | `#channel` |

## Newline handling

The `text` parameter must contain **literal `\n` characters** between every line:
- Each bullet point → its own line (`\n`)
- Each section header → its own line (`\n`)
- Section separators → blank line (`\n\n`)

## Structure conventions

- Use `*bold*` for section headers
- Use `•` for bullet points, each on its own line
- Separate sections with a blank line (`\n\n`)
- Keep each bullet to one line — no wrapping
- Use `<url|display text>` for links
- Only include sections that have content — skip empty sections

## Example

A correctly formatted `text` parameter:
```
*📊 Details*\n\n*GitHub*\n• PRs merged: <https://github.com/shantamg/meet-without-fear/pull/217|#217> daily digest skill\n• PRs opened: none\n• Commits: 5 on main\n\n*📱 App Usage*\n• Active users: 4\n• Total events: 312
```

## Channel IDs

See `.claude/config/services.json` for channel ID constants. Always use the channel ID (e.g., `C0AMGACJN9E`), not the channel name.

## Posting pattern

Use `/slack-post` for all Slack posting. It enforces the formatting rules above and calls `slack-post.sh` under the hood. MCP `mcp__slack__conversations_add_message` is available as a fallback only.

**Do not call `slack-post.sh` directly** — always go through `/slack-post` so formatting is applied consistently.

## Safety

- Never post sensitive data (env vars, tokens, DB contents, connection strings) in Slack
- Keep messages concise — Slack truncates long messages
