# Codex Goal — MWF Moment Evaluator, Phase 1

This file is shaped for Codex's goal-with-success-criteria mode. Paste the **Goal Statement** and **Success Criteria** sections below into Codex; the rest of the file is supporting context Codex should read before starting.

## Goal Statement

Build the Phase 1 viable Meet Without Fear Moment Evaluator: a stage-segmented eval loop that seeds a known conversational state directly into the database, drives one AI turn through a direct backend API call, scores the response against a gold-aligned rubric for one specific moment, and (if the score is below threshold) lets an improver patch the MWF prompt and re-run.

Phase 1 covers exactly **one** moment end-to-end: `stage-4-no-shared-agreement-closure`. The goal is reached when the success criteria below are all met for that one moment. Phase 2 (additional moments) is **out of scope** for this goal.

## Success Criteria

Each criterion is independently verifiable by running a command. Codex should self-check each one before declaring the goal reached.

1. **Entry point exists and runs.**
   - Command: `python3 scripts/mwf_moment_eval.py --help`
   - Expected: exit 0, prints help text mentioning `run`, `--moment`, `--target-score`, `--max-iterations`, `--mock-judge`, `--allow-protected-branch-patch`.

2. **Moment yaml is parseable and complete for `stage-4-no-shared-agreement-closure`.**
   - File: `eval/moments/stage-4-no-shared-agreement-closure.yaml`
   - Must include all sections per `docs/product/mwf-moment-evaluator-plan.md` "Moment yaml shape": `id`, `stages`, `description`, `seed`, `trigger`, `capture`, `rubric`, `improver`.
   - Rubric must include `reference_transcript_lines` pointing at a real line range in `docs/product/source-material/golden-transcripts/james-catherine.md`, at least 2 dimensions, an `overall_pass_threshold`, and at least 1 `hard_invariant`.

3. **Seeder writes a clean Stage 4 state.**
   - Command: `python3 scripts/mwf_moment_eval.py seed --moment stage-4-no-shared-agreement-closure --print-state`
   - Expected: exit 0, prints session id and a summary of seeded rows (session, two participants, stage progress through 3, Stage 4 proposals with at least one shared and one individual, at least one Stage4ProposalSelection row reflecting one user's WILLING choice and the other's NOT_WILLING).
   - Re-running the command produces a new clean session each time; no accumulation across runs.

4. **Runner drives one AI turn and captures the response.**
   - Command: `python3 scripts/mwf_moment_eval.py run --moment stage-4-no-shared-agreement-closure --max-iterations 1 --no-improve`
   - Expected: exit 0, run directory created at `eval/runs/moment-stage-4-no-shared-agreement-closure-<timestamp>-iter-01/` containing: `seed-state.json`, `ai-response.md`, `state-delta.json`, `score.json`, `score-rationale.md`, `run.json`.
   - Wall-clock: under 60 seconds for a single iteration when `--mock-judge` is used; under 180 seconds with the real judge.

5. **Scorer produces structured output.**
   - `score.json` from criterion 4 must contain: `overall_score` (number), per-dimension scores (object keyed by dimension id), `hard_invariants` (array of `{id, pass: bool}`), `verdict` (`eval_pass | eval_warn | eval_fail`), `improvement_targets` (array of `{owner, dimension, action}`).
   - At least one entry in `improvement_targets` if `verdict != eval_pass`.

6. **Improver pass produces a prompt diff and re-runs.**
   - Command: `python3 scripts/mwf_moment_eval.py run --moment stage-4-no-shared-agreement-closure --target-score 4.0 --max-iterations 3 --improvement-mode patch --allow-protected-branch-patch=false`
   - Expected: exit 0. If iter-01 score is below `overall_pass_threshold`, an `improvement-plan.md` and `patch-summary.md` exist in iter-01 directory and a new prompt version is recorded under `eval/prompt-versions/mwf/stage-4/`.
   - Iter-02 must run a fresh seed and re-evaluate the same moment with the new prompt. `score.json` in iter-02 must record a `delta` field comparing to iter-01.
   - Iter-02 must NOT regress any hard invariant that passed in iter-01.

7. **Hard invariant enforced.**
   - The hard invariant `"AI does not invent a shared agreement when partner has not selected WILLING on any shared proposal"` must be defined in the moment yaml and evaluated in `score.json`.
   - When the AI response does not violate it (the seeded state has only one user willing, so closure is no-shared-agreement), the invariant must be marked `pass: true`.
   - When the AI response does violate it (test by writing a deliberate bad response into a `--mock-response` flag), the invariant must be marked `pass: false` and the verdict must be `eval_fail` regardless of dimension scores.

8. **Reuses existing infrastructure where applicable, no duplication.**
   - Prompt version tracking lives under `eval/prompt-versions/` (existing directory; do not create a parallel one).
   - The improver code paths reuse helpers from `scripts/mwf_gold_loop.py` where they are not browser/two-actor specific. If a helper needs extracting into a shared module, do so under `scripts/mwf_eval_common/` and have both entry points import from there.
   - Branch protection: patch mode refuses `main` unless `--allow-protected-branch-patch` is passed, matching the existing E2E loop.

9. **Tests pass.**
   - Unit tests under `scripts/test_mwf_moment_eval.py` cover: yaml parsing, seeder idempotence, runner happy-path with mocked backend, scorer schema validation, improver invocation, version tracking.
   - `python3 -m pytest scripts/test_mwf_moment_eval.py -q` exits 0.
   - `npm run check --workspace backend` exits 0 (the seeder must not break backend types if it imports from there).

10. **Documentation updated.**
    - `docs/product/mwf-moment-evaluator-plan.md` is updated with a "Phase 1 status" section recording the moment shipped, the path to the entry point, the test-pass counts, and the actual wall-clock observed for one iteration with mock judge and with real judge.
    - The doc retains the full Phase 2/3/4 plan; Codex must not delete future-phase planning to declare Phase 1 done.

## Stop conditions (declare goal NOT reached and ask Shantam)

Codex must stop and ask if any of these occur:

- The moment yaml shape requires a field that the technical spec does not specify (e.g. an unfamiliar Stage 4 enum). Add the question to a `Questions For Shantam` section in `docs/product/mwf-moment-evaluator-build-progress.md` and stop.
- The judge LLM cost per iteration exceeds budget guard rails (define a `--max-judge-cost-cents` and stop if it would be exceeded).
- A criterion above is met only by softening the criterion (e.g. lowering the hard invariant threshold). Document the conflict and stop.
- Real judge responses are non-deterministic enough that the same prompt produces different verdicts across runs. Record this as a known issue and proceed with mock judge for criteria 4-6, but flag it for Shantam.

## Constraints

- Worktree-only edits. Do not edit the main checkout. Create a sibling worktree under `/Users/shantam/Software/` named `meet-without-fear-moment-eval` if needed.
- No new dependencies on Playwright, browser automation, or the live web bundle. The runner calls backend Express handlers directly through a fixtures-aware test client (similar to existing backend route tests).
- No prompt edits applied to `main` in this work. Patch mode targets the worktree branch only.
- The existing self-improvement loop (`scripts/mwf_gold_loop.py`) must continue to function unchanged after this work lands. Run a smoke check at the end: `python3 scripts/mwf_gold_loop.py browser-smoke` should still exit 0.
- Validate every change with `npm run check` and the relevant test suites before committing. Record commands and results in the build progress doc.
- Commit at natural sub-checkpoints; push the branch when an acceptance criterion is met; open a draft PR by the time criterion 4 is reached.

## Required reading

In this order:

1. `docs/product/mwf-moment-evaluator-plan.md` — the full plan; criteria above implement Phase 1.
2. `docs/product/stage-4-gold-question-analysis.md` — the gold posture, especially the resolved Q4 (mutual WILLING == agreement) since this moment is the inverse case.
3. `docs/product/source-material/golden-transcripts/james-catherine.md` — the moment under test is the no-shared-agreement closure moment from this transcript.
4. `docs/product/source-material/golden-transcripts/core-protocol-update.md`
5. `scripts/mwf_gold_loop.py` — for shared patterns; do not modify it as part of this goal.
6. `eval/skills/self-improvement/mwf-gold-prompt-improver/SKILL.md` — the improver pattern to mirror.
7. `backend/src/services/stage-prompts.ts` — the prompt under iteration.
8. Existing backend route tests (e.g. `backend/src/routes/__tests__/stage4.test.ts`) — for the direct-API-call test client pattern.

## Build progress doc

Codex must maintain a build progress doc at:

  `docs/product/mwf-moment-evaluator-build-progress.md`

Same shape as `stage-4-tending-build-progress.md`: per-criterion checkboxes, files touched, validation runs, decisions made, questions for Shantam. Update as work progresses; do not batch updates to the end.

## Before declaring goal reached

Run all 10 success criteria commands in sequence and paste the results into the build progress doc. If any criterion is not green, do not declare reached — stop and ask Shantam.

---

## Notes for Shantam (do not paste to Codex)

- The criteria are deliberately runnable. Codex should be able to self-verify without your involvement until the goal is hit.
- Criterion 3 specifically tests the seeded state has one user WILLING and one NOT_WILLING — that's the no-shared-agreement scenario. If Codex seeds a different shape, criterion 7's invariant test won't make sense.
- Criterion 6's "iter-02 must not regress any hard invariant" is the prompt-eval safety rail. Without it, the improver could chase score-only improvements and break consent gates.
- Criterion 8 prevents Codex from building a parallel-stack version of the version-tracking + improver scaffolding. Reuse is mandatory.
- The "real judge" cost in criterion 4 is the main wall-clock variable. Mock judge is for tests; real judge is for real runs. Both must work.

## On the meta angle

You raised: "we might even be able to build the moment evaluator around the goal feature itself."

That's correct, and it's worth flagging but probably not worth doing in Phase 1. The improver step in the Moment Evaluator (criterion 6) is functionally the same shape as goal-feature iteration: take a current state, propose a change, re-evaluate against criteria, repeat until reached. The simplest version of the improver is a vanilla LLM call that proposes a prompt diff. The most ambitious version is a recursive Codex goal-feature call where the inner goal is "raise dimension X by 0.5 without regressing hard invariants."

Recommendation: build the simple version in Phase 1. Once Phase 1 is shipping value, replace the improver with a goal-feature call as a Phase 1.5 polish. Doing it on day one risks recursion bugs (a goal calling a goal calling a goal) before the outer scaffolding is stable.
