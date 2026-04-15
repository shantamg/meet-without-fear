# Slack Post Utility

Single entry point for all Slack message posting. All workspaces delegate here instead of calling `slack-post.sh` directly.

## Parameters

- **channel** (required) — Channel ID from `.claude/config/services.json`
- **text** (required) — Message content
- **thread-ts** (optional) — Thread timestamp for replies

## Workflow

1. **Format the message** per `shared/references/slack-format.md`:
   - Bold: `*bold*` (not `**bold**`)
   - Bullets: `•` (not `-`)
   - Links: `<url|text>` (not `[text](url)`)
   - Newlines between every bullet and section
   - No Markdown headers, no `**bold**`
2. **Post**:
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh --channel "$CHANNEL" --text "$TEXT"
   # Thread reply:
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh --channel "$CHANNEL" --text "$TEXT" --thread-ts "$THREAD_TS"
   ```
3. **Return** the message timestamp for thread replies

## Safety

Never include sensitive data (env vars, tokens, DB contents, connection strings).
