# Codex Goal - Inner Thoughts Self-Improvement Loop

This file is shaped for Codex slash-goal usage. Start from the repository root with:

```text
/goal Follow docs/product/inner-thoughts-self-improvement-goal.md exactly.
```

## Goal Statement

Turn the Inner Thoughts feature back on and make it smooth, robust, and testable through a new self-improving evaluation loop modeled on the existing gold-loop/ICM structure.

The goal is reached when:

1. The home page composer creates a real Inner Thoughts session from the user's typed message instead of routing to `comingSoonMode`.
2. Inner Thoughts provides a high-quality solo reflection experience for users who just want to think, journal, explore ambitions, or organize ideas.
3. Inner Thoughts detects when the user is talking about a specific person and, when earned, offers a polished app-style CTA to start a partner session.
4. The CTA opens the existing session drawer/new-session flow, creates or prepares a partner session with the discussed person, and carries the Inner Thoughts context into Stage 0.
5. The resulting partner session starts in Stage 0, but the previous Inner Thoughts chat is treated as meaningful context so topic formation is faster and more precise than a cold start.
6. A new inner-thoughts eval workspace, actor skill, scenarios, artifacts, scoring, and loop instructions exist under `eval/` so future Codex slash-goal sessions can run actors through this flow and improve product/prompt behavior from evidence.

Do not merely re-enable UI. Build the loop that can keep this surface honest.

## Required Starting Point

Before editing code, read these files:

1. `eval/icm/RUN_SELF_IMPROVEMENT_LOOP.md`
2. `eval/icm/README.md`
3. `eval/icm/CONTEXT.md`
4. `eval/skills/mwf-gold-loop-actor/SKILL.md`
5. `eval/skills/mwf-gold-session-tester/SKILL.md`
6. `eval/skills/mwf-gold-session-tester/references/browser-driving.md`
7. `docs/archive/specs/inner-work-refinement-prd.md`
8. `mobile/app/(auth)/(tabs)/index.tsx`
9. `mobile/app/(auth)/inner-work/self-reflection/[id].tsx`
10. `mobile/src/screens/InnerThoughtsScreen.tsx`
11. `mobile/src/components/SuggestedActionButtons.tsx`
12. `mobile/app/(auth)/session/new.tsx`
13. `backend/src/controllers/inner-work.ts`
14. `backend/src/routes/inner-thoughts.ts`
15. `backend/src/controllers/messages.ts` sections that handle `innerThoughtsId`
16. `backend/src/services/stage-prompts.ts` Inner Work and Stage 0 prompt builders
17. `shared/src/dto/inner-work.ts`
18. `backend/prisma/schema.prisma` models related to `InnerWorkSession`, `Session`, and origin linkage

## Build The Eval Workspace First

Create a new eval workspace parallel to `eval/icm/`, not inside the old gold-loop workspace:

```text
eval/inner-thoughts/
  README.md
  RUN_SELF_IMPROVEMENT_LOOP.md
  CONTEXT.md
  COMPLETION_CRITERIA.md
  scenarios.json
  FAILURE_TAXONOMY.md
  GOVERNANCE.md
  references/
    commands.md
    actor-policy.md
    scoring-policy.md
    artifact-policy.md
    browser-policy.md
  stages/
    01-intake/CONTEXT.md
    01-intake/output/.gitkeep
    02-triage/CONTEXT.md
    02-triage/output/.gitkeep
    03-repair-plan/CONTEXT.md
    03-repair-plan/output/.gitkeep
    04-implement/CONTEXT.md
    04-implement/output/.gitkeep
    05-verify/CONTEXT.md
    05-verify/output/.gitkeep
    06-rerun/CONTEXT.md
    06-rerun/output/.gitkeep
    07-judge/CONTEXT.md
    07-judge/output/.gitkeep
    08-report/CONTEXT.md
    08-report/output/.gitkeep
    09-self-improve/CONTEXT.md
    09-self-improve/output/.gitkeep
  cycles/
    cycle-report-template.md
  regressions/
    README.md
```

The workspace should mirror the useful discipline of `eval/icm/`: durable stage contracts, artifact-backed routing, completion criteria, reports, and explicit self-improvement of the eval machine. It must not reuse gold-specific language that assumes two prewritten gold transcript personas.

Add a build progress doc:

```text
docs/product/inner-thoughts-self-improvement-build-progress.md
```

Track every success criterion below with checkboxes, file paths changed, commands run, run artifacts, decisions, and unresolved questions.

## Build A New Actor Skill

Create a repo-backed skill:

```text
eval/skills/mwf-inner-thoughts-loop-actor/SKILL.md
eval/skills/mwf-inner-thoughts-loop-actor/references/actor-scenarios.md
eval/skills/mwf-inner-thoughts-loop-actor/references/browser-driving.md
eval/skills/mwf-inner-thoughts-loop-actor/agents/openai.yaml
```

Update `scripts/install_mwf_gold_skills.sh` or add a better-named installer such as `scripts/install_mwf_eval_skills.sh` so this skill can be installed for Codex runtime use without breaking the existing gold skills.

The new actor skill must:

- Drive the current app from the home page composer using `agent-browser` for command-line loop runs.
- Start by typing a realistic first message into the home page input.
- Continue the Inner Thoughts chat as the assigned actor until the scenario target is reached, the app blocks, or a serious bug appears.
- Click only local/E2E test CTAs that belong to the actor.
- Record scratch evidence under:

```text
docs/product/inner-thoughts-scratch/<YYYY-MM-DD>-<run-id>-<scenario-id>.md
```

- End every actor run with a machine-readable status block:

````text
MWF_INNER_THOUGHTS_STATUS:
```json
{
  "scenario_id": "journal-organize-ambition",
  "run_id": "example",
  "state": "completed",
  "blocked_on": null,
  "next_action_needed": null,
  "scratch_log": "docs/product/inner-thoughts-scratch/2026-05-10-example-journal-organize-ambition.md",
  "current_url": "http://localhost:8082/inner-work/self-reflection/..."
}
```
````

Allowed `state` values: `completed`, `can_continue`, `needs_partner_setup`, `stage0_reached`, `bug_blocked`, `error`.

## Actor Scenarios

Define these in `eval/inner-thoughts/scenarios.json` and document them in the actor skill reference.

### Scenario 1 - Journal, Organize, Ambition

Scenario id: `journal-organize-ambition`

Starting home message:

```text
I have a bunch of thoughts about work and what I want next, but they feel scattered. I do not think this is about another person exactly. I just need somewhere to sort it out.
```

Actor posture:

- The user wants a private journaling and thinking space, not a partner session.
- They talk about ambition, fear of wasting time, possible next projects, and feeling pulled between stability and creative work.
- They should resist premature action plans and prefer reflection first.

Expected product behavior:

- The app creates a real Inner Thoughts session from the home composer.
- MWF responds as a skillful reflection partner: grounding, curious, gently challenging, and useful for organizing thoughts.
- The AI may help turn the mess into themes, questions, options, or a next note, but it should not over-structure too early.
- No `start_partner_session` CTA should appear unless the actor clearly pivots to a specific interpersonal conflict.
- Suggested actions for journaling/needs/gratitude/meditation are allowed only when contextually earned and should not crowd the chat.

Pass signals:

- The actor reports feeling more organized after 4-8 turns.
- The final chat contains a concise captured structure: themes, tensions, possible next focus, or an "idea parking lot."
- No partner-session CTA was shown inappropriately.

### Scenario 2 - Person Detected, Partner Session CTA

Scenario id: `person-to-partner-session`

Starting home message:

```text
I keep replaying this fight with Maya. She says I shut down whenever she brings up money, but I feel like she is already disappointed before I even answer.
```

Actor posture:

- The user is upset about a specific person, Maya.
- They initially want to talk privately, not jump straight into a partner session.
- They become open to a structured conversation only after MWF reflects the issue accurately and explains why a partner session could help.

Expected product behavior:

- The app creates a real Inner Thoughts session from the home composer.
- MWF reflects and explores the issue without immediately forcing a partner session.
- Once the person and relational opportunity are clear, a bottom CTA appears in the app's existing design language.
- The CTA should be specific and low-pressure, such as `Start a session with Maya`, and should include a clear dismiss path.
- The CTA opens the drawer/new-session flow with `partnerName=Maya` and `innerThoughtsId=<inner session id>` carried through.
- `POST /inner-thoughts/:id/generate-context` produces a context summary before or during session creation.
- The partner session starts in Stage 0.
- The Stage 0 prompt has access to the Inner Thoughts context and uses it to get to the topic faster without pretending Maya has already participated.

Pass signals:

- The CTA appears only after enough conversation to justify it.
- The CTA is visually polished and does not overlap the chat input, keyboard, or safe area.
- The new session flow carries the person name and context.
- The created `Session` is linked back to the originating `InnerWorkSession` or otherwise has durable traceability through the existing `innerThoughtsId` contract.
- Stage 0 asks a sharper topic-framing question than a cold start and does not reset the user as if no prior chat happened.

### Scenario 3 - Ambiguous Person, Do Not Over-Route

Scenario id: `ambiguous-person-boundary`

Starting home message:

```text
I am frustrated with my manager and also with myself. Part of me wants to confront him, but part of me thinks this is really about how I keep giving away my evenings.
```

Actor posture:

- The user mentions a person, but the primary work may be self-boundaries, energy, and choices.
- They are not necessarily asking for a relationship repair session.
- They may mention workplace power dynamics where inviting the other person would be inappropriate.

Expected product behavior:

- MWF explores whether this is about self-reflection, boundaries, or a conversation with another person.
- It must not reflexively show a partner-session CTA just because a person is mentioned.
- If it offers a CTA, the copy must be conditional and user-controlled, not presumptive.
- It should support journaling, boundary clarification, and practical thought organization.

Pass signals:

- No partner-session CTA appears during the first few turns.
- If a CTA appears later, it is phrased as optional and appropriate to the actor's workplace context.
- The AI can distinguish "talking about someone" from "ready to start a partner session with someone."

## Harness Requirements

Add or adapt a loop runner. Preferred path:

```text
scripts/mwf_inner_thoughts_loop.py
```

The runner should be intentionally smaller than `scripts/mwf_gold_loop.py` but use the same proven patterns where practical:

- Start local services when requested.
- Use real LLM mode by default for meaningful evaluation; do not silently fall back to mock when real mode is requested.
- Use distinct `agent-browser` sessions per scenario run.
- Seed or log in local/E2E users through existing E2E auth bypass patterns.
- Start on the E2E web app home page, not directly on the Inner Thoughts route.
- Capture DOM snapshots, screenshots when visual layout matters, transcripts, browser logs, backend logs when available, DB state for created `InnerWorkSession` and `Session` rows, and a final run summary.
- Write run artifacts under:

```text
eval/runs/inner-thoughts/<timestamp>-<scenario-id>/
  run.json
  transcript.md
  actor-status.json
  score.json
  invariants.json
  screenshots/
  browser-snapshots/
  db-state.json
  loop-summary.md
```

Add a smoke command:

```sh
python3 scripts/mwf_inner_thoughts_loop.py browser-smoke
```

Add a run command:

```sh
MOCK_LLM=false python3 scripts/mwf_inner_thoughts_loop.py run --scenario person-to-partner-session --max-iterations 1 --target-score 4.0 --start-services --no-improve-on-final-fail
```

The CLI does not need to support every gold-loop feature on day one, but it must be enough for the three scenarios above.

## Scoring Requirements

Create a simple inner-thoughts scorer that can judge each run from artifacts. It may be embedded in the new runner or factored into:

```text
eval/inner-thoughts/scorer/
```

Score dimensions should include:

- `home_composer_real_session`: home composer created a real Inner Thoughts session with the user's typed message.
- `reflection_quality`: AI is reflective, organizing, appropriately challenging, and not generic.
- `routing_judgment`: AI neither misses earned partner-session opportunities nor over-routes ambiguous/self-work cases.
- `cta_quality`: CTA is specific, dismissible, bottom-positioned, visually consistent, and safe-area/keyboard aware.
- `context_handoff`: partner-session creation carries person name, inner thoughts id, and generated context.
- `stage0_continuity`: Stage 0 uses prior context to form the topic faster while preserving privacy and not inventing partner participation.

Hard invariants:

- No `comingSoonMode` path for normal home-composer Inner Thoughts.
- No partner-session CTA before a specific person and relational opportunity are established.
- No partner-private claims are invented in Stage 0 from solo Inner Thoughts.
- No context from Inner Thoughts is shown as if the partner authored or consented to it.
- No CTA overlaps chat input, keyboard, or critical navigation controls.
- No raw internal tags, JSON, prompt instructions, or implementation labels appear to users.

## Product Implementation Requirements

### Home Composer

- Remove or bypass the temporary coming-soon route for normal signed-in users.
- Preserve the current home composer visual feel unless the implementation proves it is broken.
- Sending from home must call the real create-session path with `initialMessage`.
- The first visible user message in Inner Thoughts must be exactly the user's typed content.
- The AI should not greet before the user's first message.
- Add focused tests updating the existing home-screen test that currently expects the coming-soon route.

### Inner Thoughts Chat

- Ensure `SuggestedActionButtons` or its replacement is usable at the bottom of the chat without obscuring messages or input.
- Keep CTA design consistent with the app's existing component style: restrained, clear, native-feeling, dismissible, and not a marketing card.
- Use icons from the existing lucide setup when helpful.
- Do not add a new landing page or explanatory feature tour.

### Backend Prompt And DTO Contract

- Preserve the existing `suggestedActions` DTO unless a small backwards-compatible extension is necessary.
- Tighten the Inner Work prompt so partner-session suggestions are earned, person-specific, and optional.
- Tighten the non-partner path so the AI can provide journaling, reflection, thought organization, ambition clarification, and gentle challenge without always trying to route away.
- Add tests around `suggestedActions` parsing and validation for malformed LLM output.

### Inner Thoughts To Partner Session

- Verify `generateContext` returns a concise useful summary, person name when appropriate, key concerns, emotional state, and open questions.
- Verify `mobile/app/(auth)/session/new.tsx` actually consumes `innerThoughtsId`, shows the context banner correctly, and passes the link through session creation.
- Verify `backend/src/controllers/invitations.ts` or the relevant session creation path links the originating inner thoughts session durably.
- Verify `backend/src/controllers/messages.ts` and context assembly make Stage 0 aware of the origin context without treating the partner as having spoken.
- If "turn counting" matters in the code path, count prior Inner Thoughts turns as prior context for topic formation only; do not mutate partner-session stage progress as if those were partner-session messages.

## Success Criteria

Each criterion must be checked before declaring the goal reached.

1. `eval/inner-thoughts/` exists with the stage workspace, scenario registry, completion criteria, references, and cycle/report conventions described above.
2. `eval/skills/mwf-inner-thoughts-loop-actor/SKILL.md` exists and can be installed for Codex runtime use.
3. `scripts/mwf_inner_thoughts_loop.py browser-smoke` exits 0 when local E2E services are available, or records a clear missing-service diagnostic.
4. `MOCK_LLM=false python3 scripts/mwf_inner_thoughts_loop.py run --scenario journal-organize-ambition --max-iterations 1 --target-score 4.0 --start-services --no-improve-on-final-fail` produces a complete run directory and passes hard invariants.
5. The same run command passes for `person-to-partner-session`.
6. The same run command passes for `ambiguous-person-boundary`.
7. The home composer no longer routes normal user input to `comingSoonMode`; existing tests are updated accordingly.
8. A real Inner Thoughts session can be created from the home composer with the user's initial message stored as the first user message.
9. The AI response for solo journaling/organizing does not show a partner-session CTA in Scenario 1.
10. The AI response in Scenario 2 eventually shows a person-specific partner-session CTA after adequate reflection.
11. The CTA is dismissible and visually stable on mobile and web/E2E viewports.
12. Tapping the CTA carries `innerThoughtsId` and `partnerName` into session creation.
13. `generateContext` is called and its output is persisted or passed into the partner session flow.
14. The resulting partner session starts in Stage 0.
15. Stage 0 uses the prior Inner Thoughts context to form a sharper topic without inventing the partner's perspective.
16. Scenario 3 proves a person mention alone does not force partner-session routing.
17. Focused backend tests pass for Inner Thoughts create, message, suggested actions, and generate-context behavior.
18. Focused mobile tests pass for home composer routing and CTA rendering/navigation.
19. `npm run check --workspace backend` passes.
20. `npm run test --workspace backend -- --runInBand inner-thoughts` or the repo's closest supported focused backend test command passes.
21. The mobile test command for touched mobile tests passes.
22. `python3 scripts/test_mwf_moment_eval.py` still passes, unless unrelated local service credentials block it and the blocker is documented.
23. Existing gold loop smoke is not broken: `python3 scripts/mwf_gold_loop.py browser-smoke` exits 0 when local E2E services are available, or the missing-service reason is recorded.
24. `docs/product/inner-thoughts-self-improvement-build-progress.md` records all commands, run directories, pass/fail results, and remaining risks.

## Stop Conditions

Stop and ask Shantam before proceeding if:

- Turning on home-composer Inner Thoughts requires a schema migration that would risk existing production data without a clear reversible path.
- The app cannot start local E2E services after reasonable diagnosis and no browser evidence can be gathered.
- The session creation flow has multiple competing ways to create sessions and the correct product direction is ambiguous.
- Privacy boundaries are unclear: specifically, whether solo Inner Thoughts context should be visible to the invited partner in Stage 0.
- Real LLM credentials are missing and mock mode would be the only possible basis for prompt-quality claims.
- The loop can only pass by weakening actor scenarios, hard invariants, or scoring criteria.

## Constraints

- Work in `/Users/shantam/Software/meet-without-fear`.
- Do not remove or replace the existing gold-loop ICM, gold skills, or `scripts/mwf_gold_loop.py`.
- Keep the new loop separate from gold transcript evaluation. It may share helper patterns but should not make Adam/Eve or James/Catherine assumptions.
- Preserve privacy: solo Inner Thoughts content is the user's private context. It can help the user prepare Stage 0, but it must not be presented as partner-authored, partner-confirmed, or partner-visible unless the product explicitly obtains consent.
- Keep implementation scoped to Inner Thoughts, home composer, suggested actions, new-session handoff, Stage 0 context continuity, and the new eval harness.
- Commit at natural checkpoints if working in a goal session configured for commits. Do not push to `main`.
- Use `apply_patch` for manual file edits.
- Do not weaken existing gold-loop completion criteria or tests to make this work easier.

## Before Declaring Goal Reached

1. Run all three inner-thoughts scenarios in real mode and record their run directories.
2. Verify each run has `transcript.md`, `actor-status.json`, `score.json`, `invariants.json`, `db-state.json`, and `loop-summary.md`.
3. Run focused backend/mobile tests and backend typecheck.
4. Run or record the status of `python3 scripts/mwf_gold_loop.py browser-smoke`.
5. Update `docs/product/inner-thoughts-self-improvement-build-progress.md`.
6. Ensure `git status --short` contains only intentional changes and local run artifacts are either ignored or deliberately documented.
7. Only then report the goal as reached.

## Notes For Shantam

The third scenario is intentionally not another clean partner-session handoff. It protects against the most likely false positive: seeing a person mention and pushing a partner session when the user actually needs private reflection, boundary clarification, or work-context thinking.

The main product bet is that Inner Thoughts becomes the front door for "I need to think" while still being smart enough to invite a partner-session transition when the conversation earns it.
