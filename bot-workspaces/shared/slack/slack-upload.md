# Slack Upload Utility

Upload a file to a Slack channel using the two-step Slack file upload API.

## Credentials

Load `SLACK_BOT_TOKEN` from `/opt/slam-bot/.env`.

## Upload Flow

The Slack MCP tools cannot upload files. Use the Slack API directly via `curl`:

1. **Get upload URL**: `POST https://slack.com/api/files.getUploadURLExternal` with filename and length
2. **Upload file content**: `POST $UPLOAD_URL -F "file=@$FILE_PATH"`
3. **Complete upload**: `POST https://slack.com/api/files.completeUploadExternal` with file_id, channel_id, and optional initial_comment

Works for any file type: text, images, PDFs, audio, etc.
