# Stage: Technical

## Input

- GitHub issue with `bot:spec-builder` label
- Issue comments (meta tag + human responses)
- `shared/rubrics.md` — Technical rubric checklist
- `shared/commands.md` — slash-command vocabulary
- `shared/draft-template.md` — draft structure

## Process

1. **Read latest meta tag** from most recent bot comment. Verify `stage` is `technical`.
2. **Check for slash commands** in latest human comment. Handle per `shared/commands.md`.
3. **Check staleness** (same 72h nudge / 7-day stale pattern as prior stages, including waiting-human marker — see `02-scope/CONTEXT.md`).
4. **If human responded**: reset `nudge_sent`, update `last_human_response_at`.
5. **Evaluate Technical rubric** against the current draft + latest human response:
   - `technical_approach`: high-level approach described (which services, patterns, data flow)? (`met | partial | missing`)
   - `codebase_touchpoints`: affected services, files, or modules identified? (`met | partial | missing`)
   - `data_model`: any new or modified data models/schemas described? (`met | partial | missing`)
   - `verification_approach`: how to verify this works (test strategy, manual QA steps, metrics)? (`met | partial | missing`)
6. **If all rubric items `met`**: graduate to `05-publish`. Post draft snapshot, update meta tag with `stage: publish`.
7. **If items remain**: generate questions for ALL `missing` and `partial` items whose answers are independent. Bundle into a single comment so the user can brain-dump. Ask the user to describe the technical landscape — v1 relies on user knowledge, not codebase reading. Only hold back questions that depend on earlier answers. Post with progress summary and command footer.
8. **Post stage progress summary**: "We're in Technical (stage 3 of 3). Covered: [items]. Exploring: [items]."

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

Re-enters on next dispatcher tick until graduation (→ `05-publish`) or stale.
