# Gold Loop Improvement Plan

Run: `eval/runs/20260507-024645-james-catherine-iter-01`
Scenario: `james-catherine`
Score: `3.8`
Classification: improvement

## What Changed

The prior actor-skill repair moved `actor_fidelity` from fail to pass. The remaining prompt-quality blocker is now owned by `mwf_prompts`: Stage 0 topic shaping preserved privacy and neutrality, but over-abstracted Catherine's concrete concern.

## Likely Causes

The Stage 0 prompt told MWF to use neutral framing and included a generic example, "how we treat each other when we're upset." In the scored run, Catherine said "yelling and personal attacks," but James received "How we handle conflict when things get heated." That made the topic safe but too broad for the gold scenario pressure.

## Ownership Routing

- Owner: `mwf_prompts`
- Dimension: `mwf_handling`
- Recommended action: `patch_prompt`
- Evidence: `score.json` improvement target 1; `transcripts/catherine-stage0.md`; `transcripts/james-stage0.md`
- Chosen edit/proposal: patch `backend/src/services/stage-prompts.ts` and add `eval/prompt-versions/mwf/stage-0/v01.md`.

- Owner: `eval_harness`
- Dimension: `transcript_extraction`
- Recommended action: `patch_eval`
- Evidence: `score.json` improvement target 2; `transcripts/catherine-stage2.md`; `transcripts/james-stage2.md`; `scratch/*.md`
- Chosen edit/proposal: defer until after the higher-priority Stage 0 prompt rerun unless the next score still cites transcript auditability.

## Actor Skill Proposal

No new actor patch. Actor fidelity passed at `4`.

## MWF Prompt Proposal

Patch Stage 0 topic articulation so neutrality does not erase concrete behavioral signals. The prompt now explicitly says to preserve neutral concrete signals such as "yelling" and "personal attacks" and not flatten them into vague phrases like "conflict" or "communication."

## Product/Eval Harness Proposal

Transcript auditability remains a secondary follow-up. If the next rerun score still flags missing review/approve evidence, patch transcript extraction or Stage 2 event rendering so stable transcripts show draft review/share state without relying on scratch logs.

## Gold Alignment Notes

- Actor fidelity: pass. James and Catherine preserved usable high-resistance pressure.
- MWF guidance: Stage 1 and Stage 2 were strong; Stage 0 Catherine topic alignment scored `3` because the invite topic became too generic.
- Confidence: high for the Stage 0 prompt change because the failure is directly visible in adjacent transcripts.

## Regression Guard

Focused test: `npm --workspace backend test -- stage-prompts.test.ts --runInBand`.

The test checks that the Stage 0 prompt preserves concrete behavioral signals while staying neutral and that Stage 0 emits a topic draft, not an invitation-message draft.

## Next Iteration Notes

Acceptance criteria for the next `james-catherine` bounded run:

- Stage 0 topic shown to James should preserve the core signal, e.g. yelling/personal attacks or neutral equivalents that do not collapse to generic conflict.
- `mwf_handling` should improve from `3` to at least `4`.
- `actor_fidelity` must not regress below `4`.
- Hard invariants must still pass.
