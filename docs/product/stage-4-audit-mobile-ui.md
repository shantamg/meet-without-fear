# Stage 4 Mobile UI Audit (#369, #370)

Date: 2026-05-02
Auditor: subagent (gold-transcript-aligned)
Reference: docs/product/stage-4-tending-technical-spec.md, docs/mobile/wireframes/gold-flow-mockups.md, docs/product/source-material/golden-transcripts/{adam-eve.md, james-catherine.md}

Notes on scope:

- The named cross-cutting reference `docs/product/stage-4-gold-question-analysis.md` does not exist in the repo. Posture for Q1 (shared inventory with labeled individual commitments) and Q2 (re-entry private until cross) is inferred from `stage-4-tending-technical-spec.md` (sections "Mobile Card Contracts" and "Tending Scheduling and Re-entry") and the gold-flow mockups.
- The components named in the task (`Stage4RedesignPanel.tsx`, `TendingPanel.tsx`) are NOT on `main`. They live on branch `origin/codex/stage4-tending-focus` (commits d305aca, 7e90112, 3e2dbbf). Issues #369 and #370 are still OPEN. PR #373 references this work. All file:line citations below are against that branch's tree, staged at /tmp during the audit.

## #369 — Stage 4 panel

- Verdict: ALIGNED with one drift (see concerns).
- Combined inventory with labeled individual commitments: PASS.
  - `Stage4RedesignPanel.tsx:200-203` concatenates `inventory.sharedProposals` and `inventory.individualCommitments` into a single list rendered to the viewer.
  - `Stage4RedesignPanel.tsx:114-116` renders `proposal.ownerLabel` ("You" / "Partner") on individual-commitment cards.
  - Backend assigns the label per-requesting-user: `backend/src/services/stage4-state.ts:197-203` — `INDIVIDUAL_COMMITMENT` whose `createdByUserId === userId` becomes "You", otherwise "Partner". Shared proposals deliberately have no owner (creator privacy), matching the Q1 posture: when James opens his Stage 4, Catherine's individual commitments appear labeled "Partner" alongside his own.
- Partner selection privacy: PASS.
  - `stage4-state.ts:360` sets `revealPartnerSelections = mySelections.length > 0 && partnerSelections.length > 0`. The `partnerDecisionVisible` field is only populated when both have submitted (`stage4-state.ts:213`).
  - Panel honors this: `Stage4RedesignPanel.tsx:78-93` renders "Private" when `decision` is undefined; `Stage4RedesignPanel.tsx:267-282` shows a copy line "Partner choices stay private until they submit" until `partnerSelectionStatus === 'SUBMITTED'`.
- No-shared-agreement as first-class outcome: PASS (with copy concerns).
  - `UnifiedSessionScreen.tsx:2808-2843` branches resolved sessions where `outcome.kind === NO_SHARED_AGREEMENT` (or `phase === CLOSED_NO_SHARED_AGREEMENT`) to a dedicated full-screen view that renders `Stage4RedesignPanel` + `TendingPanel`, distinct from the agreement-only `SessionCompletionScreen`.
  - The header reads "Closed" rather than failure language. Closure card surfaces individual commitments and open needs (`Stage4RedesignPanel.tsx:284-303`).
- Chat input availability during inventory: PASS.
  - `UnifiedSessionScreen.tsx:1138-1146` defines `redesignedStage4AllowsInput` true for `INVENTORY_BUILDING | COVERAGE_REVIEW | SELECTION | OUTCOME_REVIEW`.
  - `UnifiedSessionScreen.tsx:3146-3148` overrides `hideInput` to `false` whenever that flag is true. Matches the gold-flow conversation-led posture in mockup section 4.
  - Stage 4 panel is rendered via `renderBelowChat` (`UnifiedSessionScreen.tsx:3121-3133`), so the inventory is an inline receipt below the live chat, not a form replacement.

Concerns:

- The panel exposes "Close with shared agreement" / "Close with no shared agreement" as explicit `TouchableOpacity` buttons (`Stage4RedesignPanel.tsx:307-345`). The gold posture is conversation-led closure; the spec allows close-style buttons only as gates. The "Close with no shared agreement" button enables as soon as `phase >= COVERAGE_REVIEW` (line 210-213) — meaning a single user can unilaterally trigger no-shared-agreement closure before the partner has even completed selection. The closure rules in the spec ("both users submitted selections… or boundary honored") suggest this should be guarded by partner submission or AI-driven `closureSignal`, not exposed as an always-on button.
- The "valid close" hint at line 348-355 uses `XCircle` + `colors.warning`. While copy is non-failure, the iconography reads as a warning state and contradicts the "first-class outcome, not failure" posture from the spec and mockup section 7.
- "Selection receipt" card shows static copy and no per-proposal selection list (`Stage4RedesignPanel.tsx:266-282`). The spec's `SelectionReceiptCardProps` expects `mySelections` enumerated. The current panel relies on per-proposal `myDecision` chips inside each `ProposalCard`, which is acceptable but may make it hard to scan a user's full submission before reveal.
- `phasePill` always renders the current phase including "Choosing willingness" — this is fine for the user, but tests should confirm the phase label does not leak partner-side state pre-submission. (Backend appears to compute phase from union state; not a privacy leak per se but worth a manual check.)
- No header differentiation between agreement-based and no-agreement Tending in the same panel. The Tending entry header copy is identical (`TendingPanel.tsx:155-159`). Mockup section 8 (no-agreement variant) suggests differentiated framing.

## #370 — Tending panel + resolved-session re-entry

- Verdict: ALIGNED.
- Re-entry private (no partner notification): PASS at the surface level.
  - `TendingPanel.tsx:141-145` calls `onCreateReentry(intent)`, which in `UnifiedSessionScreen` invokes `useCreateTendingReentry` → `POST /sessions/:id/tending/reentry`. Backend service (per spec section "Passive Re-entry") creates `TendingEntry(type=USER_INITIATED_REENTRY, status=OPEN)` and "does not notify partner by default until the user chooses a path that requires partner participation."
  - The mobile call site sends only `intent` text. No partner-targeting realtime payload is dispatched from the panel itself.
  - VERIFY-IN-RUNNING-APP: spec posture is honored only if `tending.service.ts` does not emit an Ably partner notification on re-entry create. Worth a backend confirmation pass; not visible from mobile UI alone.
- Scheduled check-in only for shared agreements: PASS.
  - Backend rule (`stage-4-tending-technical-spec.md` "Scheduled Tending"): scheduled entries are created only on `Stage4Closure.kind = SHARED_AGREEMENT` with timing.
  - Panel reflects this honestly: `TendingPanel.tsx:124-130` segments entries into `scheduledSharedEntries` and `passiveEntries`. Header copy at line 271-276 says "No scheduled shared check-in" when `scheduledSharedEntries.length === 0`. James/Catherine no-overlap path → no scheduled CTA appears (the scheduled-entry block at lines 163-265 simply does not render for entries that don't exist).
  - Adam/Eve resolution path → scheduled entry shows agreement context, success measure, and review form (lines 175-256).
- Passive re-entry surface for no-shared-agreement: PASS.
  - The bottom card (`TendingPanel.tsx:267-324`) always renders, with "Start re-entry" button and intent text input. Individual commitments and open needs are surfaced from `outcome.individualCommitments` and `outcome.openNeeds` (lines 281-301). This matches mockup section 8 no-agreement variant.

Concerns:

- The panel uses a structured form (status choice + continue choice + reflection text input) for scheduled check-in review (`TendingPanel.tsx:192-256`). The gold mockup section 9 shows scheduled check-in answered through chat, not a form. This is form-led rather than conversation-led for the actual reflection step. May be acceptable as a structured receipt, but does drift from the design principle "Users answer through text".
- Continuation choice radio `OTHER_TRACK` label "Other support" is fine, but the gold spec mentions "Move to Inner Work or another support track" — there is no link/affordance to actually route into Inner Work from this panel.
- Re-entry intent text-input is a passable substitute for the chat-led "what do you want to revisit?" prompt, but skips the AI question framing the mockup describes ("AI: What would be useful today: check how the agreement went…").
- `selectedEntry` auto-pick (`TendingPanel.tsx:109-119`) defaults to the deep-linked entry id, then any open/partial entry, then scheduled, then first. If a user re-enters a no-agreement session that has a stale scheduled entry from a different agreement context, behavior is well-defined; verified by the priority order.
- `SessionCompletionScreen` itself was not modified to branch by closure kind; branching happens upstream in `UnifiedSessionScreen.tsx:2808-2843`. The agreement-only completion path still passes a `tendingPanel` ReactNode through (added prop, line ~31) — verified that resolved shared-agreement sessions also get the Tending panel embedded.

## Cross-issue observations

- The redesign cleanly replaces the ranking-pool path: when `/stage4` state is available, both `UnifiedSessionScreen` (line 3124-3133) and `StrategicRepairScreen` (line 433-464) prefer the redesigned panel. Legacy `StrategyPool`/`StrategyRanking`/`OverlapReveal` remain as fallback only when `stage4State` is undefined — matches the build-progress note.
- The resolved-no-shared-agreement full-screen view (UnifiedSessionScreen:2813-2843) renders the Stage4RedesignPanel itself rather than a dedicated read-only "close" card. The same panel that users used during selection is shown in CLOSED state. This is fine functionally (the panel handles `state.outcome` rendering) but means the willingness chips and close buttons remain in the DOM. Verify-in-running-app: the buttons should be visually disabled or hidden once `state.outcome` is non-null. Reading the JSX: lines 306-345 render the "actions" block only when `!state.outcome` — so close buttons are correctly hidden in closed state. Good.
- However, individual proposal cards (lines 232-241) still render selection chips even after closure (no `disabled-by-outcome` guard). The chips would re-fire `onSelectProposal` after the session is RESOLVED. Recommend gating `selectionButtons` rendering on `!state.outcome` or `phase === CLOSED_*`.
- The mobile UI does not appear to thread realtime invalidation for `stage4State` from partner submission events. `realtimeInvalidation.ts` was edited (1 line per the diff). Worth verifying: when partner submits a selection, does the current user's panel update from `NOT_STARTED` to `SUBMITTED` without a manual refresh? This determines whether the "Private" → revealed transition happens live.
- No accessibility annotation for the "Private" partner badge — screen readers will announce "Partner: Private" which is acceptable but undescribed semantically.
- E2E coverage exists at `e2e/tests/two-browser-stage-4-redesign.spec.ts` (191 lines) — covers selection privacy and closure outcomes per the diff. Good signal.

Summary: Both issues' implementations align with the gold posture. Strongest: combined inventory with owner labels, partner privacy gating, no-shared-agreement as resolved (not failure) status, chat input preserved through Stage 4 phases, scheduled Tending only for shared agreements. Weakest: explicit close-by-button affordances that can fire pre-partner-submission, warning-colored "valid close" iconography, and form-led Tending check-in reflection that drifts from conversation-led principle.
