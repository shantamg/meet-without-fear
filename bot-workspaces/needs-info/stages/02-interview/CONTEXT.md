# Stage: Interview

## Input

- GitHub issue with `bot:needs-info` label
- All issue comments (bot questions + user responses)
- `shared/question-templates.md` — for follow-up questions
- `shared/graduation-criteria.md` — to check if enough info gathered
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue metadata (labels, title, state). You **MUST NOT** call `gh issue view --json labels` or `gh issue list` to check labels — that data is already in the state file. Re-fetching it via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue view <number> --repo shantamg/meet-without-fear --comments` — to read issue **comments** (not in state file)

Any other `gh` read call indicates a bug.

## Process

1. **Read all issue comments** via `gh issue view <number> --comments`.
2. **Find the most recent bot comment** and extract the metadata from its HTML comment tag.
3. **Check for user responses** since the last bot comment:
   - **User responded**: Analyze the response against graduation criteria.
     - If criteria met → proceed to stage 03 (graduate).
     - If more info needed → post follow-up questions (max 2-3 per round), update metadata with incremented `questions_asked` and `last_response` timestamp.
   - **No response, <24h since last bot comment**: Do nothing, exit.
   - **No response, 24-72h**: Post a gentle nudge on the GitHub issue AND on the original Slack thread (see Slack follow-up below).
   - **No response, >72h**: Add `stale` label, post a closing comment, remove `bot:needs-info` label. Exit.
4. **Update metadata** in each new bot comment:
   ```
   <!-- bot:needs-info-meta: {"questions_asked": N, "last_response": "<ISO>", "category": "<category>"} -->
   ```
5. **Keep questions specific**: reference what the user has already shared, ask for concrete details (screen name, steps to reproduce, error messages).

## Output

- Follow-up comment posted (or nudge, or stale closure)
- Updated metadata in the latest bot comment

## Slack Follow-up (24h nudge)

When posting a 24h nudge, also notify the requester on the original Slack thread so they don't have to check GitHub.

1. **Parse the issue body's Provenance block** for `Channel` and `Timestamp`. If either is missing, skip — not every issue originates from Slack.
2. **Look up the channel ID** from `.claude/config/services.json` (`slack.channels.<name>`).
3. **Post a thread reply** with the outstanding questions:
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel "$CHANNEL_ID" \
     --text "$MESSAGE" \
     --thread-ts "$THREAD_TS"
   ```
4. **Message format** — plain language, adapted to channel tone:
   ```
   Hey — just a friendly nudge! We still have a couple of questions on this before we can move forward:

   • [Question 1]
   • [Question 2]

   No rush, just reply here when you get a chance.
   ```

## Completion

Re-enters on next dispatcher tick until graduation (→ stage 03) or stale closure.
