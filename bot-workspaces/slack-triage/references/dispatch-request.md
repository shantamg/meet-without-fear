# Dispatch: REQUEST

**Goal:** Create a GitHub issue with the appropriate `bot:*` label so the workspace dispatcher handles the work visibly.

Slack is an intake channel — real work happens through GitHub issues and workspace dispatch. This ensures every request has an audit trail: issue, label, workspace, PR.

## Steps

1. **Determine the `bot:*` label** based on what was requested:

   | Request type | Label | Workspace it triggers |
   |---|---|---|
   | Architecture/system review, analysis, deep dive | `bot:expert-review` | expert-review |
   | Bug investigation, "why is X broken" | `bot:investigate` | bug-fix (investigate stage) |
   | Build/implement a feature or change | `bot:pr` | general-pr |
   | Brainstorm, ideation, strategy | `bot:brainstorm` | brainstorm |
   | Security audit/review | `bot:security-audit` | security-audit |
   | Documentation audit/update | `bot:docs-audit` | docs-audit |
   | Create/modify a workspace | `bot:workspace-builder` | workspace-builder |
   | Deploy preparation | `bot:deploy` | deploy |
   | General task (doesn't fit above) | `bot:pr` | general-pr (default) |

   When unsure, default to `bot:pr` — the general-pr workspace can handle most tasks.

2. **Check for duplicates:**
   ```bash
   gh issue list --repo shantamg/meet-without-fear --search "SEARCH_TERM" --limit 10 --json number,title,state,labels,url
   ```

3. **Create the GitHub issue:**
   ```bash
   gh issue create --repo shantamg/meet-without-fear \
     --title "<concise title, <80 chars>" \
     --body "<request description + provenance block>" \
     --label "<bot:* label>"
   ```

   Body format:
   ```
   ## Request

   <What was requested, in clear terms>

   ## Provenance

   - **Channel**: <channel name>
   - **Requester**: <user name>
   - **Original message**: <quoted message text>
   - **Timestamp**: <Slack message ts>
   ```

4. **Reply in Slack thread** with the issue link:
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel CHANNEL_ID \
     --text "On it — tracking this here: <ISSUE_URL|Issue #N>. The workspace dispatcher will pick it up shortly." \
     --thread-ts "MESSAGE_THREAD_TS"
   ```
   See `references/response-templates.md` for REQUEST reply templates.

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

## Do NOT

- Attempt to do the work inline. The whole point is GitHub visibility.
- Create issues without a `bot:*` label — unlabeled issues won't be dispatched.
- Guess at labels — if it doesn't fit any row above, use `bot:pr`.
