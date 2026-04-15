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
   - No human response and `last_human_response_at` > 72h ago and `nudge_sent` is false → post single-line nudge, set `nudge_sent: true`, exit.
   - No human response and `last_human_response_at` > 7 days ago → post paused comment, remove `bot:spec-builder` label, record `abandoned_at_stage: scope`, exit.
   - No human response and < 72h → do nothing, exit.
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

## Completion

Re-enters on next dispatcher tick until graduation (→ `03-deepen`) or stale.
