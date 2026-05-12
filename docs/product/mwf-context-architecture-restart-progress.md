# MWF Context Architecture Restart Progress

Date: 2026-05-11
Branch: `codex/context-architecture-restart-20260511`
Worktree: `/tmp/mwf-context-architecture-restart`
Base: `origin/main` at `5eddbfe4`

## Scope

This restart began from latest `main` and did not reuse the previous context branch. No Darryl/Shantam tuning or evaluation was run. Adam/Eve is now clean through Stage 2 using real CTA/API gates after reverting typed-chat sharing. Context improvements are being reintroduced incrementally with Adam/Eve DB verification after each increment.

## Code Changes

- `scripts/mwf_gold_loop.py`
  - Load `backend/.env` for transcript extraction and DB inspection commands.
  - Capture `db-stage-state.json` for each non-mock run.
  - Add `db_stage_state_matches_stop_gate` hard invariant.
  - Require Stage 2 stop gates to use DB `StageProgress`, `Message.stage`, and `EmpathyAttempt` lifecycle state instead of actor status or transcript text alone.
  - Tighten Stage 2 actor handoff so `needs_partner` with `blocked_on` is not treated as a completed stop boundary.
- `scripts/test_mwf_gold_loop.py`
  - Add regression coverage for transcript/status passing while DB messages remain behind.
  - Add coverage that Stage 2 needs real empathy lifecycle state, not actor status alone.
  - Add pass coverage for valid Stage 2 `GATE_PENDING` plus `READY` attempts.
  - Add coverage that Stage 2 partner waits resume the newly blocked partner, even when the other actor's prior status was also a partner wait.
  - Add prompt coverage requiring actors to handle Stage 2 post-empathy share/context review prompts such as `Share this with <partner>? Review`.
- `mobile/src/hooks/useChatUIState.ts`
  - Treat `myAttempt.status === REFINING` as refinement mode even after `hasNewSharedContext` is cleared by viewing partner context, so the revised empathy review/resubmit panel can stay available.
- `mobile/src/utils/chatUIState.ts`
  - During Stage 2 refinement, hold optional share-suggestion panels so the required revised empathy review/resubmit CTA can surface.
- `backend/src/services/context-assembler.ts` and `backend/src/services/context-formatters.ts`
  - Add current-stage history for the current user's own lane as prompt continuity context.
  - Label it explicitly as continuity-only context; stage gates still come from `StageProgress` and product lifecycle state.
  - Add confirmed topic frame to the `ContextBundle` as orientation-only context. It is included only when `Session.topicFrameConfirmedAt` exists.
  - Add typed consented partner/share lifecycle state from `EmpathyAttempt` and `ReconcilerShareOffer` rows.
  - Label consented share state explicitly as orientation-only context; gates still come from `StageProgress` plus empathy/share/validation lifecycle state.
  - Include shared content only when it is the current user's own content or has been delivered/revealed to the current user.
  - Add prior-stage summaries from `Message.stage` and `StageProgress` for the current user's own lane only.
  - Label prior-stage summaries explicitly as continuity-only context; stage gates still come from `StageProgress` and product lifecycle state.
- `backend/src/services/stage-prompts.ts`
  - Let stage prompts use confirmed topic frame from `contextBundle.topicFrame` when no explicit `topicFrame` is provided.
  - Preserve explicit `topicFrame: null` as a suppression signal.
- `backend/src/services/ai-orchestrator.ts`
  - Add a Stage 1 minimum-turn guard before honoring model-requested feel-heard checks, so the visible felt-heard CTA cannot appear before enough substantive witness turns.
  - This is state/turn-count gating, not chat text matching.
- `backend/src/controllers/messages.ts`
  - A typed Stage 2B share-confirmation persistence patch was tried and then reverted. Stage 2 sharing/resubmission must happen only through the review/share CTA/API path, not regex text matching in chat.
  - Post-Stage-0 streaming prompts now pass topic frame only after `topicFrameConfirmedAt`, so unconfirmed topic drafts are not injected as durable context.

## Verification

- `python3 -m unittest scripts/test_mwf_gold_loop.py`: pass, 19 tests.
- `python3 -m py_compile scripts/mwf_gold_loop.py scripts/test_mwf_gold_loop.py`: pass.
- `npm --workspace mobile test -- --runTestsByPath src/utils/__tests__/chatUIState.test.ts --runInBand`: pass, 70 tests.
- `npm --workspace backend run check`: pass.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/context-assembler.test.ts --runInBand`: pass, 20 tests.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/context-assembler.test.ts src/services/__tests__/stage-prompts.test.ts --runInBand`: pass, 127 tests.
- `npm --workspace backend run check`: pass after confirmed-topic-frame increment.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/context-assembler.test.ts --runInBand`: pass, 26 tests after consented-share-state increment.
- `npm --workspace backend run check`: pass after consented-share-state increment.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/context-assembler.test.ts --runInBand`: pass, 29 tests after prior-stage-summaries increment.
- `npm --workspace backend run check`: pass after prior-stage-summaries increment.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/ai-orchestrator.test.ts --runInBand`: pass, 39 tests after Stage 1 felt-heard turn guard.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand`: pass, 105 tests after Stage 1 felt-heard turn guard.
- `npm --workspace backend run check`: pass after Stage 1 felt-heard turn guard.

## Adam/Eve Runs

- `eval/runs/20260511-150503-adam-eve-iter-01`
  - Baseline before harness patch.
  - Initial transcript extraction failed because `DATABASE_URL` was not loaded for backend extractor.
  - After re-running extraction/DB capture manually, DB showed both sides through Stage 1, but Stage 2 was incomplete.

- `eval/runs/20260511-152602-adam-eve-iter-01`
  - After transcript extraction and DB-state capture patch.
  - Score: `3.0`, `eval_fail`.
  - Hard invariant: `db_stage_state_matches_stop_gate`.
  - DB evidence: Adam Stage 2 `IN_PROGRESS`, Eve Stage 2 `IN_PROGRESS`, Adam `EmpathyAttempt` `REFINING`.
  - Orchestrator incorrectly moved to scoring after Eve said Adam still needed to revise.

- `eval/runs/20260511-154427-adam-eve-iter-01`
  - After Stage 2 handoff tightening.
  - Score: `3.0`, `eval_fail`.
  - Improvement: orchestrator resumed Adam after Eve shared context.
  - Remaining blocker: actor loop ping-ponged at Stage 2 partner waits and still ended with DB Stage 2 incomplete.
  - DB evidence: Adam Stage 2 `IN_PROGRESS`, Eve Stage 2 `IN_PROGRESS`, Adam `EmpathyAttempt` `REFINING`, Eve `EmpathyAttempt` `READY`, no validations.

- `eval/runs/20260511-161106-adam-eve-iter-01`
  - After initial reciprocal Stage 2 wait handling.
  - Score: `3.0`, `eval_fail`.
  - Improvement: orchestrator did not ping-pong to max actor turns. Adam shared his Stage 2 empathy attempt and returned `needs_partner` blocked on Eve; Eve completed Stage 1, shared her Stage 2 empathy/context, and returned `needs_partner` blocked on Adam.
  - Follow-up finding: stopping on reciprocal Stage 2 partner waits was too early because Adam's status was stale from before Eve shared new context. The runner now resumes the newly blocked partner instead.
  - Hard invariant: `db_stage_state_matches_stop_gate`.
  - DB evidence: Adam Stage 0/1 `COMPLETED`, Eve Stage 0/1 `COMPLETED`, max `Message.stage` 2, Adam Stage 2 `IN_PROGRESS`, Eve Stage 2 `IN_PROGRESS`, Adam `EmpathyAttempt` `REFINING`, Eve `EmpathyAttempt` `READY`, no validations.
  - Scorer found actor fidelity and MWF handling scoreable at 4/4 each, but `evaluation_scope.prompt_quality` remained `not_evaluable_for_prompt_quality` because the DB stop gate failed.

- `eval/runs/20260511-163207-adam-eve-iter-01`
  - After removing the premature reciprocal-wait stop.
  - Score: `3.0`, `eval_fail`.
  - Improvement: the loop continued after Eve shared and repeatedly handed control back to Adam.
  - New blocker: Eve had a visible Stage 2 context-share/review prompt (`Share this with Adam? Review`) after submitting her empathy draft, but the actor initially stopped instead of handling it. Adam then remained on the old waiting UI (`Eve needs to complete her Stage 2 perspective-taking step`) while Eve later reported Adam needed to review/approve.
  - Hard invariant: `db_stage_state_matches_stop_gate`.
  - DB evidence: Adam Stage 2 `IN_PROGRESS`, Eve Stage 2 `IN_PROGRESS`, Adam `EmpathyAttempt` `AWAITING_SHARING`, Eve `EmpathyAttempt` `READY`, no reveals/validations.
  - Follow-up patch: actor prompts now explicitly require handling Stage 2 post-empathy share/context review prompts before reporting wait or stage-limit status.

- `eval/runs/20260511-165705-adam-eve-iter-01`
  - After actor prompt tightening.
  - Score: `3.0`, `eval_fail`.
  - Improvement: both actors handled Stage 2 review surfaces more faithfully and Adam reached the refinement conversation after Eve shared context.
  - New blocker: after Adam received Eve's shared context, the UI did not keep the true revised empathy resubmit panel reliably available once the shared-context notification was viewed. Adam typed readiness/confirmation in chat instead of completing the durable resubmit lifecycle.
  - DB evidence: Adam `EmpathyAttempt` `REFINING`, Eve `EmpathyAttempt` `READY`, Stage 2 `IN_PROGRESS`.
  - Follow-up patch: `useChatUIState` now derives refinement mode from `myAttempt.status === REFINING`, not only `hasNewSharedContext`.

- `eval/runs/20260511-172244-adam-eve-iter-01`
  - After mobile refinement-panel patch.
  - Aborted/hung, not a valid baseline.
  - Improvement: Adam reached the refinement UI and shared updated Stage 2 context.
  - Blocker: the run got stuck behind an exchange-history bottom sheet overlay; controls were obscured and the actor could not complete the flow cleanly.
  - Follow-up patch: gold actor prompts now treat exchange-history surfaces as diagnostic only and instruct actors to dismiss/reload if they block Stage 2 work.

- `eval/runs/20260511-175041-adam-eve-iter-01`
  - After exchange-history actor prompt patch.
  - Score: `3.0`, `eval_fail`.
  - Improvement: Stage 1 felt-heard gates passed for both actors, Eve shared her empathy/context, Adam received Eve's context, and actor fidelity/MWF handling both scored `4`.
  - Hard invariants failed:
    - `stage_limit_reached_correctly`: Adam ended `bug_blocked`.
    - `db_stage_state_matches_stop_gate`: Adam `EmpathyAttempt` remained `REFINING`; Adam/Eve Stage 2 remained `IN_PROGRESS`.
  - DB evidence:
    - Adam attempt `cmp1xd03w005gpxx4v4gkhpp0`: `REFINING`, `revealedAt: null`, no validation.
    - Eve attempt `cmp1xles000abpxx4sod5l89k`: `READY`, `revealedAt: null`, no validation.
    - Adam had Stage 21 AI messages claiming the updated statement was shared, including `Your updated empathy statement has been shared with Eve.`, but persistence stayed behind.
  - Product blocker: typed Stage 2B share confirmation could produce a "shared" AI reply without calling the durable resubmit lifecycle.
  - Rejected approach: a backend typed-chat share confirmation patch was later reverted because gates must advance through real controls/CTAs, not regex chat matching.

- `eval/runs/20260511-182243-adam-eve-iter-01`
  - After mobile `REFINING` panel persistence and the now-reverted backend typed Stage 2B resubmit persistence.
  - Score: `4.1`, `eval_pass`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`; both revealed at `2026-05-12T01:46:04.283Z`.
    - Max `Message.stage`: `21`, with Adam's Stage 2B revised empathy persisted as an `EMPATHY_STATEMENT` and follow-up acknowledgment at Stage 2.
  - Flow evidence:
    - Adam shared initial Stage 2 empathy.
    - Eve shared empathy and additional context.
    - Adam revised after Eve's context, submitted the updated version, and validated Eve's empathy.
    - Eve validated Adam's updated empathy; app advanced both sides into Stage 3.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-182239-adam-eve-services/cleanup.json`.

- `eval/runs/20260511-185542-adam-eve-iter-01`
  - After adding current-user current-stage history as prompt continuity context.
  - Score: `3.75`, `eval_warn`; target `4.0` not reached.
  - Hard invariants: pass; no failed invariant checks.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`; both revealed at `2026-05-12T02:12:57.884Z`.
    - Max `Message.stage`: `21`.
  - Follow-up user direction: revert regex/chat-based Stage 2B sharing and ensure gate movement only happens via clicked controls/CTAs.

- `eval/runs/20260511-192128-adam-eve-iter-01`
  - After reverting typed-chat Stage 2B sharing and requiring actors to use visible gate CTAs.
  - Score: `2.8`, `eval_fail`; target `4.0` not reached.
  - Hard invariants failed:
    - `stage_limit_reached_correctly`: Adam ended `bug_blocked`.
    - `db_stage_state_matches_stop_gate`: Adam `EmpathyAttempt` stayed `REFINING`; Adam/Eve Stage 2 stayed `IN_PROGRESS`.
  - Product blocker: Adam received Eve's shared context and produced enough reflection for an updated empathy draft, but the visible review/resubmit CTA did not surface. The app had an optional context share suggestion competing for the same above-input slot, so Adam typed review/readiness in chat and the durable CTA/API lifecycle never completed.
  - Follow-up patch: optional share suggestions are now hidden while the user is in Stage 2 `REFINING`, allowing the required empathy revision panel (`Revisit what you'll share`) to take the CTA slot.

- `eval/runs/20260511-194717-adam-eve-iter-01`
  - After the Stage 2 refinement CTA priority fix, with typed-chat Stage 2B sharing still reverted.
  - Score: `4.0`, `eval_warn`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Adam clicked the initial empathy draft review/share path.
    - Eve clicked the empathy draft review/share path and the separate `Share This Version` context CTA.
    - Adam received Eve's shared context, saw the required `Revisit what you'll share` review card, opened it, and clicked `Resubmit`.
    - Adam validated Eve's empathy; Eve validated Adam's revised empathy.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`.
    - Adam validation timestamp: `2026-05-12T03:05:25.956Z`; Eve validation timestamp: `2026-05-12T03:06:20.856Z`.
    - Max message stage includes Stage 21 refinement messages, but durable `StageProgress` and `EmpathyAttempt` lifecycle state agree at the stop gate.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-194713-adam-eve-services/cleanup.json`.

- `eval/runs/20260511-201557-adam-eve-iter-01`
  - After confirmed-topic-frame context increment.
  - Score: `4.0`, `eval_warn`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Adam clicked topic approval, invitation share, Stage 1 felt-heard, initial empathy review/share, Stage 2 revision review/resubmit, and Eve-empathy validation controls.
    - Eve clicked Stage 1 felt-heard, empathy review/share, `Share This Version` for additional context, and Adam-empathy validation controls.
    - No regex/chat-based Stage 2B persistence path was present or used.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`.
    - Adam validation timestamp: `2026-05-12T03:39:13.597Z`; Eve validation timestamp: `2026-05-12T03:40:15.522Z`.
    - Both attempts revealed at `2026-05-12T03:38:55.853Z`.
  - Scorer notes:
    - Actor fidelity and MWF handling both scored `4`.
    - Improvement target: Stage 2 prompts sometimes ask what the partner needs "from you"; tighten this toward universal-person need framing without changing gates.
    - Product/UI target: waiting/share-offer UI still has some accessibility/friction issues, but did not block the CTA lifecycle.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-201553-adam-eve-services/cleanup.json`.

- `eval/runs/20260511-205113-adam-eve-iter-01`
  - After consented-share-state context increment.
  - Score: `4.0`, `eval_warn`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Adam clicked Stage 1 felt-heard, empathy draft review/share, revision review/resubmit after Eve's shared context, and Eve-empathy validation.
    - Eve clicked Stage 1 felt-heard, empathy draft review/share, `Share This Version` for additional context, and Adam-empathy validation.
    - No regex/chat-based Stage 2B persistence path was present or used.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`.
    - Both attempts revealed at `2026-05-12T04:11:38.238Z`.
    - Eve validated Adam at `2026-05-12T04:12:20.162Z`; Adam validated Eve at `2026-05-12T04:13:10.989Z`.
  - Scorer notes:
    - Actor fidelity and MWF handling both scored `4`.
    - Improvement target: Adam's Stage 2 draft/refinement path over-smoothed his uncertainty by keeping a confident "not about me being enough" claim.
    - Product/UI target: Eve saw a stale post-submit review/share panel after backend progress had continued.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-205108-adam-eve-services/cleanup.json`.

- `eval/runs/20260511-211928-adam-eve-iter-01`
  - After prior-stage-summaries context increment.
  - Score: `4.0`, `eval_warn`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Adam clicked topic approval, invitation share, Stage 1 felt-heard, initial empathy review/share, revision review/resubmit after Eve's shared context, and Eve-empathy validation.
    - Eve clicked Stage 1 felt-heard, empathy draft review/share, `Share This Version` for additional context, and Adam-empathy validation.
    - No regex/chat-based Stage 2B persistence path was present or used; durable movement came through review/share/resubmit/validation CTAs and the existing API lifecycle.
  - DB evidence:
    - Adam Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Eve Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Adam and Eve empathy attempts both `VALIDATED`.
    - Both attempts revealed at `2026-05-12T04:37:07.765Z`.
    - Adam validated Eve at `2026-05-12T04:37:19.965Z`; Eve validated Adam at `2026-05-12T04:38:26.911Z`.
  - Scorer notes:
    - Actor fidelity and MWF handling both scored `4`.
    - Improvement target: Adam's Stage 2 empathy synthesis partly imported Adam's fear that there may be no place for him instead of fully centering Eve's aliveness, shrinking, and need for truthful room.
    - Product/UI target: after Adam validated Eve's empathy, the UI still showed a generic chat input while copy said Adam was held for Eve; waiting states should disable or clearly relabel the input as private Inner Thoughts.
    - Prompt target: Eve received a share suggestion almost immediately after her first Stage 2 answer; it was helpful and consented, but the prompt should usually allow more resistance/curiosity before proposing shareable context.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-211924-adam-eve-services/cleanup.json`.

## James/Catherine Runs

- `eval/runs/20260511-214326-james-catherine-iter-01`
  - Cross-scenario validation after prior-stage-summaries context increment.
  - Score: `3.75`, `eval_warn`; target `4.0` not reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Catherine clicked topic approval/share invitation, Stage 1 felt-heard, empathy review/share, revised empathy review/resubmit after James's shared context, and James-empathy validation.
    - James clicked Stage 0 ready, Stage 1 felt-heard, empathy review/share, `Share This Version` for context, and Catherine-empathy validation.
    - No regex/chat-based Stage 2B persistence path was present or used; durable movement came through visible review/share/resubmit/validation CTAs and API lifecycle state.
  - DB evidence:
    - Catherine and James Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Catherine and James empathy attempts both `VALIDATED`.
    - Both attempts revealed at `2026-05-12T04:57:14.258Z`.
    - Catherine validated James at `2026-05-12T04:57:30.275Z`; James validated Catherine at `2026-05-12T04:58:22.405Z`.
  - Scorer notes:
    - Actor fidelity scored `4`.
    - MWF handling scored `3` because Catherine advanced through the Stage 1 felt-heard gate immediately after MWF asked what years of self-abandonment had done to her, before she answered that deeper question.
    - Eval-harness target: fix stage-specific transcript extraction; `catherine-stage2.md` omitted initial Stage 2 turns present in the full transcript, and the full transcript emitted stray `Stage 21` headings around revision/context-share events.
    - Product/UI target: Catherine still had a generic textbox visible while waiting on James review; waiting states should disable or clearly relabel the input as private Inner Thoughts.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-214322-james-catherine-services/cleanup.json`.

- `eval/runs/20260511-220512-james-catherine-iter-01`
  - After adding the Stage 1 minimum-turn guard for model-requested felt-heard checks.
  - Score: `4.0`, `eval_warn`; target `4.0` reached.
  - Hard invariants: pass; no failed invariant checks.
  - CTA-only flow evidence:
    - Catherine clicked topic/share invitation, Stage 1 felt-heard after additional witness turns, empathy review/share, revision review/resubmit after James's shared context and feedback, and James-empathy validation.
    - James clicked Stage 0 ready, Stage 1 felt-heard after additional witness turns, empathy review/share, `Share This Version` for context, revision review/resubmit after Catherine's context, and Catherine-empathy validation.
    - No regex/chat-based Stage 2B persistence path was present or used; durable movement came through visible review/share/resubmit/validation CTAs and API lifecycle state.
  - DB evidence:
    - Catherine and James Stage 0/1/2 `COMPLETED`, Stage 3 `IN_PROGRESS`.
    - Catherine and James empathy attempts both `VALIDATED`.
    - Both attempts revealed at `2026-05-12T05:37:54.916Z`.
    - Catherine validated James at `2026-05-12T05:38:19.432Z`; James validated Catherine at `2026-05-12T05:39:02.868Z`.
  - Scorer notes:
    - Actor fidelity scored `4`.
    - MWF handling scored `4`.
    - Improvement target: review Stage 2 facilitator phrasing for repeated praise / rubric-shaped transitions.
    - Improvement target: inspect Catherine-side review copy that may briefly misattribute the addressee during the review flow.
  - Services cleanup: backend and web both stopped cleanly in `eval/runs/20260511-220508-james-catherine-services/cleanup.json`.

## Current Status

Adam/Eve and James/Catherine Stage 2 durable gates are clean through CTA/API lifecycle state:

- The latest Adam/Eve CTA-only run completed Stage 2 for both users with score `4.0` and hard invariants passing.
- The latest James/Catherine CTA-only run completed Stage 2 for both users with score `4.0` and hard invariants passing after the Stage 1 felt-heard turn guard.
- Both `EmpathyAttempt` rows are `VALIDATED` in both latest scenario runs.
- Stage 3 is `IN_PROGRESS` for both users after validation in both latest scenario runs.
- No regex or typed-chat Stage 2B sharing path is present; progress moved through review/share/resubmit CTAs and the existing API lifecycle.
- Current-stage history has been reintroduced as the first context increment.
- Confirmed topic frame has been reintroduced as the second context increment.
- Consented partner/share lifecycle state has been reintroduced as the third context increment and passed Adam/Eve gate verification.
- Prior-stage summaries have been reintroduced as the fourth context increment and passed Adam/Eve gate verification.
- Durable process facts decision: no separate durable-process-facts memory channel is being added. The needed process facts are already typed and auditable through `Session.topicFrameConfirmedAt`, `StageProgress`, `EmpathyAttempt`/share lifecycle rows, and `Message.stage`-scoped history. Prompt rendering labels all of these as orientation/continuity only, with gates still sourced from `StageProgress` and lifecycle tables.
- Next broader-goal step is final audit before closing the restart goal.

## Residual Risks

- Per-stage transcript extraction can omit some Stage 2 context from the stage-specific artifact even when the full transcript has it.
- One Adam Stage 1 reflection rendered malformed copy: `it doesnt feel likeand also this"`.
- Stage 2 prompt wording sometimes says what the partner needs "from you"; this can drift toward partner-specific reassurance and should be tightened to universal-person need framing.
- Adam's Stage 2 draft/refinement path can over-smooth his live uncertainty into too-confident empathy wording.
- Waiting states can leave a generic chat input visible after validation even when copy says the user is being held for partner review.
- Eve can see stale post-submit review/share or waiting copy after backend progress has already moved forward.
- Stage 2 share suggestions can appear very early in a user's perspective-taking turn; keep monitoring whether this crowds out resistance before share consent.
- UI/accessibility friction remains around share-offer/review surfaces, though the latest CTA-only run completed despite it.
- James/Catherine now reaches the Stage 2 target, but scorer still recommends human review of formulaic Stage 2 praise / transition language.
- Catherine-side Stage 2 review copy may briefly misattribute the addressee during review flow; inspect before broadening scenario scope.
