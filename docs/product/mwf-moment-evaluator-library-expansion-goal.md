# Codex Goal — Moment Evaluator Library Expansion

This goal extends the just-shipped Moment Evaluator (PR #374) from one moment to five. The architecture is built; this goal is mechanical-but-careful: author the seed, rubric, judge prompt, hard invariants, and unit tests for four new moments, demonstrate each one converges with real Bedrock judging, and surface any cross-moment regressions.

Paste **Goal Statement** + **Success Criteria** + **Constraints** to a Codex goal session. The rest is supporting context.

## Goal Statement

Add four new moments to the Moment Evaluator library, on top of the existing `stage-1-fact-reflection`. Each new moment must have a real seeder, a real rubric, a real judge prompt template, deterministic hard invariants, unit test coverage, AND demonstrate at least one real iteration with the improver producing a measurable score delta against the gold transcripts.

The four new moments, in build order:

1. **`stage-1-emotional-pivot`** — A second Stage 1 moment, used to validate that the existing `v03` prompt revision doesn't regress other Stage 1 paths. If `stage-1-emotional-pivot` scores below threshold with `v03` active, that's a real regression — surface it.
2. **`stage-2-empathy-validation`** — Partner reviewing the empathy attempt; AI invites confirm-or-refine without forcing a verdict.
3. **`stage-3-mutual-reveal`** — Both partners' needs revealed side-by-side; AI asks "what do you notice?" without analyzing or labeling overlap.
4. **`stage-4-willingness-selection`** — Both partners marking willingness on shared proposals; AI captures selections and surfaces the closure path without inventing agreement before both submit.

Out of scope: applying `v03` (or any new prompt revisions) to production source via `--apply-to-source`. That's a separate goal once these moments validate v03 doesn't regress.

Out of scope: the actor-skill improver in the existing E2E loop. Different code path, different concern.

## Success Criteria

### Per-moment criteria (apply to each of the four)

For each new moment `<id>`:

1. **Moment yaml exists and parses.** `eval/moments/<id>.yaml` includes all required sections (`id`, `stages`, `description`, `seed`, `trigger`, `capture`, `rubric`, `improver`). The `rubric.reference_transcript_lines` points at a real, specific line range in `docs/product/source-material/golden-transcripts/{adam-eve,james-catherine}.md`. `python3 scripts/mwf_moment_eval.py seed --moment <id> --real --print-state` exits 0 and prints a real cuid session id with the expected row counts for the moment's seeded state.

2. **Judge prompt template exists.** `eval/scorer/judge-prompts/<id>.md` exists. The template includes the rubric, a verbatim excerpt from the gold transcript line range, and explicit instructions to return JSON with per-dimension scores + rationale. The system prompt and gold excerpt are passed with cache-control ephemeral blocks for prompt caching.

3. **Hard invariants are deterministic.** At least 2 hard invariants per moment, evaluated by deterministic Python code (extend `evaluate_stage1_hard_invariant` or add a parallel function — pick the cleaner pattern and document). For each new invariant, both a passing and a failing test case exist in `scripts/test_mwf_moment_eval.py`.

4. **Real iteration converges.** A command of the form `python3 scripts/mwf_moment_eval.py run --moment <id> --real --target-score 4.0 --max-iterations 3 --allow-protected-branch-patch` either:
   - Reaches `eval_pass` within 3 iterations (preferred), OR
   - Documents a verdict-improving delta of at least `+0.5` on at least one dimension across iterations (acceptable; flag for tuning).

5. **Wall-clock under 90 seconds per real iteration.** Document the observed timing for each moment.

### Cross-moment criteria

6. **`v03` does NOT regress `stage-1-emotional-pivot`.** Run `stage-1-emotional-pivot` once with `MWF_STAGE1_PROMPT_APPEND` set to the contents of `eval/prompt-versions/mwf/stage-1/v03.md`. The score with v03 active must be `>= 3.5` AND no hard invariant must regress. If the score drops below 3.5 or any hard invariant fails, the goal pauses, the regression is documented in detail (which dimension regressed, by how much, with the AI response excerpt), and Shantam is notified before continuing.

7. **Stage 4 prompts are now safe to iterate.** PR #373 has merged Stage 4 redesign + audit fixes. The Moment Evaluator's previous hard rule against modifying Stage 4 prompts is now relaxed: improver patches CAN target the Stage 4 region of `stage-prompts.ts` for the `stage-4-willingness-selection` moment. Patches still go to versioned files (`eval/prompt-versions/mwf/stage-4/v0N.md`), NOT directly to source. The `--apply-to-source` flag is not used in this goal.

8. **All-moments smoke run.** A new helper `python3 scripts/mwf_moment_eval.py run-library --real --no-improve` runs all five moments back-to-back with a single command, recording each moment's first-iteration score in a single summary file at `eval/runs/library-smoke-<timestamp>/summary.md`. This is the integration-level signal: do all moments converge or fail in expected ways from a single command?

### Tests, typecheck, docs

9. **Tests pass.** `python3 scripts/test_mwf_moment_eval.py` exit 0; total test count grows from 15 to at least 27 (3+ new tests per new moment for yaml parsing, deterministic invariants, runner happy path with mock judge).

10. **Backend typecheck passes.** `npm run check --workspace backend` exit 0. The new seeder logic for any moment that needs Stage 2/3/4 seed shapes (empathy attempts, needs lists, proposals) must compile cleanly.

11. **Existing infrastructure unchanged.** `python3 scripts/mwf_gold_loop.py browser-smoke` exits 0 (assuming services are up). The existing E2E loop must not be affected by this work.

12. **Documentation updated.** `docs/product/mwf-moment-evaluator-plan.md` updated with a "Library Expansion Status" section listing each new moment, observed wall-clock, score deltas, any flagged regressions. `docs/product/mwf-moment-evaluator-build-progress.md` updated per criterion.

## Stop conditions (declare goal NOT reached and ask Shantam)

- A moment's seeded state requires backend refactor beyond a small additive helper. Document the coupling and stop.
- A hard invariant cannot be made deterministic without genuinely needing LLM judgment for one of its sub-checks. Document and stop; do not silently delegate to the judge.
- Criterion 6 fails: `v03` regresses `stage-1-emotional-pivot`. Document the regression, do NOT silently fix v03 within this goal — that's a separate decision.
- The judge LLM produces non-deterministic verdicts on hard invariants for any new moment. Move more of the check to deterministic code; if not possible, document and stop.
- Cumulative judge cost across the goal exceeds $5 (≈100 iterations at default 5¢/iter). Stop and ask before continuing — there's likely an efficiency issue.

## Constraints

- Working directory: `/Users/shantam/Software/meet-without-fear` (main checkout). Branch: a fresh `feat/moment-evaluator-library-<datestamp>` cut from `main`. Do NOT work on `feat/moment-evaluator-real-mode` (that's PR #374's branch — already in review).
- The hard rule against `--apply-to-source` stands. New prompt versions go to `eval/prompt-versions/mwf/<stage>/v0N.md`, not to `backend/src/services/stage-prompts.ts` source.
- Each moment is its own commit. Do not bundle moments into a single commit. Reviewers should be able to bisect.
- Validate before each commit: `python3 scripts/test_mwf_moment_eval.py` exits 0; `npm run check --workspace backend` exits 0 if backend code touched.
- If a decision is ambiguous and materially affects product behavior, add it to "Questions For Shantam" and proceed only along a conservative reversible path. Do not guess on what the gold posture demands — re-read the transcript section.
- Build moments sequentially in the listed order. The ordering matters: `stage-1-emotional-pivot` validates `v03` first, before later moments risk relying on Stage 1 prompt behavior.
- Use existing patterns: extend `evaluate_stage1_hard_invariant` for shared invariant logic, mirror the `mwf-moment-real.ts` helper structure for backend integration, reuse the `MWF_STAGE_PROMPT_APPEND` hook pattern across stages (define `MWF_STAGE2_PROMPT_APPEND`, etc., as needed).

## Required reading (in this order)

1. `docs/product/mwf-moment-evaluator-plan.md` — full plan, especially the Moment Library section.
2. `docs/product/mwf-moment-evaluator-build-progress.md` — what shipped in PR #374 (Phase 1 + Real Mode).
3. `docs/product/stage-4-gold-question-analysis.md` — gold posture for the Stage 4 moment in this set.
4. `docs/product/source-material/golden-transcripts/adam-eve.md` — find the line range for each moment; cite it precisely in each yaml.
5. `docs/product/source-material/golden-transcripts/james-catherine.md` — second couple's voice; useful for cross-validation when authoring rubrics.
6. `docs/product/source-material/golden-transcripts/core-protocol-update.md` — protocol-level posture.
7. `eval/moments/stage-1-fact-reflection.yaml` — the working pattern to mirror.
8. `eval/scorer/judge-prompts/stage-1-fact-reflection.md` — the working judge template to mirror.
9. `scripts/mwf_moment_eval.py` — entry point; understand `evaluate_stage1_hard_invariant` and the existing improver path before extending.
10. `backend/src/scripts/mwf-moment-real.ts` — backend-side helper; extend its seeder for new stage shapes.
11. `backend/src/services/stage-prompts.ts` — Stage 1, 2, 3, 4 prompt sections; understand the existing hooks before adding new ones.

## Build progress

Codex must maintain `docs/product/mwf-moment-evaluator-build-progress.md` updated per criterion as each moment lands. Same shape: per-criterion checkboxes, files touched, validation runs, decisions, questions, never silently un-tick. Add a new top-level section "Library Expansion" under which the criteria above are tracked. Keep the Phase 1 and Real Mode sections as historical record.

## Before declaring goal reached

1. Run all 12 success criteria commands in sequence for each of the four new moments where applicable.
2. Paste each command and its outcome into the build progress doc.
3. Confirm criterion 6 (no v03 regression on stage-1-emotional-pivot) is green or document the regression.
4. Run criterion 8's library smoke command and link the resulting summary file.
5. Confirm `gh pr view <PR-number>` shows all checks green and the PR description references all four moments.
6. Only then declare goal reached.

---

## Notes for Shantam (do not paste to Codex)

- This goal is the value-extraction phase. After it lands, you'll have 5 moments with real-mode iteration evidence. That's enough for the loop to start producing actual prompt improvements faster than human review could.
- The cumulative cost guard at $5 should be plenty. If the goal hits it, something's looping inefficiently — worth investigating.
- The "v03 regression check" is the most important criterion in the goal. It tests whether moment-specific prompt iterations generalize. If v03 regresses other Stage 1 moments, you've learned something important about the architecture (single-moment optimization may overfit) and the next goal should focus on multi-moment iteration constraints.
- After this lands, the obvious next goals are: (a) apply v03 + any other validated revisions to production source via `--apply-to-source` and run gold-session test, (b) actor-skill improver in `mwf_gold_loop.py`, (c) continue moment library expansion to cover transitions and Tending re-entry.
- The Stage 4 moment in this set (`stage-4-willingness-selection`) is the first time the moment evaluator iterates on Stage 4 prompts. Watch its output carefully — Stage 4 just landed and is freshly minted; the loop's improvements there will be the fastest validation that the redesign holds up.
