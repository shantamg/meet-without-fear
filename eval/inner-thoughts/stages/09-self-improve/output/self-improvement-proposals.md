# Self-Improvement Proposals

Date: 2026-05-10

## Proposal 1: Prefer Stable Session URLs After `id=new`

Evidence: all three real browser runs created valid Inner Thoughts sessions, but the browser URL stayed at `/inner-work/self-reflection/new?id=new` after creation. The component holds the real session id in state, and the database has the durable id, but URL-only actor evidence is weaker than it should be.

Diagnosis: the route successfully avoids a redirect flicker, but eval actors and human debuggers cannot recover the created session id from the URL alone.

Files to change:

- `mobile/app/(auth)/inner-work/self-reflection/[id].tsx`
- mobile route tests for new Inner Thoughts session creation

Effect: tightens the eval system and improves product debuggability. It does not weaken privacy or CTA criteria.

Verification:

- Start from the home composer with `id=new`.
- Confirm the first user message is saved.
- Confirm the route replaces to `/inner-work/self-reflection/<created-id>` after creation.
- Confirm browser back behavior remains acceptable.

## Proposal 2: Add A First-Class Inner Thoughts Actor Runner

Evidence: the live runs were performed with `agent-browser` command sequences and committed scratch logs, but each scenario still required manual command orchestration.

Diagnosis: the actor skill is documented, but there is not yet a small runner script that executes all live-enabled scenarios, captures DOM text, screenshots, database link checks, and emits `MWF_INNER_THOUGHTS_STATUS` JSON automatically.

Files to change:

- `eval/inner-thoughts/scenarios.json`
- a new script under `eval/inner-thoughts/scripts/`
- `eval/skills/mwf-inner-thoughts-loop-actor/SKILL.md`

Effect: tightens the eval loop by making reruns more repeatable and less dependent on manual transcript copying.

Verification:

- Run the script against `localhost:8082` and `localhost:3000` with `MOCK_LLM=false`.
- Confirm it produces one scratch artifact per live-enabled scenario.
- Confirm each artifact ends with `MWF_INNER_THOUGHTS_STATUS` JSON.
