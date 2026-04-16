# Stage: Scope

## Input

- GitHub issue with `bot:spec-builder` label
- Issue comments (meta tag + human responses)
- `shared/rubrics.md` — Scope rubric checklist
- `shared/commands.md` — slash-command vocabulary
- `shared/draft-template.md` — draft structure

## Process

1. **Read latest meta tag** from most recent bot comment. Verify `stage` is `scope`.
2. **Check for slash commands** in the latest human comment (`/skip-to-technical`, `/publish-now`, `/pause`, `/restart-stage`). If found, handle per `shared/commands.md`.
3. **Check staleness**:
   - No human response and `last_human_response_at` > 72h ago and `nudge_sent` is false → post single-line nudge, set `nudge_sent: true`, write waiting-human marker (see below), exit.
   - No human response and `last_human_response_at` > 7 days ago → post paused comment, remove `bot:spec-builder` label, remove waiting-human marker, record `abandoned_at_stage: scope`, exit.
   - No human response and < 72h → write waiting-human marker (see below), exit.
4. **If human responded**: reset `nudge_sent` to false, update `last_human_response_at`.
5. **Evaluate Scope rubric** against the current draft + latest human response:
   - `problem_statement`: clear problem defined? (`met | partial | missing`)
   - `success_criteria`: measurable success criteria listed? (`met | partial | missing`)
   - `out_of_scope`: boundaries explicitly stated? (`met | partial | missing`)
6. **If all rubric items `met`**: graduate to `03-deepen`. Post draft snapshot, update meta tag with `stage: deepen`, update issue body if draft changed.
7. **If items remain**: generate questions for ALL `missing` and `partial` items whose answers are independent of each other. Bundle them into a single comment so the user can answer everything at once. Only hold back questions that depend on answers to other questions. Post with stage progress summary and command footer. Update meta tag.
8. **Post stage progress summary** at the top of each question comment: "We're in Scope (stage 1 of 3). Covered: [items]. Exploring: [items]."

## Output

- Question comment or graduation comment posted
- Meta tag updated with rubric status, round count, timestamps
- Draft snapshot posted if content changed
- Issue body updated if `draft_hash` changed

## Waiting-Human Marker

When exiting without a human response (the < 72h and nudge paths), write a marker file so the dispatcher skips this issue until a human responds. The pipeline-monitor (Check 7) clears it when a new human comment is detected.

```bash
date -Iseconds > "${CLAIMS_DIR:-/opt/slam-bot/state/claims}/waiting-human-${ISSUE_NUMBER}.txt"
```

When the issue is abandoned (7-day stale) or the label is removed, clean up the marker:
```bash
rm -f "${CLAIMS_DIR:-/opt/slam-bot/state/claims}/waiting-human-${ISSUE_NUMBER}.txt"
```

## Slack DM on Question Post

When posting questions (step 7) and entering a waiting state, also notify the requester via Slack so they don't have to monitor GitHub.

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
   Hey — I have a few questions on your spec before we can move forward:

   • [Question 1]
   • [Question 2]

   You can reply here or on the GitHub issue.
   ```

## Completion

Re-enters on next dispatcher tick until graduation (→ `03-deepen`) or stale.
