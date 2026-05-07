# Repair Plan

## Planned Fix Implemented This Cycle

### P1: Tighten High-Resistance Stage 2 Actor Guidance

- Routed failure: F1.
- Files:
  - `eval/skills/mwf-gold-loop-actor/SKILL.md`
  - Runtime mirror: `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md`
- Evidence:
  - `eval/runs/20260507-022725-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-022725-james-catherine-iter-01/transcripts/james-stage2.md`
- Verification strategy: rerun `james-catherine` required `bounded-stage-2` gate with `MOCK_LLM=false`.
- Human approval required: no. This tightens actor difficulty and does not weaken rubrics, completion criteria, hard invariants, or real-LLM requirements.

## Remaining Planned Fixes Not Implemented This Cycle

### P2: Preserve Concrete Stage 0 Topic Signal

- Routed failure: F2.
- Likely files: `backend/src/services/stage-prompts.ts` and focused prompt tests around Stage 0 topic shaping.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/catherine-stage0.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/james-stage0.md`
- Verification strategy: focused prompt/unit test for topic shaping, then `james-catherine` `fresh_gold_loop`.
- Human approval required before another real-LLM rerun: yes, because the default maximum of two fresh `james-catherine` reruns in this cycle has been reached.

### P3: Make Stage 2 Draft Review/Approval Auditable In Stable Transcripts

- Routed failure: F3.
- Likely files: transcript extraction under `backend/scripts/transcripts/` or related transcript metadata generation.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/*.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/scratch/*.md`
- Verification strategy: focused transcript extraction test or fixture, then `james-catherine` `fresh_gold_loop` before clean-pass claim.
- Human approval required before another real-LLM rerun: yes, same cycle-budget reason.
