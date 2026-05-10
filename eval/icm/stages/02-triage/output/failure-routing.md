# Failure Routing

## Completed Gates

- `adam-eve` `bounded-stage-2`: pass, score `4.0`, hard invariants pass.
- `james-catherine` `bounded-stage-2` first run: fail, score `3.0`, hard invariants pass.
- `james-catherine` `bounded-stage-2` rerun after actor patch: fail for clean pass, score `3.8`, hard invariants pass.
- `james-catherine` `bounded-stage-2` rerun after Stage 0 prompt patch: fail for clean pass, score `3.5`, hard invariants pass.
- `james-catherine` `bounded-stage-2` rerun after share-offer fetch gating patch: pass, score `4.0`, hard invariants pass.

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

### F4: Invitation Follow-Up Has No Visible Pending Status

- Owner: `product_code`
- Severity: medium for perceived reliability; not a hard invariant failure.
- Evidence:
  - User report during this cycle: after closing the invitation modal and seeing the invitation-sent indicator, there were no ghost dots while the background AI transition response was pending.
  - Code location: `backend/src/controllers/sessions.ts` returns `/invitation/confirm` immediately and generates the transition message asynchronously over Ably.
  - Code location: `mobile/src/screens/UnifiedSessionScreen.tsx` previously only passed `isConfirmingInvitation` into `ChatInterface`, so dots disappeared as soon as the fast HTTP mutation settled.
- Prompt-quality evaluable: no. This is a UI status issue, not a prompt-quality score signal.
- Rerun mode: mobile focused type check plus manual/browser UI verification when available.
- Rationale: button-only invitation actions do not append a user message, and the cache-derived last-message typing heuristic therefore has no user message to key off while the background transition response is pending.

### F5: Share Suggestion Offered Before Own Empathy Attempt Completed

- Owner: `product_code`
- Severity: high for Stage 2 sequencing; not a hard invariant failure.
- Evidence:
  - `eval/runs/20260507-075001-james-catherine-iter-01/score.json`
  - `eval/runs/20260507-075001-james-catherine-iter-01/transcripts/james-stage2.md`
  - Code location: `mobile/src/hooks/useUnifiedSession.ts` fetched `/reconciler/share-offer` during all of Stage 2.
  - Code location: `backend/src/controllers/reconciler.ts` marks a pending `ReconcilerShareOffer` as `OFFERED` as soon as the endpoint is retrieved.
- Prompt-quality evaluable: yes. The run was structurally scoreable and hard invariants passed.
- Rerun mode: focused mobile test plus `fresh_gold_loop`.
- Rationale: the share-offer endpoint has side effects. Fetching it before the user's own empathy attempt was complete could make the product and transcript evidence look like MWF was steering the user into self-advocacy/context sharing while still asking for perspective-taking.
