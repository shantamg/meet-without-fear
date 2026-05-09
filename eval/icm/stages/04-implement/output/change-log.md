# Change Log

## Eval-Machine Changes

- `eval/skills/mwf-gold-loop-actor/SKILL.md`
  - Added explicit Stage 2 guidance for high-resistance personas to move through friction before insight.
  - Added James/Catherine-specific calibration: James can reluctantly see Catherine's fear or exhaustion, but should resist being reduced to "unsafe," "the whole problem," or a diagnosis, and should stay concrete and defensive enough for MWF to earn empathy.
  - Evidence: `eval/runs/20260507-022725-james-catherine-iter-01/score.json` actor-fidelity target.

## Runtime Mirror

- `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md`
  - Mirrored the same patch so the immediate rerun used the changed actor guidance.
  - Risk: runtime skill is not a symlink to repo source. This should be fixed with `scripts/install_mwf_gold_skills.sh` or equivalent human-approved runtime cleanup.

## Product, Prompt, Snapshot, Regression Changes

- Product code:
  - `mobile/src/screens/UnifiedSessionScreen.tsx`
    - Added a local `isAwaitingInvitationFollowUp` state for the inviter after the invitation modal is closed/shared.
    - Keeps `ChatInterface` ghost dots visible after the fast `/invitation/confirm` response until the background Ably AI transition response or error arrives.
    - Evidence: user-observed product failure during this cycle: after closing the invitation modal and seeing the invitation-sent indicator, no dots showed while the background response was pending, making the app feel stuck.
  - `mobile/src/hooks/useUnifiedSession.ts`, `mobile/src/hooks/useSharingStatus.ts`
    - Gated `/reconciler/share-offer` fetching until the current user has submitted their own Stage 2 empathy attempt.
    - Prevents a `PENDING` share offer from being marked `OFFERED` before perspective-taking is complete.
    - Evidence: `eval/runs/20260507-075001-james-catherine-iter-01/score.json` flagged a share suggestion/context block surfacing while James was still being asked to imagine Catherine's experience.
  - `mobile/src/utils/shareOfferEligibility.ts`, `mobile/src/utils/__tests__/shareOfferEligibility.test.ts`
    - Added the pure eligibility rule and focused coverage for the Stage 2 share-offer fetch gate.
- MWF production prompts:
  - `backend/src/services/stage-prompts.ts`
    - Stage 0 topic framing now preserves concrete behavioral signals that can be stated neutrally, including "yelling" and "personal attacks", instead of flattening them into generic conflict language.
    - Changed the Stage 0 draft protocol label from `invitation` to `topic` so the hidden draft contract matches the current product behavior.
    - Evidence: `eval/runs/20260507-024645-james-catherine-iter-01/score.json`, `transcripts/catherine-stage0.md`, `transcripts/james-stage0.md`.
- Snapshot registry: none.
- Prompt-version proposals:
  - `eval/prompt-versions/mwf/stage-0/v01.md`
    - Durable proposal for preserving concrete Stage 0 topic signals while maintaining neutral invitee-safe wording.
- Regression records: none added. Remaining confirmed issues are tracked in this cycle report rather than closed.
