# Codex Goal - Darryl/Shantam System Improvement

Use this file from the repository root with:

```text
/goal Follow docs/product/darryl-shantam-system-improvement-goal.md exactly.
```

## Objective

Improve MWF using the first real Darryl/Shantam gold-loop result as evidence, without overfitting to that one scenario.

The goal is reached when Darryl/Shantam Stage 0-2 reaches the target score, the fix does not regress Adam/Eve or James/Catherine Stage 0-2, and the product/prompt changes are documented with reproducible run artifacts.

This is not a whack-a-mole goal. The purpose is to make smarter, simpler alignment choices that improve MWF's general facilitation behavior. Darryl/Shantam is evidence for a broader class of failures: low shared-history relationships, terse users, process frustration, bounded uncertainty, and observational empathy.

That said, "avoid whack-a-mole" is a judgment standard, not a ban on local fixes. A narrow fix is correct when it removes a real product bug, deletes a bad fallback, clarifies a bad instruction, or simplifies the system. A narrow fix is wrong when it only makes one transcript pass by adding brittle exceptions, scenario-specific branches, or phrase-level hacks. The guiding question is: does this change improve the facilitator's decisions across the whole turn-by-turn arc, or only appease this one score?

## Starting Evidence

Read first:

- `docs/product/mwf-holistic-self-improvement-plan.md`
- `eval/runs/20260510-222945-darryl-shantam-loop-summary.md`
- `eval/runs/20260510-222945-darryl-shantam-iter-01/score.json`
- `eval/runs/20260510-222945-darryl-shantam-iter-01/invariants.json`
- `eval/runs/20260510-222945-darryl-shantam-iter-01/transcripts/transcript_Darryl_cmp0rilj.md`
- `eval/runs/20260510-222945-darryl-shantam-iter-01/transcripts/transcript_Shantam_cmp0rilj.md`
- the matching scratch files under `eval/runs/20260510-222945-darryl-shantam-iter-01/scratch/`
- `backend/src/services/stage-prompts.ts`
- code that renders the Stage 2 empathy-review/privacy-review message that produced the stale `Priya` name.

Do not assume the score is perfect. Treat it as strong evidence that still needs local confirmation.

## Required Diagnosis

Before editing, write a short diagnosis note in:

```text
docs/product/darryl-shantam-system-improvement-progress.md
```

Classify each failure as `mwf_prompts`, `product_code`, `eval_harness`, `actor_skill`, or `human_review`.

At minimum address:

- Stage 2 over-extension into speculative shame, pride, reputation, or hidden inner states after the user has already produced a concrete low-knowledge empathy attempt.
- Stage 1 over-validation of Darryl's factual interpretation, especially language like "got blown off" or "handle it or we have a problem."
- Stale participant-name/privacy-review copy: Shantam's run mentioned `Priya's privacy`.
- Any confusing Stage 2 draft state labels that are cheap and safe to fix during this goal.
- Whether the current Stage 2 ready-to-share threshold is too turn-count-driven for terse users who have already said everything they can responsibly observe.

Before patching code or prompts, run the improver in proposal mode against the existing failed run and read its plan:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py improve-run \
  eval/runs/20260510-222945-darryl-shantam-iter-01 \
  --scenario darryl-shantam \
  --improvement-mode proposal
```

Use the proposal as input, not as authority. The diagnosis note should say which suggestions were accepted, rejected, or deferred.

## Implementation Requirements

Make the smallest product and prompt changes that solve the proven issue.

Prefer changes that simplify the facilitator's decision-making and improve whole-flow alignment:

- Use general principles such as "preserve uncertainty," "do not mind-read after low-knowledge pushback," "adapt after repeated process resistance," and "capture concrete needs when they are already clear."
- Avoid adding scenario-specific prompt branches, exact phrase bans, one-off regexes, Darryl/Shantam-only logic, or brittle turn-count carve-outs when they merely make one run pass.
- Make specific fixes when the defect is truly specific, such as a stale hard-coded participant name, a bad fallback, a broken state label, or a local guard whose current behavior is objectively wrong.
- If a proposed fix requires many narrow exceptions, stop and look for the simpler underlying rule.
- Treat passing Darryl/Shantam alone as insufficient if the change makes Adam/Eve or James/Catherine less aligned with their gold posture.
- For every meaningful fix, inspect the surrounding turns before and after the failed moment. Do not optimize a single AI response if the real issue is the stage trajectory, transition timing, or failure to course-correct.

Stage 2 should support low-knowledge observational empathy:

- If the user says they do not know the partner's inner state, accept that as valid information.
- After one or two inference attempts, pivot to observable impact, uncertainty, and bounded sentence scaffolding.
- Do not keep pushing for shame, pride, fear, reputation, or deeper layers unless the user volunteered that frame.
- A sufficient Stage 2 draft can say: "I do not know exactly what is happening for you, but I can see how this might be landing, and here is what I need you to understand."
- If the user expresses process frustration or explicitly says they have no more information, allow readiness earlier than the generic turn-count heuristic when the draft already contains a bounded observational empathy statement.
- Add or update prompt/test coverage for facilitation circularity: one "I do not know" can be explored once; a repeated "I do not know" or "that is guessing too much" must cause strategy adaptation, not a third rephrased inference prompt.

Stage 1 should validate experience without validating unproven accusations:

- Reflect facts as the user reports them.
- Preserve uncertainty where the user does not have proof.
- Avoid escalating the partner into a villain or turning the facilitator into an advocate for one side.
- Still take concrete health/safety/boundary concerns seriously.

Product copy must use the current partner/session names dynamically and must not leak stale hard-coded names from other scenarios.

Search for hard-coded participant placeholders in product copy, tests, prompt fixtures, and fallback strings. If a string names a participant, prefer deriving it from current session/profile context or make the absence of a name explicit rather than falling back to an unrelated scenario name.

If durable process facts or context assembly changes are necessary, keep them narrow and auditable. Do not dump the full transcript into every prompt as a substitute for better state.

## Validation Gates

Run focused unit/type checks that cover changed code.

At minimum run:

```bash
python3 scripts/test_mwf_moment_eval.py
python3 -m py_compile scripts/mwf_gold_loop.py
```

If backend TypeScript was changed, run the relevant backend check or a narrower test first, then `npm run check --workspace backend` if feasible.

If prompt text or scorer criteria changed, add focused assertions or judge criteria for:

- Stage 2 strategy adaptation after repeated low-knowledge/process-frustration answers.
- Early readiness for terse users who have produced a usable observational empathy statement.
- Absence of hard-coded participant names in review/privacy copy.

Then run real gold loops with `MOCK_LLM=false`:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario darryl-shantam \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail
```

If Darryl/Shantam passes, run regression gates:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario adam-eve \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail

MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario james-catherine \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail
```

If a regression gate fails, inspect the score and decide whether it is a true regression, scorer noise, or an already-existing baseline problem. Do not weaken Darryl/Shantam correctness just to appease an unrelated artifact.

## Long-Run Discipline

Avoid the failure mode from the prior 24-hour session:

- Do not replay from old snapshots when a fresh run has produced a cleaner later state.
- Do not add regex carve-outs or scenario-specific hacks before diagnosing the true owner.
- Do not tune prompts from non-evaluable transcripts.
- Promote any newly verified reusable state into a named snapshot or progress-note entry before rerunning.
- Keep a concise progress log with commands, run directories, score deltas, and decisions.

If a run fails due to stale services, wrong mock setting, browser flake, or missing LLM credentials, fix the runtime condition and rerun before changing prompts.

## Acceptance Criteria

- `darryl-shantam` Stage 0-2 reaches `overall_score >= 4.0`, or the progress doc explains why the judge is wrong with transcript evidence and what should be changed in the scorer.
- Actor fidelity remains passing.
- Hard invariants pass.
- No stale `Priya` or other wrong participant name appears in the Darryl/Shantam transcript.
- Stage 2 transcript shows an observational-empathy pivot instead of repeated speculative inner-state probing.
- Stage 2 does not require four turns when a terse user has already produced a responsible low-knowledge empathy draft and has no further valid inferences to offer.
- The scorer or progress doc explicitly checks strategy adaptation: after repeated "I do not know" / "that is guessing too much" signals, MWF must change tactics rather than ask the same inner-state question again.
- Stage 1 transcript validates Darryl's seriousness and boundary without treating the disputed cause as settled fact.
- Adam/Eve and James/Catherine Stage 0-2 regression gates are run or explicitly deferred with a concrete blocker.
- `docs/product/darryl-shantam-system-improvement-progress.md` contains changed files, commands run, run directories, score outcomes, and remaining risks.

## Stop Conditions

Stop and report if:

- The fix requires changing privacy boundaries between partner tracks.
- The scorer and transcript disagree in a way that makes the target unreliable.
- Repeated real-LLM loops fail for infrastructure reasons after service cleanup.
- The work appears to require broad autonomous-alignment architecture changes rather than focused prompt/product repair.
- Bedrock or other LLM cost approaches $30 for this goal.

## Final Report

Summarize:

- diagnosis,
- files changed,
- validation commands and outcomes,
- gold-loop run directories,
- score before and after,
- any regressions or deferred gates,
- recommended next goal, if any.
