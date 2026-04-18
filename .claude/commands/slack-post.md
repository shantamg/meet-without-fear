# Slack Post

Post a message to Slack with correct formatting. This is the single entry point for all Slack posting — other commands delegate here instead of calling `slack-post.sh` directly.

**Do not call `slack-post.sh` directly from other commands.** Use `/slack-post` instead.

## Arguments

`$ARGUMENTS` — A structured posting request. Extract from the calling context:
- **channel** (required) — Channel ID (e.g., `C0AMGACJN9E`). See `.claude/config/services.json` for channel ID constants.
- **text** (required) — The message content to post.
- **thread-ts** (optional) — Thread timestamp for posting a reply.

## Step 1: Format the message

Before posting, transform the message text to comply with `/slack-format` rules:

1. **Bold**: Use `*bold*` (NOT `**bold**`)
2. **Italic**: Use `_italic_` (NOT `*italic*`)
3. **Bullets**: Use `•` (U+2022), NOT `-` or `*`
4. **Links**: Use `<url|display text>` (NOT `[text](url)`)
5. **Newlines**: Ensure each bullet, header, and section break is on its own line
6. **Section headers**: Use `*bold*` text on its own line
7. **Section separators**: Use a blank line between sections
8. **No Markdown**: No `##` headers, no `**bold**`, no `[links](url)` — Slack mrkdwn only
9. **User/channel mentions**: Use `<@U12345>` and `<#C12345>` format
10. **Safety**: Never include sensitive data (env vars, tokens, DB contents, connection strings)

## Step 2: Post the message

```bash
# Simple message
${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh --channel "$CHANNEL" --text "$FORMATTED_TEXT"

# Thread reply
${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh --channel "$CHANNEL" --text "$FORMATTED_TEXT" --thread-ts "$THREAD_TS"
```

Capture the returned message timestamp — it can be used for thread replies.

## Step 3: Return the result

Output the message timestamp so the calling command can use it for thread replies:

```
THREAD_TS=<returned timestamp>
```

## Common mistakes to avoid

- Using GitHub Markdown (`**bold**`, `- bullets`, `[links](url)`) instead of Slack mrkdwn
- Forgetting newlines between bullet points (they'll run together)
- Using channel names instead of channel IDs
- Posting sensitive data
