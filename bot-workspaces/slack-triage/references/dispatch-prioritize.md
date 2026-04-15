# Dispatch: PRIORITIZE

**Goal:** Find the referenced issue or PR and apply the `high-priority` label so reviewers can quickly identify urgent items.

No issue creation — this is about escalating existing work, not creating new work.

## Steps

1. **Extract the reference** from the message:
   - Explicit PR/issue number: `#123`, `PR #123`, `issue #123`
   - Description-based: search for matching open issues/PRs by keyword
   - ⚡ (`:zap:`) emoji reaction or text: treat as a priority signal — look for an issue/PR reference in the same message or parent thread

2. **Find the item on GitHub:**

   If an explicit number is given:
   ```bash
   gh issue view NUMBER --repo shantamg/meet-without-fear --json number,title,state,labels,url 2>/dev/null || \
   gh pr view NUMBER --repo shantamg/meet-without-fear --json number,title,state,labels,url
   ```

   If searching by description:
   ```bash
   gh issue list --repo shantamg/meet-without-fear --state open --search "SEARCH_TERM" --limit 5 --json number,title,url
   gh pr list --repo shantamg/meet-without-fear --state open --search "SEARCH_TERM" --limit 5 --json number,title,url
   ```

   If multiple matches are found, pick the best match based on the message context. If ambiguous, reply asking for clarification.

3. **Check if already labeled:**
   - If the item already has `high-priority`, reply confirming it's already flagged
   - Skip to the reply step

4. **Apply the label:**
   ```bash
   gh issue edit NUMBER --repo shantamg/meet-without-fear --add-label "high-priority"
   ```
   Note: `gh issue edit` works for both issues and PRs.

5. **Reply in Slack thread** confirming the label was applied:
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel CHANNEL_ID \
     --text "Done — flagged as high-priority: <ITEM_URL|#N TITLE>" \
     --thread-ts "MESSAGE_THREAD_TS"
   ```
   See `references/response-templates.md` for PRIORITIZE reply templates.

## Do NOT

- Create new issues. PRIORITIZE is about escalating existing items.
- Apply the label to closed/merged items. If the item is closed, reply saying so.
- Guess when ambiguous. If the message doesn't reference a specific item and search returns no clear match, ask for clarification.
