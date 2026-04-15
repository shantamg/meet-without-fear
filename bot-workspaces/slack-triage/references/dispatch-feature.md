# Dispatch: FEATURE

**Goal:** Track the request as a GitHub issue with `bot:pr` label so the general-pr workspace can implement it.

## Steps

1. **Check for duplicates:**
   ```bash
   gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
   ```

2. **If duplicate exists:** Reply with link to existing issue. Do not create a new one.

3. **If new:** Create issue with `bot:pr` label:
   ```bash
   gh issue create --repo shantamg/meet-without-fear \
     --title "<concise feature description, <80 chars>" \
     --body "<feature details + provenance block>" \
     --label "enhancement,bot:pr"
   ```

   Body format:
   ```
   ## Feature Request

   <What was requested, context on why>

   ## Provenance

   - **Channel**: <channel name>
   - **Requester**: <user name>
   - **Original message**: <quoted message text>
   - **Timestamp**: <Slack message ts>
   ```

   - Download and attach images if present

4. **Reply in thread** with issue link. See `references/response-templates.md`.

5. **Write tracker file** (after reply):
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/write-tracker.sh \
     --channel "$CHANNEL_ID" \
     --thread-ts "$THREAD_TS" \
     --linked-issue "$ISSUE_NUMBER" \
     --bot-reply-ts "$BOT_REPLY_TS" \
     --human-message "$HUMAN_MESSAGE" \
     --bot-reply "$BOT_REPLY_TEXT" \
     --skip-if-no-artifact \
     || true
   ```
