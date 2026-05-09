# Test Results

## Focused Verification

- Command: `diff -u eval/skills/mwf-gold-loop-actor/SKILL.md /Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md`
  - Exit status: `0` after runtime mirror update.
  - Coverage: confirms the active runtime actor skill matched the repo actor skill before the rerun.
- Command: `npm --workspace backend test -- stage-prompts.test.ts --runInBand`
  - Exit status: `0`.
  - Result: `PASS src/services/__tests__/stage-prompts.test.ts`; `92` tests passed.
  - Coverage: verifies the Stage 0 prompt contract includes concrete behavioral-signal preservation while staying neutral, and that the Stage 0 hidden draft is a `topic` draft.
- Command: `npm --workspace mobile run check`
  - Exit status: `0`.
  - Coverage: verifies the invitation follow-up ghost-dot UI patch type-checks in the mobile screen and hook integration.
- Command: `npm --workspace mobile test -- shareOfferEligibility.test.ts --runInBand`
  - Exit status: `0`.
  - Result: `PASS src/utils/__tests__/shareOfferEligibility.test.ts`; `4` tests passed.
  - Coverage: verifies share-offer fetching stays disabled before the user's own Stage 2 empathy attempt is submitted and becomes eligible after consent/submission.
- Command: `npm --workspace mobile run check`
  - Exit status: `0`.
  - Coverage: verifies the share-offer fetch gating patch type-checks in the mobile hook integrations.
- Command: `git diff --check`
  - Exit status: `0`.
  - Coverage: whitespace sanity for all pending patches.

## Real-LLM Verification

- Command:
  - `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
  - Run dir: `eval/runs/20260507-024645-james-catherine-iter-01`
  - Exit status: `0`
  - Score: `3.8`
  - Hard invariants: pass
  - Coverage: verifies the actor-skill change against the same required bounded gate that exposed the actor-fidelity failure.
  - Result: actor fidelity improved to pass (`4`), but clean pass still failed because MWF handling scored `3`.
- Attempted command after Stage 0 prompt patch:
  - `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
  - Partial run dir: `eval/runs/20260507-073948-james-catherine-iter-01`
  - Exit status: `1` due to operator `KeyboardInterrupt` after the user redirected to a product UI issue.
  - Coverage: none for scoring. This partial run has no `score.json`, `invariants.json`, complete transcripts, or loop summary and must not be counted toward clean pass.
- Command after Stage 0 prompt patch:
  - `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
  - Run dir: `eval/runs/20260507-075001-james-catherine-iter-01`
  - Exit status: `0`
  - Score: `3.5`
  - Hard invariants: pass
  - Coverage: verifies Stage 0 topic shaping improved, but exposes the Stage 2 share-offer sequencing issue.
  - Result: clean pass still failed because MWF handling scored `3`.
- Command after share-offer fetch gating patch:
  - `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
  - Run dir: `eval/runs/20260507-080727-james-catherine-iter-01`
  - Exit status: `0`
  - Score: `4.0`
  - Hard invariants: pass
  - Coverage: verifies the required `james-catherine` bounded gate with the product sequencing fix.
  - Result: clean pass achieved for the required bounded Stage 2 gate.

## Cleanup Verification

- `eval/runs/20260507-020604-adam-eve-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-022720-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-024640-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-073943-james-catherine-services/cleanup.json`: backend and web stopped after the interrupted run.
- `eval/runs/20260507-074956-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-080723-james-catherine-services/cleanup.json`: backend and web stopped.
- Process check after final run: no `mwf_gold_loop`, app dev server, Metro/Expo, codex actor, or `agent-browser` daemon remains.
