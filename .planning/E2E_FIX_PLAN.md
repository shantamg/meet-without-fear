# E2E Playthrough Fix Plan

Generated from full Stage 0→4 automated playthrough on 2026-02-25.
Session completed end-to-end (RESOLVED) in ~36 minutes.

---

## Fix 1: Real-time stage sync for partner (CRITICAL)

**Problem**: When both users complete a stage, Alice advances via her HTTP response, but Bob's `myProgress.stage` in the `sessionKeys.state` cache never updates. The `partner.advanced` event only updates `partnerProgress.stage`. Bob's panels/header read `myProgress.stage` — still stale. Required full page reload at Stage 2→3 AND Stage 3→4.

**Root cause**: `UnifiedSessionScreen.tsx:423-441` handles `partner.advanced` by updating `partnerProgress.stage` only. No code updates `myProgress.stage` for the user whose partner just advanced (which implies they also advanced).

**Fix** — after updating `partnerProgress.stage`, also invalidate `sessionKeys.state` so it refetches from the server:

```typescript
// UnifiedSessionScreen.tsx:423-442
if (event === 'partner.advanced') {
  // ... existing partnerProgress.stage update ...

  // ADD: refetch full session state — if partner advanced,
  // our own stage may have been advanced server-side too
  queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
  queryClient.refetchQueries({ queryKey: stageKeys.progress(sessionId) });
}
```

**File**: `mobile/src/screens/UnifiedSessionScreen.tsx:423-442`

---

## Fix 2: Common ground panel doesn't appear without reload (CRITICAL)

**Problem**: After `session.common_ground_ready` event fires, the handler invalidates `stageKeys.commonGround(sessionId)`. But `useCommonGround` is gated by `enabled: !!sessionId && allNeedsConfirmed`. If `allNeedsConfirmed` is derived from stale `needsData` at invalidation time, the query won't refetch.

**Root cause**: `useUnifiedSession.ts:284` computes `allNeedsConfirmedForGating` from `needsData?.needs`. When `stageKeys.needs` is invalidated by the event handler, the re-derive hasn't happened yet in the same render cycle, so `enabled` stays `false` and the commonGround invalidation is ignored.

**Fix** — force-refetch common ground after a short delay to ensure the `enabled` gate has resolved:

```typescript
// UnifiedSessionScreen.tsx:550-555
if (eventName === 'session.common_ground_ready') {
  console.log('[UnifiedSessionScreen] Common ground ready');
  queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
  queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
  queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
  // ADD: force refetch after needs cache updates so useCommonGround's enabled gate opens
  setTimeout(() => {
    queryClient.refetchQueries({ queryKey: stageKeys.commonGround(sessionId) });
  }, 500);
}
```

**File**: `mobile/src/screens/UnifiedSessionScreen.tsx:550-555`

---

## Fix 3: Header shows "online" during StrategyRankingOverlay

**Problem**: The StrategyRanking early return at line 2096 renders `SessionChatHeader` without `stageName` prop. When `stageName` is undefined, the header falls through to showing "online" status text.

**Root cause**: Missing prop in one conditional render path.

**Fix** — add `stageName` to the header in the ranking path:

```typescript
// UnifiedSessionScreen.tsx:2099-2106
<SessionChatHeader
  partnerName={partnerName}
  partnerOnline={partnerOnline}
  connectionStatus={connectionStatus}
  briefStatus={getBriefStatus(session?.status, invitation?.isInviter)}
  onBackPress={onNavigateBack}
  stageName={myProgress?.stage !== undefined ? STAGE_FRIENDLY_NAMES[myProgress.stage] : undefined}  // ADD
  testID="session-chat-header"
/>
```

**File**: `mobile/src/screens/UnifiedSessionScreen.tsx:2099-2106`

---

## Fix 4: Stale share suggestion in ActivityDrawer after offer consumed

**Problem**: After clicking "Share as-is", the offer is consumed server-side. But `usePendingActions` has `staleTime: 30_000` so the drawer still shows the old offer from cache. Clicking again returns 500: "No pending share offer found".

**Root cause**: `usePendingActions.ts:45` — `staleTime: 30_000`. Pending actions are live action items that become stale instantly upon consumption.

**Fix**:

```typescript
// usePendingActions.ts:45
staleTime: 0,  // was 30_000
```

**File**: `mobile/src/hooks/usePendingActions.ts:45`

---

## Fix 5: Missing testIDs on Stage 4 components

**Problem**: Several Stage 4 buttons lack `testID` props. E2E automation had to click by text content.

| File | Line | Element | testID to add |
|------|------|---------|---------------|
| `mobile/src/components/StrategyRanking.tsx` | ~109 | "Submit my ranking" button | `testID="submit-ranking-button"` |
| `mobile/src/components/StrategyCard.tsx` | ~88 | Strategy selection button | `` testID={`strategy-card-${strategy.id}`} `` |
| `mobile/src/components/AgreementCard.tsx` | ~85 | "Confirm Agreement" button | `testID="confirm-agreement-button"` |
| `mobile/src/screens/UnifiedSessionScreen.tsx` | ~1444 | "Review & Confirm" touchable | `testID="agreement-review-button"` |

---

## Fix 6: Agreement panel shows "Review & Confirm" after session resolved

**Problem**: After both users confirmed the agreement and the session resolved, the "Your Agreement" panel with "Review & Confirm" still appears at the bottom.

**Fix** — hide the agreement panel when `session.status === 'RESOLVED'`. Add the check in `chatUIState.ts` wherever `showAgreementPanel` is computed, or in the rendering logic in `UnifiedSessionScreen.tsx`.

**File**: `mobile/src/utils/chatUIState.ts` or `mobile/src/screens/UnifiedSessionScreen.tsx`

---

## Fix 7: Only first matched strategy has "Create Agreement" button

**Problem**: In "Your Shared Priorities" overlay, only the first strategy match shows a "Create Agreement" button. The second match ("Text Alice honestly...") is listed without an action button.

**Action**: Check the component rendering matched strategies (likely `StrategyOverlapResults.tsx` or similar). Determine if the button is conditionally rendered for `index === 0` only. If intentional (single agreement limit), document it. If a bug, add the button to all matches.

---

## Fix 8: No session completion screen

**Problem**: After resolution, users remain in the chat view with stale panels. No indication the session is complete.

**Fix** — when `session.status === 'RESOLVED'`, render a completion view. Options:
- A resolved banner/card in the chat timeline with agreement summary
- Hide stale panels (agreement "Review & Confirm", strategy pool, mood slider)
- Add early return in `UnifiedSessionScreen.tsx` similar to the ranking overlay pattern

**File**: `mobile/src/screens/UnifiedSessionScreen.tsx`

---

## Fix 9: NewActivityPill persists when there's nothing new

**Problem**: The "Bob/Alice shared something new" floating pill appears constantly, even when the user has scrolled through all content. It doesn't dismiss after viewing the new items.

**Fix** — check `NewActivityPill.tsx` or `ChatInterface.tsx`. The pill's visibility logic doesn't properly track whether "new" content has been viewed. Ensure it resets when the user scrolls near the new content (check `isAtBottom` / `hasNewItems` / `onViewableItemsChanged` logic).

**File**: `mobile/src/components/NewActivityPill.tsx` or `mobile/src/components/ChatInterface.tsx`

---

## Fix 10: Verify renderAboveInput fix is committed

**Problem**: Metro build log showed `Identifier 'renderAboveInput' has already been declared` at line 2122. This was fixed during the playthrough by moving the `useCallback` before early returns.

**Action**: Verify the fix is committed. There should be exactly one `const renderAboveInput = useCallback(...)` declaration, positioned before all early returns in `UnifiedSessionScreen.tsx`.

**File**: `mobile/src/screens/UnifiedSessionScreen.tsx`

---

## Priority Order

| # | Fix | Severity | Effort |
|---|-----|----------|--------|
| 1 | Stage sync — invalidate `sessionKeys.state` on `partner.advanced` | CRITICAL | 1 line |
| 2 | Common ground cache — setTimeout refetch after event | CRITICAL | 3 lines |
| 3 | Header `stageName` in ranking overlay | WARNING | 1 line |
| 4 | Stale share offer — `staleTime: 0` on pending actions | WARNING | 1 line |
| 5 | Missing testIDs on Stage 4 components | WARNING | 4 files, 1 line each |
| 6 | Hide agreement panel when resolved | WARNING | 1 condition |
| 7 | Create Agreement on all matched strategies | INFO | Investigate |
| 8 | Session completion screen | INFO | New view |
| 9 | NewActivityPill dismiss logic | INFO | Logic fix |
| 10 | Verify renderAboveInput fix committed | INFO | Verify only |
