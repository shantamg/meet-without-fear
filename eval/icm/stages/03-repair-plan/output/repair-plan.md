# Repair Plan

## Planned Fixes Implemented This Cycle

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

### P2: Preserve Concrete Stage 0 Topic Signal

- Routed failure: F2.
- Likely files: `backend/src/services/stage-prompts.ts` and focused prompt tests around Stage 0 topic shaping.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/catherine-stage0.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/james-stage0.md`
- Status: implemented after user approved a larger run budget.
- Files:
  - `backend/src/services/stage-prompts.ts`
  - `backend/src/services/__tests__/stage-prompts.test.ts`
  - `eval/prompt-versions/mwf/stage-0/v01.md`
- Verification strategy: focused prompt/unit test for topic shaping passed; final `james-catherine` `fresh_gold_loop` passed with score `4.0`.
- Human approval required before another real-LLM rerun: no. The final bounded rerun consumed the fourth completed fresh `james-catherine` run and reached target.

### P3: Make Stage 2 Draft Review/Approval Auditable In Stable Transcripts

- Routed failure: F3.
- Likely files: transcript extraction under `backend/scripts/transcripts/` or related transcript metadata generation.
- Evidence:
  - `eval/runs/20260507-024645-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-024645-james-catherine-iter-01/transcripts/*.md`
  - `eval/runs/20260507-024645-james-catherine-iter-01/scratch/*.md`
- Verification strategy: final `james-catherine` `fresh_gold_loop` before clean-pass claim.
- Status: no longer blocking bounded clean pass. The final scorer marked MWF handling pass and hard invariants pass.

### P4: Keep Invitation Follow-Up Ghost Dots Visible

- Routed failure: F4.
- Files:
  - `mobile/src/screens/UnifiedSessionScreen.tsx`
- Evidence:
  - User report during this cycle.
  - `backend/src/controllers/sessions.ts` asynchronous background transition-message generation after immediate HTTP success.
  - Prior mobile loading state only covered `isConfirmingInvitation`, which ends before the background Ably AI response arrives.
- Verification strategy: `npm --workspace mobile run check`; manual UI verification when running the app.
- Human approval required: no. This adds status visibility and does not weaken product intent, rubrics, invariants, actor difficulty, or real-LLM requirements.

### P5: Gate Share-Offer Fetch Until Own Empathy Is Submitted

- Routed failure: F5.
- Files:
  - `mobile/src/hooks/useUnifiedSession.ts`
  - `mobile/src/hooks/useSharingStatus.ts`
  - `mobile/src/utils/shareOfferEligibility.ts`
  - `mobile/src/utils/__tests__/shareOfferEligibility.test.ts`
- Evidence:
  - `eval/runs/20260507-075001-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-075001-james-catherine-iter-01/transcripts/james-stage2.md`
  - `backend/src/controllers/reconciler.ts` pending offers become `OFFERED` when fetched.
- Verification strategy: focused share-offer eligibility test, mobile type check, then `james-catherine` required `bounded-stage-2` gate with `MOCK_LLM=false`.
- Human approval required: no. This preserves Stage 2 sequencing and does not weaken product intent, rubrics, invariants, actor difficulty, or real-LLM requirements.
