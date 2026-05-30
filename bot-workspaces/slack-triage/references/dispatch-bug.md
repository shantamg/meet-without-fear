# Dispatch: BUG

**Goal:** Capture the bug as a GitHub issue labeled `bug` and STOP. Triage does **not** start an investigation or a fix. A human decides when code runs by applying a `bot:*` trigger label (`bot:investigate` for a full investigation, `bot:pr` to implement) after reviewing the issue.

## Steps

1. **Download images** (if `has_images`):
   Use the curl-based approach from workspace CLAUDE.md "Image Handling" section (uses `SLACK_BOT_TOKEN`).
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

   Create the issue labeled `bug` only (no trigger label — a human starts the work):
   ```bash
   gh issue create --repo shantamg/meet-without-fear \
     --title "<concise bug description, <80 chars>" \
     --body "<bug details + initial findings + provenance block>" \
     --label "bug"
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
     --text "Got it — filed <ISSUE_URL|Issue #N>. We'll pick it up when it's prioritized." \
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

- Attempt to fix the bug inline. Investigation and fixes happen later, only after a human applies a `bot:*` trigger label.
- Apply a `bot:*` trigger label (`bot:investigate`, `bot:pr`) at triage. Capture stops at a `bug`-labeled issue; the human gate decides what runs.
