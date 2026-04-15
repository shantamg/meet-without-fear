# Stage: Report

## Input

- Evaluated issue list from Stage 02 (issues with recommendations and rationale)
- Slack channel: `#bot-ops`
- `shared/references/github-ops.md` -- label operations
- `shared/slack/slack-post.md` -- posting patterns

## Process

1. **Build the Slack summary message**:
   - Header: "Do-Later Review -- [month/year]"
   - Stats line: total reviewed, reopen count, keep count, close count
   - Table grouped by recommendation:
     - Reopen: issue link, title, rationale, target label
     - Close: issue link, title, rationale
     - Keep: issue link, title, rationale
   - Use Slack mrkdwn formatting

2. **Apply label changes for "reopen" recommendations**:
   - Remove `do-later` label
   - Add the recommended `bot:*` label (e.g., `bot:bug-fix`, `bot:expert-review`)
   - This triggers the target workspace to pick up the issue

3. **Apply changes for "close" recommendations**:
   - Add `wontfix` label
   - Close the issue with a comment: "Closed by monthly do-later review -- no longer relevant."

4. **Apply changes for "keep" recommendations**:
   - Add a comment: "Reviewed [date] -- keeping deferred. Next review next month."

5. **Post the summary to Slack** (`#bot-ops`)

## Output

- Slack summary posted to #bot-ops
- Label changes applied to reopened/closed issues
- Comments added to kept issues

## Completion

This is the final stage. No label swap needed (cron-triggered).
