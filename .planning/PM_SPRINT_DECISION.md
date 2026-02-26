# PM Sprint Decision: E2E Fix Plan

**Date:** February 25, 2026
**Decision by:** Project Manager
**Inputs:** E2E_FIX_PLAN.md (10 fixes), UI_PLANNING_OUTPUT.md (Fixes 7 & 8), Dev Team (5 devs), QA Agent, UX Expert, Great Thinker, Senior Designer

---

## 1. Code Changes (Fixes 1-6, 9, 10): GO

**Decision: COMMIT AS-IS.**

All 8 code changes are approved for immediate commit. Rationale:

- **Fix 1** (invalidateQueries on partner.advanced): Correct. The cache-first architecture requires that `myProgress.stage` updates when the server advances both users. This single line eliminates the need for manual page reloads at Stage 2->3 and 3->4 transitions. CRITICAL severity justified.

- **Fix 2** (setTimeout refetch for common ground): Correct. The 500ms delay is a pragmatic workaround for React Query's `enabled` gate not re-evaluating in the same render cycle as the cache invalidation. Not elegant, but correct. The alternative (restructuring the gating logic) is higher risk for no user-facing benefit. Ship it.

- **Fix 3** (stageName prop on ranking header): Correct. Trivial one-prop addition. No risk.

- **Fix 4** (staleTime 0 on pending actions): Correct. Pending actions are inherently perishable. The 30s staleTime was a premature optimization that caused a visible bug (500 errors on consumed offers). `staleTime: 0` is the right default for action items. If this causes performance issues later, we solve that with targeted invalidation, not by caching stale action items.

- **Fix 5** (4 testIDs): Correct. These are pure additions with zero behavioral impact. Required for E2E automation.

- **Fix 6** (agreement panel hidden when RESOLVED): Correct. The `session?.status !== SessionStatus.RESOLVED` guard in `useUnifiedSession.ts` is the right place. Clean, derives from cache, follows the project's golden rule.

- **Fix 9** (NewActivityPill auto-dismiss + recheck): Correct. Two changes here: (a) the `onAutoDismiss` callback notifies the parent to clear `pendingPillTarget` state after the 15s timeout animation completes, and (b) the 500ms recheck timer in ChatInterface handles the race where `onViewableItemsChanged` fires asynchronously. The QA agent flagged the inline `onPillDismiss` arrow in the useEffect dep array -- this is technically correct (it creates extra effect runs) but functionally harmless. Ship it; refactor to a ref in a future cleanup pass if profiling shows unnecessary renders.

- **Fix 10** (renderAboveInput verification): Confirmed. The diff shows the early returns (loading, mood check, ranking overlay) were moved BELOW the `renderAboveInput` useCallback. There is now exactly one declaration before all early returns. No code change needed.

**One observation on Fix 10**: The diff shows the early returns were relocated from line ~1719 to line ~2061. This is a significant structural move. It means `renderAboveInput` (a useCallback) is now declared before the early returns, which is correct and required by React's rules of hooks. But it also means ALL hooks in the component now run even when the component is in a loading or mood-check state. This is acceptable -- hooks should always run unconditionally -- but worth noting for anyone reviewing the commit.

### QA Agent's Minor Issue

The `onPillDismiss` inline arrow in useEffect deps: acknowledged, deferred. The ref pattern (`onPillDismissRef`) is already applied to `handleViewableItemsChanged`. The useEffect dep array issue is cosmetic -- the effect re-runs when `onPillDismiss` changes identity, but since `onPillDismiss` is a stable callback from the parent, this is rare in practice. Not a blocker.

---

## 2. Fix 7: Strategy Button -- SCOPED DECISION

**Decision: Ship the minimal bug fix NOW. Defer multi-agreement UX to next sprint.**

### What ships this sprint (1 story point):

Remove the `index === 0` guard in `OverlapReveal.tsx:68`. Every matched strategy gets a "Create Agreement" button. This is a one-line fix to a confirmed bug.

### What does NOT ship this sprint:

- Multi-agreement rendering in the confirmation overlay (`agreements[0]` hardcoded in 3 other locations)
- `MAX_AGREEMENTS` cap (Designer's recommendation of 2)
- Paginated confirmation UX
- `sessionCanResolve` gating on resolution trigger
- Resolution trigger field name audit

### Rationale:

The UX Expert and Designer agree the `index === 0` guard is a bug. They disagree on how far to go fixing it. The Designer wants a complete multi-agreement system. That is the right long-term answer, but it is a multi-day effort touching 4+ files, and the current playthrough showed users cannot create ANY agreements from the UI without API hacks. The immediate priority is unblocking the flow, not perfecting it.

The risk of shipping just the guard removal: a user could create 2+ agreements, but the confirmation overlay would only show `agreements[0]`. That is a degraded experience but not a broken one -- the user can still confirm the first agreement and resolve the session. The `agreements[0]` hardcoding in the confirmation overlay becomes the highest-priority item for next sprint.

### Next sprint backlog for Fix 7 (ordered):

1. **Render all agreements in confirmation overlay** -- replace `agreements[0]` with `.map()` in UnifiedSessionScreen.tsx ~line 1670
2. **Add `MAX_AGREEMENTS` constant** -- cap at 2, enforce in `handleCreateAgreementFromOverlap`
3. **Gate resolution on `sessionCanResolve`** -- use backend's field instead of frontend heuristic
4. **Inline agreement-preview card shows count** -- "2 agreements ready" instead of showing just the first

---

## 3. Fix 8: Session Completion Screen -- FINAL DESIGN BRIEF

**Decision: Build it next sprint using the reconciled spec below.**

The UX Expert provided the structural spec. The Great Thinker provided the emotional framework. The Senior Designer provided 5 blocking changes. Here is the final brief that incorporates all three:

### Architecture

Full-screen early-return overlay in `UnifiedSessionScreen.tsx`, same pattern as mood check and strategy ranking. When `session?.status === SessionStatus.RESOLVED`, this view renders instead of the chat.

### Components

1. **`SessionCompletionScreen`** (new file: `mobile/src/components/SessionCompletionScreen.tsx`)
2. **`AgreementSummaryCard`** (new file: `mobile/src/components/AgreementSummaryCard.tsx`)

### Layout (top to bottom)

1. **SessionChatHeader** -- partner name + "Resolved" badge (reuse existing component)
2. **Handshake or clasp icon** -- simple, not celebratory
3. **Headline** -- "A Path Forward" (NOT "You Did Something Brave" -- per Designer change #1, center the agreement, not the users' courage. The Great Thinker's "warm gravity" tone means acknowledging the work without inflating it.)
4. **Subheading** -- "You and [partner] reached an agreement together"
5. **Agreement Summary section** -- read-only `AgreementSummaryCard` for each confirmed agreement. Shows agreement text + confirmation timestamps. No edit/delete actions.
6. **Session metadata** -- "Started [date] / Completed [date]" + "4 stages completed". Minimal, factual.
7. **"Set Reminder" link** -- shown ONLY when `checkInDate` exists on any agreement (Designer change #5). Opens date picker or system reminder. If no `checkInDate`, this element does not render.
8. **Two buttons**:
   - **"View Conversation History"** -- SECONDARY button, not a text link (Designer change #2). Sets local `viewingHistory = true`, falls through to read-only chat view.
   - **"Return to Sessions"** -- PRIMARY button. Navigates back to session list.

### Behavior

- **First entry after resolution**: Completion screen shows. This is the default.
- **"View Conversation History"**: Sets local state `viewingHistory = true`. Chat renders in read-only mode (input disabled, stale panels suppressed via Fix 6 + additional RESOLVED checks in `chatUIState.ts`). A "Back to summary" button at the top returns to completion screen.
- **Re-entry**: Completion screen shows again (Designer change #4 -- show overlay once per visit, default to it). The `viewingHistory` state resets on mount.
- **Asymmetric waiting state** (Designer change #3): If User A confirms the agreement but User B has not yet, User A sees a waiting state: "Waiting for [partner] to confirm" with a subtle animation. This is NOT the completion screen -- it is a pre-resolution state. The completion screen only renders when `session.status === RESOLVED`. The waiting state is a separate concern and can be addressed via the existing `WaitingBanner` component or a new above-input panel.

### Tone Guidance (from Great Thinker, binding)

- No ratings. No social sharing. No "Share your experience" prompts.
- No upselling ("Try our premium features"). No gamification ("Level up!").
- Language: factual and warm. "You reached an agreement" not "Congratulations!"
- The screen should feel like the last page of a chapter, not a trophy case.
- Acknowledge that resolution is fragile. Do not over-promise outcomes.

### Stale Panel Suppression

Fix 6 already hides the agreement-preview card when RESOLVED. Additionally, add RESOLVED checks to suppress:
- Needs review panel
- Common ground panel
- Empathy panel
- Share suggestion panel
- Strategy pool card

These can all be gated with `session?.status !== SessionStatus.RESOLVED` in `chatUIState.ts` or the relevant rendering conditionals.

### Estimated Effort

- `SessionCompletionScreen`: 2 days (layout + state management + animations)
- `AgreementSummaryCard`: 0.5 days (read-only display)
- Stale panel suppression: 0.5 days (adding RESOLVED guards)
- Read-only chat mode: 1 day (disable input, add back button)
- Total: 4 days

---

## 4. Priority & Sequencing -- Next Sprint Plan

### Sprint Backlog (ordered by priority)

| # | Item | Effort | Dependency | Owner |
|---|------|--------|------------|-------|
| 1 | **Commit Fixes 1-6, 9, 10** | 0.5 day | None | Any dev |
| 2 | **Fix 7 minimal** -- remove `index === 0` guard in OverlapReveal.tsx | 0.5 day | None | Dev 3 |
| 3 | **Fix 8** -- SessionCompletionScreen + AgreementSummaryCard | 4 days | Fix 6 committed | Dev 1 + Dev 4 |
| 4 | **Fix 7 follow-up** -- multi-agreement confirmation overlay | 2 days | Fix 7 minimal committed | Dev 2 |
| 5 | **Fix 7 follow-up** -- MAX_AGREEMENTS cap + sessionCanResolve gating | 1 day | #4 | Dev 2 |
| 6 | **Stale panel suppression** -- RESOLVED checks on all remaining panels | 0.5 day | Fix 8 | Dev 5 |
| 7 | **E2E test update** -- update automation for new testIDs, completion screen | 2 days | #3, #6 | QA |

### Sequencing

**Day 1**: Commit current code (item 1). Ship Fix 7 minimal (item 2). Begin Fix 8 (item 3).

**Days 2-4**: Fix 8 development. In parallel, Fix 7 follow-up (items 4-5).

**Day 5**: Stale panel suppression (item 6). E2E test updates begin (item 7).

**Days 6-7**: E2E test completion. Full regression run.

### Dependencies

- Fix 8 depends on Fix 6 being committed (it is, in the current batch).
- Fix 7 multi-agreement overlay depends on the minimal guard removal being in.
- E2E tests depend on everything else landing.
- No backend changes required for any of these items.

---

## 5. Open Risks

### HIGH: Asymmetric waiting state (Fix 8, Designer change #3)

The Designer flagged that User A may confirm an agreement and then see... nothing useful. The completion screen only renders at RESOLVED (both confirmed). Between "I confirmed" and "session resolved," User A needs a waiting state. This is not covered by the current code changes or the completion screen spec. It needs explicit design: either a WaitingBanner variant ("Waiting for [partner] to confirm the agreement") or a dedicated above-input panel.

**Mitigation**: Add a `waiting-for-agreement-confirmation` state to `chatUIState.ts` that shows when the current user has confirmed all their agreements but the session is not yet RESOLVED.

**Owner**: Dev 1 (as part of Fix 8 work).

### MEDIUM: `staleTime: 0` on pending actions (Fix 4)

Setting `staleTime: 0` means every component mount, focus, or cache invalidation triggers a network request to `/sessions/:id/pending-actions`. In a session with frequent real-time events (Stage 2 with reconciler running), this could produce 10-20 requests per minute.

**Mitigation**: Monitor network traffic in the next E2E playthrough. If excessive, switch to `staleTime: 5_000` (5 seconds) which still prevents the stale-offer bug while reducing request volume.

### MEDIUM: Fix 2's setTimeout is a smell

The 500ms setTimeout in the common ground event handler is a race condition workaround, not a fix. If the server or network is slow, 500ms may not be enough. If the server is fast, it is wasted latency.

**Mitigation**: After the current sprint ships, replace with a proper solution: either (a) restructure `useCommonGround`'s `enabled` gate to not depend on `allNeedsConfirmed` (use a separate boolean from the event payload), or (b) use React Query's `refetchInterval` on the common ground query when needs are confirmed. File this as tech debt.

### LOW: QA agent's onPillDismiss dep array issue

Extra useEffect runs from the inline arrow. Not a bug, not a regression, but adds unnecessary work. File as a cleanup task.

### LOW: Existing E2E playthrough bugs NOT addressed by this fix plan

The E2E_PLAYTHROUGH_REPORT.md documents bugs that are NOT in the E2E_FIX_PLAN.md:
- **Bug 2** (ranking submit does not update submitter's UI): Still open. The mutation's `onSuccess` does not transition the submitting user's component state. This will cause confusion in the next playthrough.
- **Bug 3** (strategy pool shows "0 strategies" after reload): Still open. Strategies are not refetched on RESOLVED sessions.
- **Bug 5** (drawers/dialogs stack and block interaction): Still open. This is a systemic issue with multiple modal layers.

These are not blockers for this sprint but should be tracked.

---

## Summary

| Decision | Verdict |
|----------|---------|
| Fixes 1-6, 9, 10 code changes | **GO -- commit immediately** |
| Fix 7 (guard removal) | **GO -- minimal fix this sprint, full multi-agreement next sprint** |
| Fix 8 (completion screen) | **GO -- build next sprint per reconciled spec above** |
| Timeline | 7 working days for full sprint |

The current code is correct, QA-verified, and solves the two CRITICAL real-time sync bugs (Fixes 1 & 2) plus four WARNING-level issues. Ship it today. Build the completion screen and multi-agreement support over the next week.
