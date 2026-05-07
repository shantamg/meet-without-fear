# Failure Routing

## Completed Gates

- `adam-eve` `bounded-stage-2`: pass, score `4.0`, hard invariants pass.
- `james-catherine` `bounded-stage-2` first run: fail, score `3.0`, hard invariants pass.
- `james-catherine` `bounded-stage-2` rerun after actor patch: fail for clean pass, score `3.8`, hard invariants pass.

## Routed Failures

### F1: James Stage 2 Actor Too Polished

- Owner: `actor_skill`
- Severity: high for eval quality, not a hard invariant failure.
- Evidence:
  - `eval/runs/20260507-022725-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-022725-james-catherine-iter-01/transcripts/james-stage2.md`
- Prompt-quality evaluable: yes. The run was structurally scoreable and hard invariants passed.
- Rerun mode: `fresh_gold_loop`.
- Rationale: scorer marked actor fidelity score `3`, with James becoming too compliant and too articulate in Stage 2. Because the failure affected live actor behavior in a required fresh gate, the truthful verification mode was a fresh bounded rerun.

### F2: Stage 0 Topic Too Generic For James/Catherine

- Owner: `mwf_prompts`
- Severity: high for clean-pass score; not a hard invariant failure.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/catherine-stage0.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/james-stage0.md`
- Prompt-quality evaluable: yes.
- Rerun mode: `fresh_gold_loop`.
- Rationale: after the actor patch, scorer marked actor fidelity pass but MWF handling still failed because the final invite topic softened Catherine's concrete yelling/personal-attacks signal into a generic conflict topic.

### F3: Stage 2 Review/Approve Step Weakly Auditable In Stable Transcript

- Owner: `eval_harness`
- Severity: medium for evidence quality; not a hard invariant failure.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/catherine-stage2.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/james-stage2.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/scratch/2026-05-07-cmovaxokr0008px1tlfr2z18f-catherine.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/scratch/2026-05-07-cmovaxokr0008px1tlfr2z18f-james.md`
- Prompt-quality evaluable: yes, with evidence caveat.
- Rerun mode: focused transcript extractor test plus `fresh_gold_loop` before clean-pass claim.
- Rationale: scratch logs show actors reviewed and shared drafts, but stable transcripts do not make that review-and-approve action clearly auditable.
