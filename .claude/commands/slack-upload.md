# Slack Upload

Upload a file to a Slack channel using the two-step Slack file upload API.

## Arguments

`$ARGUMENTS` — The file path and target channel. Examples:
- `/tmp/voice-message.mp3 to C07RXLX1VLX`
- `/tmp/screenshot.png to C0AM2J47R4L with "Here's the screenshot"`

## Upload flow

The Slack MCP tools cannot upload files. Use the Slack API directly via `curl` and the `SLACK_BOT_TOKEN`.

```bash
source /opt/slam-bot/.env

# Step 1: Get upload URL
FILENAME=$(basename "$FILE_PATH")
UPLOAD=$(curl -s -X POST "https://slack.com/api/files.getUploadURLExternal" \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/x-www-form-urlencoded" \
  -d "filename=$FILENAME&length=$(wc -c < "$FILE_PATH")")

UPLOAD_URL=$(echo "$UPLOAD" | jq -r '.upload_url')
FILE_ID=$(echo "$UPLOAD" | jq -r '.file_id')

# Step 2: Upload the file content
curl -s -X POST "$UPLOAD_URL" -F "file=@$FILE_PATH"

# Step 3: Complete the upload (attach to channel)
curl -s -X POST "https://slack.com/api/files.completeUploadExternal" \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json" \
  -d "{\"files\": [{\"id\": \"$FILE_ID\"}], \"channel_id\": \"TARGET_CHANNEL_ID\", \"initial_comment\": \"OPTIONAL_COMMENT\"}"
```

Replace `FILE_PATH`, `TARGET_CHANNEL_ID`, and `OPTIONAL_COMMENT` with actual values from `$ARGUMENTS`.

This works for any file type — text, images, PDFs, audio, etc.

## Output

Confirm the file was uploaded with the channel and filename.
