# Stage: Deepen

## Input

- GitHub issue with `bot:spec-builder` label
- Issue comments (meta tag + human responses)
- `shared/rubrics.md` — Deepen rubric checklist
- `shared/commands.md` — slash-command vocabulary
- `shared/draft-template.md` — draft structure

## Process

1. **Read latest meta tag** from most recent bot comment. Verify `stage` is `deepen`.
2. **Check for slash commands** in latest human comment. Handle per `shared/commands.md`.
3. **Check staleness** (same 72h nudge / 7-day stale pattern as Scope, including waiting-human marker — see `02-scope/CONTEXT.md`).
4. **If human responded**: reset `nudge_sent`, update `last_human_response_at`.
5. **Evaluate Deepen rubric** against the current draft + latest human response:
   - `user_stories`: at least 2 user stories with "As a [role], I want [action], so that [benefit]" format? (`met | partial | missing`)
   - `acceptance_criteria`: every user story has >=1 observable acceptance criterion? (`met | partial | missing`)
   - `edge_cases`: at least 2 edge cases with explicit expected behavior (error, fallback, or rejection)? (`met | partial | missing`)
   - `failure_mode`: at least 1 story addresses what happens when the feature fails/degrades? (`met | partial | missing`)
6. **If all rubric items `met`**: graduate to `04-technical`. Post draft snapshot, update meta tag with `stage: technical`.
7. **If items remain**: generate questions for ALL `missing` and `partial` items whose answers are independent. Bundle into a single comment so the user can brain-dump. Ask about concrete scenarios — "What happens when X fails?" not "Define failure modes." Only hold back questions that depend on earlier answers. Post with progress summary and command footer.
8. **Post stage progress summary**: "We're in Deepen (stage 2 of 3). Covered: [items]. Exploring: [items]."

## Output

- Question comment or graduation comment posted
- Meta tag updated with rubric status, round count, timestamps
- Draft snapshot posted if content changed
- Issue body updated if `draft_hash` changed

## Waiting-Human Marker

Same as `02-scope/CONTEXT.md`: write `waiting-human-${ISSUE_NUMBER}.txt` when exiting without a human response, remove it on stale/label removal.

```bash
# Write on exit without human response:
date -Iseconds > "${CLAIMS_DIR:-/opt/slam-bot/state/claims}/waiting-human-${ISSUE_NUMBER}.txt"
# Remove on stale/abandon:
rm -f "${CLAIMS_DIR:-/opt/slam-bot/state/claims}/waiting-human-${ISSUE_NUMBER}.txt"
```

## Slack DM on Question Post

Same as `02-scope/CONTEXT.md`: when posting questions (step 7), also notify the requester via Slack thread reply using the Provenance block's channel and timestamp. See `02-scope/CONTEXT.md` for full instructions.

## Completion

Re-enters on next dispatcher tick until graduation (→ `04-technical`) or stale.
