# Dispatch: BUG

**Goal:** Create a GitHub issue with `bot:investigate` label so the bug-fix workspace handles it visibly.

## Steps

1. **Download images** (if `has_images`):
   ```bash
   SLACK_MCP_XOXB_TOKEN="$SLACK_MCP_XOXB_TOKEN" node scripts/slack-get-images.mjs C0A3FF86FB7 --ts <message_ts>
   ```
   View downloaded images from `/tmp/slack-images/` with the Read tool.

2. **Check for duplicates:**
   ```bash
   gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
   ```

3. **If duplicate exists:** Reply with link to existing issue. Do not create a new one.

4. **If new:** Do a quick lightweight triage (30 seconds max) before creating the issue:
   - Scan the codebase for the relevant file/function if the reporter mentioned one
   - Note any obvious leads — but do NOT attempt a fix or deep investigation
   - Do NOT check Sentry, Render logs, Mixpanel, or run diagnostics — those belong in the `bot:investigate` workspace. Write "No immediate leads — needs full investigation" if nothing is obvious from the codebase.
   - Do NOT use `gh api` for anything — triage creates issues, it does not investigate (see API budget policy in workspace CLAUDE.md)

   Create issue with `bot:investigate` label:
   ```bash
   gh issue create --repo shantamg/meet-without-fear \
     --title "<concise bug description, <80 chars>" \
     --body "<bug details + initial findings + provenance block>" \
     --label "bug,bot:investigate"
   ```

   Body format:
   ```
   ## Bug Report

   <What's broken, error messages, steps to reproduce if known>

   ## What We Know So Far

   <Brief initial findings from quick triage — Sentry errors, relevant code areas, similar past issues. Keep this to 2-3 bullet points. If nothing found, write "No immediate leads — needs full investigation.">

   ## Provenance

   - **Channel**: <channel name>
   - **Reporter**: <user name>
   - **Original message**: <quoted message text>
   - **Timestamp**: <Slack message ts>
   ```

   - Attach images if present via `shared/github/attach-image.md`

5. **Reply in thread:**
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel CHANNEL_ID \
     --text "Got it — tracking this here: <ISSUE_URL|Issue #N>. Investigating now." \
     --thread-ts "MESSAGE_THREAD_TS"
   ```
   See `references/response-templates.md` for BUG reply templates.

6. **Write tracker file** (after reply):
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

## Do NOT

- Attempt to fix the bug inline. The bug-fix workspace (`bot:investigate`) will handle investigation and fixes with full audit trail.
- Create issues without the `bot:investigate` label — unlabeled issues won't be dispatched.
