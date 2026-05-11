# MWF Holistic Self-Improvement Plan

Date: 2026-05-11

## Situation

Recent Slack analysis, GitHub issues, and local gold-loop artifacts all point to the same failure: MWF can satisfy stage machinery while still failing as a facilitator.

The Darryl/Shantam session exposed failures that the Adam/Eve and James/Catherine gold loops did not catch:

- Stage 1 can advance after competent reflections without a real witnessing arc.
- Stage 2 can keep asking the same empathy-shaping question after the user has made clear they cannot answer it.
- Major situation shifts, such as a confession or user frustration with the app, are not promoted into durable facilitation state.
- Empathy revision can loop on unchanged text, creating repeated partner review notifications for the same failed statement.
- The Stage 0 topic frame existed but was not passed into the main stage prompt path for Stages 1-4.

GitHub issue references:

- #531: Prompt architecture improvements from Darryl/Shantam session analysis.
- #532: Pass `topicFrame` to stage prompts.
- #533: Block identical empathy statement resubmission.
- #436/#437: Self-refining evaluation loop and expert review.
- #244: Golden reference evaluation harness.

## Quick Fix PRs Already In Flight

Several confirmed product bugs are already covered by bot PRs:

- #528: fixes the current production Stage 3 blocker from the Darryl/Shantam session.
  - Closes the ActivityDrawer overlay when `visible` flips false, so the invisible full-screen overlay no longer swallows taps and makes the needs review drawer appear broken.
  - Makes the needs card theme-aware, fixing the dark card/CTA styling in light mode.
  - Keeps the chat composer available during `needs-review` and `needs-share`, hiding it only for `needs-reveal-validation`.
- #530: fixes the typing indicator in needs-stage conversations after synthetic assistant/system messages are appended after the newest user message.
- #538: pass `session.topicFrame` into `buildStagePrompt` so Stages 1-4 retain the Stage 0 topic anchor. This PR covers both the main `sendMessageStream` path and the `confirmFeelHeard` Stage 1-to-2 transition path.
- #539: reject normalized identical empathy resubmissions before continuing the revision flow, and surface the backend validation error in mobile as a toast.

Verification focus:

- #538 should be verified in a real or E2E session by confirming Stage 1+ prompts carry the Stage 0 topic frame.
- #539 should be verified by trying to resubmit unchanged empathy text and confirming no new partner review notification is emitted.
- #528 should be merged/deployed before continuing production testing because it removes the exact current live-session UI blockers: needs drawer does not open, dark light-mode styling, and no chat input.
- #530 should be merged alongside #528 if human review passes, because it is nearby needs-stage feedback-loop polish and already has a focused regression test.

## Diagnosis

The current loop is not useless. It already runs full scenarios and has real artifacts. The gap is coverage and judgment shape.

Current evidence from local `eval/runs`:

- The latest full-flow Stage 4 Adam/Eve run scored `3.2` and still had product/eval targets around open needs, closure, and seeded transcript reliability.
- The latest full-flow Stage 4 James/Catherine run scored `3.0` and still had product/prompt targets around malformed proposal capture and no-agreement closure.
- Many older runs are `not_evaluable_for_prompt_quality` in sections because target-stage seeding or transcript extraction made the scorer unable to judge the actual dialogue arc.

The loop currently over-indexes on:

- cooperative intimate-partner profiles,
- per-stage or per-artifact success,
- moment quality,
- hard product invariants.

It under-measures:

- whole-conversation arc quality,
- low-engagement and short-answer users,
- non-intimate relationships where perspective-taking must be observational rather than mind-reading,
- process frustration,
- factual instability inside one user track,
- repeated failed revision cycles,
- whether the AI changes strategy when the current strategy is not working.

Context diagnosis:

- The answer is not to dump the whole conversation history into every stage prompt.
- Stage prompts need enough recent turns to preserve conversational continuity, but the durable layer should be compact and curated.
- The missing layer is facilitation state: facts about what has happened in the process, what strategies have failed, what the user cannot reasonably know, what the user has rejected, and what the AI must not keep asking.
- Raw history is useful for audits, judge passes, and targeted debugging. Runtime prompts should receive a working memory that is concise enough to steer the next response.

Snapshot/process diagnosis from the long Codex calibration session:

- The 2026-05-07 to 2026-05-08 Stage 3/4 goal session spent too much time replaying from too-early snapshots and revalidating moments that had already passed.
- It did not consistently promote newly verified mid-flow states into clean reusable snapshots.
- It drifted into local post-hoc fixes, especially Stage 4 capture regex carve-outs, instead of diagnosing the true failure owner first.
- The follow-up session succeeded only after a supplement forced diagnosis-first work, banned new carve-outs, required typed upstream capture, and required both fresh scenarios to pass through proposal selection and closure.
- The self-improvement loop should treat that as an eval-machine failure mode: without clean snapshot discipline and ownership routing, it will grind instead of learning.

## Darryl/Shantam Production Session Evidence

Session analyzed: `cmoyye2jc001fmp1xv3ys1ntv`.

Local extracted transcripts:

- `backend/scripts/transcripts/transcript_Darryl_cmoyye2j.md`
- `backend/scripts/transcripts/transcript_Shantam_cmoyye2j.md`

Do not commit those raw production transcripts as gold source material. Use them as evidence for a sanitized, privacy-correct gold scenario.

Observed state:

- Stage 0, Stage 1, and Stage 2 are complete for both participants.
- Stage 3 is in progress for both participants.
- Both users have a captured need.
- Darryl's need is concrete and low-interpretation: a lawn free of human waste / no health risk or contamination.
- Shantam's captured needs are broader and inner-work oriented: regular practice that creates inner quiet, ability to listen/respond without stress and reactivity, and showing up as the person he wants to be.
- The reconciler repeatedly produced `OFFER_SHARING` without usable `suggestedShareContent`, which should become a hard product invariant.

What the live session adds beyond Adam/Eve and James/Catherine:

- The relationship is not intimate-partner repair. It is a neighbor/community conflict with lower shared history and less license for mind-reading.
- One side is terse, concrete, and frustrated by repeated process questions.
- "I don't know what is going on for him" is a valid answer, not a failure to empathize.
- Stage 2 should switch strategy to observational empathy and sentence scaffolding when the user cannot infer private inner state.
- Stage 3 must accept simple concrete needs without forcing therapeutic depth.
- The product UI must remain usable while needs are being reviewed; otherwise prompt quality cannot be evaluated.

## Improvement Strategy

### 1. Keep The Quick Fixes

These should land first because they remove obvious noise from the next validation run:

- Topic frame passthrough.
- Unchanged empathy resubmission guard.

Acceptance:

- Focused backend tests pass.
- The next gold run transcripts show a visible `CONVERSATION TOPIC` anchor in stage prompts.
- Replaying a rejected empathy attempt with identical content fails before notification/reconciler work.

### 2. Add A Darryl/Shantam Gold Scenario

Use the real production failure as the third gold scenario, but do not overfit to the literal incident.

Scenario class:

- non-intimate relationship,
- short-answer / low-engagement participant,
- one participant with incomplete or shifting facts,
- Stage 2 user says "I don't know" and means it,
- user frustration with the process,
- empathy revision rejects the same wrong premise more than once.

Artifacts to add:

- `docs/product/source-material/golden-transcripts/darryl-shantam.md`
- `eval/gold-profiles/darryl-shantam.json`
- `eval/gold-scenarios.json` entry with a required bounded Stage 2 gate.
- `eval/moments/darryl-shantam-stage-2-low-knowledge-pivot.yaml`
- `eval/moments/darryl-shantam-stage-3-concrete-need-capture.yaml`
- `eval/moments/darryl-shantam-stage-3-offer-sharing-content.yaml`
- Moment coverage for:
  - Stage 1 arc depth, not just feel-heard acknowledgement.
  - Stage 2 "I don't know them like that" pivot.
  - confession/frame-change handling.
  - repeated validation rejection.
  - unchanged empathy resubmission product invariant.

Gold transcript constraints:

- Preserve privacy boundaries. Shantam-side MWF may know the shared topic frame during private stages, but must not know Darryl's private raw track unless it has been consented through share/validation.
- The sanitized transcript can include a companion scenario-notes section, but the parseable transcript should follow the same shape as Adam/Eve and James/Catherine: stage headings, side labels, `**MWF:**`, user lines, and bracketed approved artifacts.
- Keep design commentary out of the canonical transcript. Put rationale in a separate notes file or the gold profile.
- The Stage 3 gold should include the current stopping point: both needs captured and ready for review/share, without pretending Stage 4 happened.

Expected gold behavior through the current stopping point:

- Darryl Stage 2: after one or two failed inference attempts, MWF says in effect: "You may not know his inner world. Work from what you can observe." Then it scaffolds a sentence about Shantam perhaps not realizing the impact, without claiming certainty.
- Shantam Stage 2: MWF anchors to the confirmed topic frame instead of following unrelated preschool/teacher facts as if they were the conflict. It can ask for Shantam's understanding of the yard/human-waste issue, but cannot reveal Darryl's private framing.
- Darryl Stage 3: MWF captures the concrete health/sanitation need quickly and does not keep asking for deeper meaning after the user says the answer is simple.
- Shantam Stage 3: MWF can help distinguish practice/inner quiet/listening from generalized self-improvement, then capture concise needs without looping.
- Reconciler: when it offers sharing, it must include usable suggested share content or mark the offer as unavailable. Empty offer content is a product failure.

### 3. Add An Arc-Level Judge

Do not replace moment scoring. Add a second pass that evaluates the whole stage transcript before assigning pass/fail.

The judge should answer:

- Did the stage accomplish its human purpose?
- Did MWF notice whether the user was engaged, frustrated, blocked, or changing the facts?
- Did MWF change approach when its current approach was not working?
- Did the transition feel earned, or did the system accept a checkbox answer?
- Did MWF avoid asking the user to infer what they cannot reasonably know?
- Did MWF preserve the Stage 0 topic frame and consent boundaries across later stages?
- Did MWF remember and respond to process facts from earlier in the same user's track?
- Did MWF course-correct after repeated user confusion, rejection, or low-engagement answers?
- Did the whole flow work as facilitation, not just as stage completion?

This should produce structured fields in `score.json`, for example:

- `conversation_arc.stage1.depth_score`
- `conversation_arc.stage2.strategy_adaptation`
- `conversation_arc.stage2.user_frustration_handled`
- `conversation_arc.stage2.revision_loop_integrity`
- `conversation_arc.transition_earned`
- `conversation_arc.topic_frame_continuity`
- `conversation_arc.process_memory_used`
- `conversation_arc.whole_flow_quality`
- `conversation_arc.course_correction_quality`

Judge contract:

- The arc judge must read the whole stage transcript, not isolated moments.
- For full-flow gates, the judge must read the whole scenario trajectory through the target stage and decide whether the facilitator arc worked.
- The judge must separate product/harness failures from prompt-quality failures. If transcripts truncate, UI blocks progress, or actors stop early, mark prompt-quality evidence as lower-confidence rather than tuning prompts from bad data.
- The judge must identify the owner for each failure: `mwf_prompts`, `product_code`, `eval_harness`, `actor_skill`, `snapshot_registry`, or `human_review`.
- The judge may recommend a snapshot replay for a later-stage product bug, but it cannot treat snapshot replay as proof that early-stage pacing or whole-flow facilitation is good.

### 4. Promote Process Facts Into Durable Context

The product needs situation/process state, not just stage state.

Add or extend notable facts so the prompt can see durable observations like:

- user has said they do not know the partner's inner state,
- user has pushed back on the same prompt pattern,
- user expressed frustration with the app,
- user disclosed a fact that changes the frame,
- user is relying on a premise the partner rejected,
- empathy statement has been rejected with the same core feedback.

This should be general facilitation memory, not a brittle repetition counter.

Runtime context contract:

- Stage prompts should receive:
  - the Stage 0 topic frame,
  - a rolling summary of the current user's track,
  - a bounded recent-turn window,
  - consent/shared-state context,
  - durable process facts,
  - approved notable facts and user memories.
- Stage prompts should not receive:
  - the partner's private raw track before consent,
  - unlimited raw transcript history by default,
  - unvetted summary guesses that imply the partner privately said something they did not share.
- The prompt budget should prefer compact state over raw history. Expanding the recent-turn window is allowed when a stage genuinely needs more continuity, but it should not substitute for better summarization.
- Process facts should be presented separately from biographical/emotional notable facts so the model can tell "what is true about the user" from "what has happened in this facilitation process."

Suggested process-fact categories:

- `strategy_blocked`: the current prompt pattern is not working.
- `low_knowledge`: user cannot reasonably infer the partner's inner state.
- `process_frustration`: user is frustrated with the app or repeated questions.
- `frame_shift`: a confession, correction, or new fact changes the topic frame.
- `rejected_premise`: partner or validation feedback rejected a core premise.
- `repeat_rejection`: the same empathy/share/revision failure recurred.
- `concrete_need_ready`: user has stated a simple need and MWF should not force extra depth.
- `transition_risk`: user gave a shallow yes/ready signal that may not mean the stage purpose is complete.

Acceptance:

- A Darryl/Shantam Stage 2 prompt should know that "I don't know what is going on for him" is a valid constraint and should switch to observational empathy.
- A Stage 3 prompt should know when a concrete need has already been captured and should stop re-asking for deeper meaning.
- A repeated rejected empathy premise should be visible to the prompt and block the same premise from being resent.
- The context renderer should make these facts auditable in prompt logs without exposing private partner content.

### 5. Make The New Validation Gate Harder

The next real validation loop should run:

```bash
python3 scripts/mwf_gold_loop.py run --scenario adam-eve --stop-after-stage 2 --target-score 4.0 --max-iterations 1 --start-services
python3 scripts/mwf_gold_loop.py run --scenario james-catherine --stop-after-stage 2 --target-score 4.0 --max-iterations 1 --start-services
python3 scripts/mwf_gold_loop.py run --scenario darryl-shantam --stop-after-stage 2 --target-score 4.0 --max-iterations 1 --start-services
```

Then run one full-flow readiness pass for at least one cooperative and one hard scenario:

```bash
python3 scripts/mwf_gold_loop.py run --scenario james-catherine --stop-after-stage 4 --target-score 4.0 --max-iterations 1 --start-services
python3 scripts/mwf_gold_loop.py run --scenario darryl-shantam --stop-after-stage 4 --target-score 4.0 --max-iterations 1 --start-services
```

Clean pass means:

- no `not_evaluable_for_prompt_quality`,
- hard invariants pass,
- Stage 1 arc-depth passes,
- Stage 2 adaptation passes,
- no unchanged empathy resubmission,
- no repeated identical partner review notification,
- no shallow transition accepted solely because the user says "yeah."

### 6. Validate From Snapshots, Not Only Fresh Starts

The live bug appeared after a long production run, so the smarter loop needs a snapshot path as well as fresh actor runs.

Add a snapshot registry entry for the sanitized Darryl/Shantam Stage 3 state:

- `id`: `darryl-shantam-stage-3-needs-review`
- `scenario`: `darryl-shantam`
- `starts_at_stage`: 3
- `purpose`: verify needs review UI, composer availability, theme styling, concrete need capture, and non-empty share offers.
- `required_invariants`: needs drawer opens, light mode remains light, composer visible for `needs-review`/`needs-share`, no empty share offer, no repeated identical partner notification.

Then run two loops:

- Fast snapshot loop: restore the Stage 3 needs-review state and verify UI/product invariants after each PR.
- Slow holistic loop: replay Stages 0-3 with actors and arc-level scoring so prompt fixes do not only pass the snapshot.

### 7. Add Snapshot Discipline To The Eval Machine

Snapshot replay should become a disciplined repair tool, not an accidental grind path.

Rules:

- After a fresh run reaches a verified milestone, save or register a named snapshot when that milestone is likely to be reused for later-stage debugging.
- Snapshot names should describe the exact usable state, not just the stage number.
- Snapshot registry entries must include what the snapshot proves and what it does not prove.
- The loop should prefer the latest verified snapshot for focused later-stage repair instead of repeatedly restoring an older state and replaying known-good steps.
- If a run advances past the old snapshot and validates a new intermediate state, the loop should propose a new snapshot before starting another fix/rerun cycle.
- Snapshot replay remains focused evidence only. A fresh gate is still required before claiming early-stage quality or all-stage readiness.

Recommended snapshot metadata additions:

- `validated_through`: last verified stage/milestone.
- `known_good_invariants`: invariant names that passed at this state.
- `next_unvalidated_moment`: the exact moment this snapshot is meant to test next.
- `privacy_state`: which partner artifacts are consented/shared at this point.
- `created_from_run`: run directory or production evidence source.
- `supersedes`: older snapshot id if this is a cleaner start point.

Acceptance:

- The loop can start a Stage 4 capture bug from a clean Stage 4-entry snapshot instead of replaying Stage 2 and Stage 3 every time.
- The cycle report names why each snapshot replay is valid evidence and what fresh gate still remains.
- The loop flags "using an old snapshot after newer passing evidence exists" as an eval-machine issue.

## Priority Order

1. Land #528 first after human review because it unblocks the current production session.
2. Land #530 if review passes because it is a small adjacent needs-stage fix with focused coverage.
3. Land #538 and #539 after human review/verification.
4. Rebase/refresh #526 before considering it; do not merge it while it is behind.
5. Commit the sanitized Darryl/Shantam gold transcript and profile after human review.
6. Define the runtime context contract and process-fact categories in code/docs.
7. Add product-flow invariants for unchanged resubmission, repeated partner notification, and empty share offers.
8. Add arc-level scorer fields to `score.json`.
9. Add process-fact capture to context assembly and prompt rendering.
10. Add snapshot registry discipline and migrate reusable later-stage states to named, auditable entries.
11. Rerun the required bounded gates across all three scenarios.
12. Only then tune prompts/product behavior from the new artifacts.

## Open Product Question

The privacy model correctly prevents one user's private Stage 1 content from being injected into the other user's AI prompt. That means factual mismatch detection cannot happen by raw cross-user comparison during private stages.

The right place to detect mismatch is the consented exchange/reconciler path: partner rejection feedback, shared context, and validation results should update process facts and prevent the same wrong premise from being resent.
