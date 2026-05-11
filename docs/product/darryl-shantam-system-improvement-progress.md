# Darryl/Shantam System Improvement Progress

Date: 2026-05-11

## Pre-Patch Diagnosis

Starting run: `eval/runs/20260510-222945-darryl-shantam-iter-01`

Starting score:

- `overall_score`: `3.5`
- `verdict`: `eval_fail`
- `actor_fidelity`: `4`, pass
- `mwf_handling`: `3`, fail
- hard invariants: pass

Required proposal-mode improver command:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py improve-run \
  eval/runs/20260510-222945-darryl-shantam-iter-01 \
  --scenario darryl-shantam \
  --improvement-mode proposal
```

Output read:

- `eval/runs/20260510-222945-darryl-shantam-iter-01/improvement-plan.md`
- `eval/prompt-versions/mwf/darryl-shantam/v01.md`

Accepted proposal suggestions:

- Add Stage 1 disputed-fact neutrality so MWF validates Darryl's health/sanitation boundary without treating Shantam's responsibility or motive as settled fact. Owner: `mwf_prompts`.
- Add Stage 2 concrete-conflict sufficiency/low-knowledge guidance so bounded observational empathy can satisfy readiness without shame, pride, reputation, or hidden-state speculation. Owner: `mwf_prompts`.
- Fix stale participant-name/privacy-review copy by avoiding LLM-generated names in the Stage 2 revision acknowledgment or constraining the copy to current session names only. Owner: `product_code`.

Deferred proposal suggestions:

- Full Stage 2 delivery/status-label cleanup is real but broader than the minimum score blocker. I will make only cheap, low-risk copy simplifications if the relevant rendering code is clearly local; otherwise this remains tracked as `product_code`.
- No actor-skill changes. Actor fidelity passed and the scorer routed no target to `actor_skill`.
- No eval-harness changes yet. Hard invariants passed and transcripts were complete enough to score the issue.

Failure classifications:

- Stage 2 over-extension into speculative shame, pride, reputation, or hidden inner states after concrete low-knowledge empathy attempts: `mwf_prompts`.
- Stage 1 over-validation of Darryl's disputed interpretation, including "got blown off" and "handle it or we have a problem": `mwf_prompts`.
- Stale participant-name/privacy-review copy mentioning `Priya` in Shantam's Darryl/Shantam run: `product_code`.
- Confusing Stage 2 draft states such as submitted, pending review, not delivered, updated below, on its way, and empathy shared overlapping: `product_code`.
- Stage 2 ready-to-share threshold relying too heavily on generic turn count for terse users who already produced responsible low-knowledge observational empathy: `mwf_prompts`.
- Need for human calibration of the first prompt-quality-evaluable Darryl/Shantam score: `human_review`.

Patch plan:

- Keep production edits narrow: `backend/src/services/stage-prompts.ts`, Stage 2 revision acknowledgment copy in `backend/src/controllers/stage2.ts`, and focused tests.
- Add prompt assertions for Stage 1 disputed-fact neutrality, Stage 2 low-knowledge/process-frustration strategy adaptation, and earlier readiness for bounded observational empathy.
- Add or update copy coverage so Stage 2 privacy-review copy cannot emit stale fixture names such as `Priya`.

## Changes Made

Changed files:

- `backend/src/services/stage-prompts.ts`
- `backend/src/controllers/stage2.ts`
- `backend/src/controllers/__tests__/stage2-copy.test.ts`
- `backend/src/services/__tests__/stage-prompts.test.ts`
- `mobile/src/components/ChatBubble.tsx`
- `mobile/src/components/chat/renderers/EmpathyStatementRenderer.tsx`
- `mobile/src/components/chat/renderers/SharedContextRenderer.tsx`
- `mobile/src/components/TimelineItemCard.tsx`
- `scripts/mwf_gold_loop.py`
- `scripts/test_mwf_gold_loop.py`
- `backend/src/routes/__tests__/stage2.test.ts`

Prompt/product changes:

- Stage 1 now tells the facilitator to validate impact and boundary seriousness without settling disputed responsibility, intent, motive, or proof.
- Stage 2 now treats low-knowledge observational empathy as valid information, pivots after repeated "I don't know" / process-frustration signals, and allows bounded concrete drafts without forced shame/pride/reputation speculation.
- Stage 2 concrete-conflict guidance now preserves non-concession boundaries and avoids pushing "what do they need from you" / "investigate as a team" repair language when the user has already named observable impact.
- Stage 2 process praise was reduced in prompt guidance; deterministic revision-review copy now avoids LLM-generated stale names.
- Stage 0 prompt guidance now accepts a concrete issue plus desired outcome without extra proof/frequency/timeline probing and preserves child/bathroom/property-boundary specificity.
- Mobile draft/status labels were simplified from delivery-like labels to review-state labels (`Submitted for review`, `Updated version below`).
- Gold-loop actor prompt was adjusted so "with partner" headers and compact "Ready" screens are not misclassified as wrong-side privacy bugs.
- Stage 2 post-share copy now avoids promising immediate partner validation/reveal while the privacy-protected review is still pending.
- Stage 2 validation now rejects attempts to validate partner empathy before the partner attempt is actually revealable.
- Gold-loop stop logic now treats mutual Stage 2 partner-wait states as a valid `--stop-after-stage 2` boundary while keeping Stage 4 partner-wait handling strict.
- After a post-regression Darryl/Shantam rerun dropped to `3.5`, Stage 2 prompt guidance was tightened again so low-knowledge concrete-boundary drafts do not turn tentative hypotheses into settled motive, unchosen shame, or bad-parent language, and the Stage 1 -> Stage 2 transition more explicitly blocks generic process applause.
- After the next Darryl/Shantam rerun still scored `3.5`, the target shifted to `product_code`: the UI could leave stale Stage 1 feel-heard panel text visible after Stage 2 began, and the Stage 2 share acknowledgment was still generated by an LLM with generic praise. The feel-heard panel is now gated to Stage 1 only, and Stage 2 share acknowledgments are deterministic.
- After another Darryl/Shantam rerun stayed at `3.5`, the remaining product blocker was the Stage 2 optional share-suggestion path interrupting normal empathy reveal/review. Post-share routing now treats `OFFER_OPTIONAL` as non-blocking; only `OFFER_SHARING` or significant gaps pause for extra context.
- After the next rerun improved only to `3.6`, the scorer still treated pre-review context sharing as the blocker. Post-both-submitted Stage 2 routing now forces the normal empathy reveal/review path first instead of pausing for share suggestions.
- After the next rerun stayed at `3.6`, the remaining shared-context interruption was traced to the asymmetric `runReconcilerForDirection` path triggered when a partner completes Stage 1 while the other partner's empathy attempt is still `HELD`. That path now records the reconciler analysis but marks the attempt `READY` for first reveal instead of creating an `AWAITING_SHARING` share suggestion before partner review. The Stage 1 -> Stage 2 transition message is now deterministic because the LLM transition repeatedly reintroduced banned process praise such as "what you just did really mattered" and "protected attempt".
- After the next rerun scored `3.5`, the share-routing bug was gone and both empathy statements revealed cleanly, but the scorer target moved back to `mwf_prompts`: Shantam's Stage 2 was over-shaped into action commitments (`I will do those things`) before the needs/strategy stages. Stage 2 prompt guidance now hard-separates perspective-taking from commitments, blocks "what does Partner need from you" questions, and catches sanitation-boundary empathy as ready before the model mines for action promises.
- After Darryl/Shantam passed, the Adam/Eve regression gate scored `3.5`. This is a true shared Stage 2 prompt risk, not a Darryl/Shantam-only artifact: the concrete-boundary fast path is helpful for sanitation/property disputes, but relational identity conflicts need more resistance pacing before drafting. Stage 2 prompt guidance now distinguishes relational/identity conflicts from concrete boundary conflicts, mirrors unfairness/exhaustion before bridging, and blocks "if you had to guess" as the first move after resistance.

## Validation Commands

Passed:

```bash
python3 scripts/test_mwf_moment_eval.py
python3 -m py_compile scripts/mwf_gold_loop.py
npm test --workspace backend -- stage-prompts.test.ts stage2-copy.test.ts
npm run check --workspace backend
npm run check --prefix mobile
```

Focused backend tests passed with 116 tests after the prompt/copy assertions were added.

Additional regression-fix validation passed:

```bash
python3 -m py_compile scripts/mwf_gold_loop.py
python3 -m unittest scripts/test_mwf_gold_loop.py
npm test --workspace backend -- stage2-copy.test.ts stage2.test.ts
python3 scripts/test_mwf_moment_eval.py
npm run check --workspace backend
npm run check --prefix mobile
```

The added harness tests cover Stage 2 partner-wait stop-boundary behavior and preserve strict Stage 4 waiting behavior. The added backend route test verifies pre-reveal partner empathy validation returns `409` without writing a validation record.

Additional Darryl/Shantam rerun prompt-fix validation passed:

```bash
npm test --workspace backend -- stage-prompts.test.ts stage2-copy.test.ts stage2.test.ts
python3 -m unittest scripts/test_mwf_gold_loop.py
npm run check --workspace backend
python3 scripts/test_mwf_moment_eval.py
```

Additional product-state/copy validation passed:

```bash
npm test --workspace backend -- stage2-copy.test.ts stage2.test.ts stage-prompts.test.ts
npm run check --prefix mobile
npm run check --workspace backend
```

Additional reveal-first routing validation passed:

```bash
npm test --workspace backend -- stage2-copy.test.ts stage2.test.ts
npm run check --workspace backend
```

Additional optional-share routing validation passed:

```bash
npm test --workspace backend -- stage2-copy.test.ts stage2.test.ts
npm run check --workspace backend
```

Additional asymmetric reveal-first validation passed:

```bash
npm test --workspace backend -- stage2-copy.test.ts reconciler.test.ts stage2.test.ts
npm run check --workspace backend
```

Additional James/Catherine safety/volatility and revision-wait validation passed:

```bash
npm test --prefix mobile -- getWaitingStatus.test.ts chatUIState.test.ts
npm run check --prefix mobile
npm test --workspace backend -- stage-prompts.test.ts stage2-copy.test.ts
npm run check --workspace backend
```

## Gold Loop Runs

Starting evidence:

- `eval/runs/20260510-222945-darryl-shantam-iter-01`: score `3.5`, `eval_fail`.

Darryl/Shantam patch-validation runs:

- `eval/runs/20260510-232858-darryl-shantam-iter-01`: score `3.75`, `eval_fail`.
- `eval/runs/20260511-000121-darryl-shantam-iter-01`: score `3.7`, `eval_fail`.
- `eval/runs/20260511-003602-darryl-shantam-iter-01`: score `1.5`, not prompt-evaluable; actor/harness misread the partner-name header as wrong-side access.
- `eval/runs/20260511-005019-darryl-shantam-iter-01`: score `4.0`, `eval_warn`; target reached for Darryl/Shantam Stage 0-2.
- `eval/runs/20260511-022659-darryl-shantam-iter-01`: score `3.5`, `eval_fail`; post-regression-fix rerun exposed a remaining Stage 2 prompt issue on Darryl's side. Scorer target: `mwf_prompts`, because the draft added stronger motive/shame/bad-parent language than Darryl's guarded low-knowledge attempt supported. Prompt tightened after this run.
- `eval/runs/20260511-024847-darryl-shantam-iter-01`: score `3.5`, `eval_fail`; next rerun improved the draft but exposed a `product_code` blocker: stale Stage 1 feel-heard checkbox text appeared at the start of Darryl Stage 2, and Stage 2 share acknowledgment still used generic courage/praise language. Product-state/copy fixes applied after this run.
- `eval/runs/20260511-031011-darryl-shantam-iter-01`: score `3.5`, `eval_fail`; product-state rerun removed the stale panel, but the scorer still failed the run because optional self-focused share suggestions appeared before the gold-aligned empathy reveal/review path. Optional-share routing fix applied after this run.
- `eval/runs/20260511-032730-darryl-shantam-iter-01`: score `3.6`, `eval_fail`; optional-share routing improved the run but a required share suggestion still interrupted the empathy reveal/review path. Reveal-first routing fix applied after this run.
- `eval/runs/20260511-034644-darryl-shantam-iter-01`: score `3.6`, `eval_fail`; post-both-submitted routing did not cover the earlier asymmetric reconciler path. Darryl still saw Shantam's separate shared-context suggestion before a clean partner empathy review, and Darryl's Stage 2 opener still contained process-heavy "protected attempt" framing. Asymmetric reveal-first routing and deterministic transition copy applied after this run.
- `eval/runs/20260511-040718-darryl-shantam-iter-01`: score `3.5`, `eval_fail`; product routing improved, hard invariants passed, actor fidelity passed, and both empathy attempts revealed for review. The remaining blocker is prompt overreach: Shantam's Stage 2 draft includes premature action commitments before needs/strategy work. Understanding-only Stage 2 prompt fix applied after this run.
- `eval/runs/20260511-042105-darryl-shantam-iter-01`: score `4.0`, `eval_pass`; Darryl/Shantam target reached again. Actor fidelity passed, MWF handling passed, and hard invariants passed. Minor scorer note remains that Darryl's Stage 2 prompt can still lightly risk "what might Shantam need from Darryl" responsibility-shift language, but it did not block the target.

Regression gates:

- `eval/runs/20260511-012149-adam-eve-iter-01`: score `3.0`, `eval_fail`. This is a real regression-gate failure. The top target is `product_code`: Stage 2 post-empathy-share state promised partner validation/reveal before the partner empathy attempt was revealable, leaving Eve in `bug_blocked`.
- `eval/runs/20260511-043544-adam-eve-iter-01`: score `3.5`, `eval_fail`. Fresh sequential gate after Darryl/Shantam passed. Actor fidelity and invariants passed, but MWF handling failed because Eve's Stage 2 moved from one resistant turn to a draft too quickly and missed deeper gold beats around Adam's not-enoughness, identity, and right-person fear. Relational/identity Stage 2 pacing fix applied after this run.
- `eval/runs/20260511-045258-adam-eve-iter-01`: score `4.0`, `eval_warn`. Fresh rerun after the relational/identity Stage 2 pacing fix. Actor fidelity passed, MWF handling passed, and no hard invariants failed. Remaining warnings are non-blocking review items: Eve's Stage 1 accepted felt-heard after a relatively compact exchange, and Eve's legitimate Stage 2 partner-wait state still leaves a visible chat input that could invite filler.
- `eval/runs/20260511-012149-james-catherine-iter-01`: score `3.0`, `eval_fail`, contaminated by parallel regression service contention; ports `3000` and `8082` were unavailable mid-run.
- `eval/runs/20260511-014934-james-catherine-iter-01`: clean sequential rerun, explicitly stopped after more than 30 minutes. It did not reach a score because it kept alternating Stage 2 partner-wait/review continuations instead of reaching the stop-after-stage-2 gate. This is a regression-gate blocker in `product_code`/`eval_harness`, not a clean prompt score.
- `eval/runs/20260511-051157-james-catherine-iter-01`: score `3.5`, `eval_fail`. Fresh rerun after the Stage 2 stop-boundary harness fix reached a clean score, so the harness blocker is resolved. Actor fidelity and invariants passed, but MWF handling failed: Stage 2 drafted too quickly for the high-resistance James/Catherine safety/volatility pattern, and Stage 1 sometimes sounded like it adopted contested blame frames as fact. High-conflict Stage 1 neutrality and Stage 2 volatility-pacing prompt fixes applied after this run.
- `eval/runs/20260511-053006-james-catherine-iter-01`: score `3.6`, `eval_fail`. The high-conflict patch improved James's side: James actor fidelity passed and James MWF guidance passed. Remaining failure is Catherine Stage 2: the draft was too diagnostic/impact-heavy before reveal ("collapse/attacking", "scared me"), so James appropriately sent feedback that his humiliation/erasure was missing. Inside-frame safety/volatility draft guard applied after this run.
- `eval/runs/20260511-054605-james-catherine-iter-01`: score `3.8`, `eval_warn`. Actor fidelity, MWF handling, and hard invariants passed, but product reliability failed because after James requested a revision the validation controls disappeared and the UI left a generic input instead of a clear partner-revision wait state. Stage 2 partner-revising waiting UI fix applied after this run.
- `eval/runs/20260511-060948-james-catherine-iter-01`: score `3.7`, `eval_warn`. Product behavior improved, but MWF handling failed because Catherine's revised draft still used diagnostic phrases such as "the story you need about yourself" / "brittle" for a partner who had objected to being analyzed. Prompt guard tightened to ban those diagnostic formulations unless user-chosen and prefer inside-frame recognition language.
- `eval/runs/20260511-062632-james-catherine-iter-01`: score `4.0`, `eval_warn`. Fresh rerun after the diagnostic-phrase guard and partner-revising UI fix. Actor fidelity passed, MWF handling passed, product reliability passed at threshold, and hard invariants passed. Remaining non-blocking warning: Catherine's Stage 2 message stream timed out once and recovered after reload.

Regression-blocker fixes applied after these runs:

- Adam/Eve product-state blocker: fixed Stage 2 post-share copy so it no longer promises partner validation/reveal before the partner attempt is revealable, and added a server guard against pre-reveal validation.
- Adam/Eve relational-pacing blocker: fixed Stage 2 prompt guidance so relational/identity conflicts hold unfairness, cost, fear, and identity before drafting. Fresh Adam/Eve rerun now passes at `4.0`.
- James/Catherine harness blocker: fixed `--stop-after-stage 2` orchestration so mutual Stage 2 partner-wait states can terminate and score instead of cycling indefinitely.
- James/Catherine prompt blocker: added Stage 1 contested-causal-story neutrality and Stage 2 safety/volatility/diagnosis pacing so a narrow acknowledgment that the partner may feel tense/unsafe does not immediately produce a draft.
- James/Catherine inside-frame draft blocker: added safety/volatility draft rules to avoid clinical/impact-heavy conclusions such as "you collapse or attack" or "you have to face that you scared me" unless explicitly chosen, and to foreground partner-inside-frame feelings like humiliation, erasure, or fear that care does not count.
- James/Catherine revision-wait blocker: added an explicit Stage 2 partner-revising waiting status so feedback on a partner empathy attempt hides the generic input and tells the user the partner is revising.
- James/Catherine diagnostic-phrase blocker: banned high-risk characterological formulations such as "the story you need about yourself", "you are brittle", and "you defend your goodness" unless user-chosen, with tests for inside-frame alternatives.

Loop summaries:

- `eval/runs/20260511-005019-darryl-shantam-loop-summary.md`
- `eval/runs/20260511-012149-adam-eve-loop-summary.md`
- `eval/runs/20260511-045258-adam-eve-loop-summary.md`
- `eval/runs/20260511-012149-james-catherine-loop-summary.md`
- `eval/runs/20260511-051157-james-catherine-loop-summary.md`
- `eval/runs/20260511-053006-james-catherine-loop-summary.md`
- `eval/runs/20260511-062632-james-catherine-loop-summary.md`

## Decisions And Risks

- Darryl/Shantam target is passing again on the fresh `20260511-042105` run, with score `4.0` and `eval_pass`.
- Adam/Eve regression is now passing on the fresh `20260511-045258` run, with score `4.0` and `eval_warn`. The warning items should be tracked, but they do not block the Stage 0-2 regression gate.
- James/Catherine regression is now passing on the fresh `20260511-062632` run, with score `4.0` and `eval_warn`. Actor fidelity, MWF handling, and hard invariants pass; product reliability passes at threshold with a non-blocking recovered stream-timeout warning.
- I did not weaken the Darryl/Shantam Stage 2 prompt fixes to appease the regression artifacts; the failing regression targets are product/eval state handling, not evidence that low-knowledge observational empathy should be removed.
- The Stage 0-2 target is met for Darryl/Shantam, with Adam/Eve and James/Catherine regression gates passing. Remaining follow-up risk is product reliability around occasional live stream timeout/reload recovery during Stage 2.
