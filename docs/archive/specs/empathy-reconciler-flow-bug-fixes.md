# Specification: Empathy Reconciler Flow Bug Fixes

*Started: 2026-01-12*

## Overview
Fix three bugs in the Stage 2 empathy reconciliation flow where:
1. Users get stuck in "analyzing" state after submitting empathy
2. Users must manually reload to see reconciler completion
3. The "Suggested to Share" content displays wrong text (AI introduction instead of actual quote suggestion)

## Problem Statement

### Bug 1: Users Stuck in "Analyzing" State
- **Observed:** Both users submitted empathy statements but both see "AI is analyzing your empathy match..." indefinitely
- **Root Cause:** After both users submit empathy, `consentToShare` sets status to `ANALYZING`, then runs reconciler in background. Status updates (to `READY`/`AWAITING_SHARING`) happen but no Ably notification is sent to clients.
- **Location:** `backend/src/controllers/stage2.ts:562-580` - fire-and-forget call with no notification

### Bug 2: Delayed Trigger (Needs Manual Reload)
- **Observed:** Reconciler output (share suggestions) only appeared after manual reload
- **Root Cause:** Share offers are created LAZILY when user hits `/share-offer` endpoint, not proactively when reconciler completes. 221s gap observed between reconciler analysis and share offer creation.
- **Location:** `backend/src/controllers/stage2.ts:61-145` - `triggerReconcilerAndUpdateStatuses` doesn't create share offers

### Bug 3: Wrong "Suggested to Share" Content
- **Observed:** The suggested share text is an AI introduction ("Your empathy work is complete...") instead of a shareable quote ("He's my brother so I just want to be able to play with him")
- **Root Cause:** When share offer is created lazily in `generateShareOffer`, it sets:
  - `offerMessage` = AI's introduction (WRONG for "Suggested to Share")
  - `quoteOptions[recommendedQuote].content` = actual quote (CORRECT)
  - But fallback at line 292 returns `offerMessage` when `suggestedContent` is NULL
- **Location:** `backend/src/controllers/reconciler.ts:292` - wrong fallback field

## Scope

### In Scope
- Fix Bug 1: Add Ably notification after reconciler updates empathy statuses
- Fix Bug 2: Generate share offers proactively in `triggerReconcilerAndUpdateStatuses`
- Fix Bug 3: Fix fallback to use `quoteOptions[recommendedQuote].content` instead of `offerMessage`
- Add/update tests to verify the fixes

### Out of Scope
- Restructuring the async vs sync reconciler flow
- Changes to the mobile UI (no mobile changes needed)
- Changes to the reconciler prompt/AI generation logic
- Performance optimizations

## User Stories

### US-1: Notify Clients When Reconciler Completes
**Description:** As a user who just submitted empathy, I want to immediately see the next action (share suggestion or reveal) without needing to reload.

**Acceptance Criteria:**
- [ ] After `triggerReconcilerAndUpdateStatuses` updates empathy statuses, it publishes Ably event `empathy.status_updated` to the session channel
- [ ] Both users receive the notification (not just partner)
- [ ] Existing test `reconciler.test.ts` passes
- [ ] New test verifies Ably event is published with correct data shape

### US-2: Generate Share Offers Proactively
**Description:** As a user with significant empathy gaps, I should see a share suggestion immediately after reconciler completes, not on reload.

**Acceptance Criteria:**
- [ ] `triggerReconcilerAndUpdateStatuses` calls `generateShareSuggestion` for each direction with `AWAITING_SHARING` status
- [ ] Share offers are created with `suggestedContent` populated (not NULL)
- [ ] Existing tests in `reconciler.test.ts` pass
- [ ] Database shows `suggestedContent` populated after reconciler runs

### US-3: Fix Suggested Content Fallback
**Description:** As a user viewing a share suggestion, I should see the actual recommended quote, not the AI's introduction message.

**Acceptance Criteria:**
- [ ] When `suggestedContent` is NULL, fallback uses `quoteOptions[recommendedQuote].content` instead of `offerMessage`
- [ ] The fallback only kicks in for legacy/edge cases (US-2 should prevent NULL)
- [ ] Unit test verifies the correct fallback logic
- [ ] Manual verification: share suggestion shows first-person quote, not AI intro

## Technical Design

### Fix 1: Ably Notification (Bug 1 + 2)

In `backend/src/controllers/stage2.ts`, modify `triggerReconcilerAndUpdateStatuses`:

```typescript
// After updating empathy statuses (around line 130), add:
await publishSessionEvent(sessionId, 'empathy.status_updated', {
  stage: 2,
  // Include new statuses so client can update optimistically
  statuses: {
    [userAId]: newStatusA,
    [userBId]: newStatusB,
  }
});
```

Add the new event type to `shared/src/dto/realtime.ts`:
```typescript
export type SessionEventType =
  // ... existing events
  | 'empathy.status_updated' // Reconciler completed, empathy statuses changed
```

### Fix 2: Proactive Share Offer Generation (Bug 2)

In `backend/src/controllers/stage2.ts`, modify `triggerReconcilerAndUpdateStatuses`:

```typescript
// After status updates, for each direction with AWAITING_SHARING:
if (hasSignificantGapsA) {
  await generateShareSuggestionForDirection(sessionId, userAId, userBId, result.aUnderstandingB);
}
if (hasSignificantGapsB) {
  await generateShareSuggestionForDirection(sessionId, userBId, userAId, result.bUnderstandingA);
}
```

Create helper function that wraps `generateShareSuggestion` from reconciler.ts.

### Fix 3: Correct Fallback (Bug 3)

In `backend/src/controllers/reconciler.ts`, fix `getShareOfferHandler` around line 292:

```typescript
// Before (WRONG):
suggestedContent: shareOffer.suggestedContent || shareOffer.offerMessage || ''

// After (CORRECT):
suggestedContent: shareOffer.suggestedContent ||
  (shareOffer.quoteOptions?.[shareOffer.recommendedQuote ?? 0]?.content) ||
  shareOffer.offerMessage ||  // Last resort fallback
  ''
```

Also fix line 261 in the legacy flow:
```typescript
// Before (WRONG):
suggestedContent: offer.offerMessage

// After (CORRECT):
suggestedContent: offer.quoteOptions?.[offer.recommendedIndex ?? 0]?.content || offer.offerMessage
```

### Files to Modify
1. `shared/src/dto/realtime.ts` - Add `empathy.status_updated` event type
2. `backend/src/controllers/stage2.ts` - Add notification + proactive share offer generation
3. `backend/src/controllers/reconciler.ts` - Fix suggestedContent fallback

### Client Changes (if any)
The mobile client should already handle session events via Ably subscription. The `empathy.status_updated` event will trigger query invalidation for empathy status, similar to other session events. No explicit mobile changes needed if using React Query's automatic refetch on focus + Ably subscription.

## Implementation Phases

### Phase 1: Fix the Fallback (Bug 3) - Quick Win
- [ ] Update `getShareOfferHandler` fallback to use `quoteOptions[recommendedQuote].content`
- [ ] Add unit test for fallback logic
- **Verification:** `npm run test -- --grep "share.*offer" && npm run check`

### Phase 2: Add Ably Notification (Bug 1)
- [ ] Add `empathy.status_updated` event type to shared/dto/realtime.ts
- [ ] Call `publishSessionEvent` in `triggerReconcilerAndUpdateStatuses` after status updates
- [ ] Add test verifying Ably publish is called
- **Verification:** `npm run test && npm run check`

### Phase 3: Proactive Share Offer Generation (Bug 2)
- [ ] Extract share suggestion generation into helper callable from `triggerReconcilerAndUpdateStatuses`
- [ ] Call helper for each direction with significant gaps
- [ ] Verify share offers have `suggestedContent` populated in database
- **Verification:** `npm run test && npm run check`

## Definition of Done

This feature is complete when:
- [ ] All three bugs are fixed and verified
- [ ] Tests pass: `npm run test`
- [ ] Types check: `npm run check`
- [ ] Manual test: Two users can complete Stage 2 empathy flow without reload, and share suggestions show correct quotes

## Verification Commands

```bash
# Run all tests
npm run test

# Run reconciler tests specifically
npm run test -- --grep reconciler

# Type check
npm run check
```

## Open Questions
None - all issues have been traced to root causes with clear fixes.

## Implementation Notes
The three bugs are interconnected:
- Bug 3 (wrong content) is a fallback issue that only occurs because...
- Bug 2 (lazy creation) means `suggestedContent` is never populated because...
- Bug 1 (no notification) means users reload which triggers the lazy path

Fixing in order (3 → 2 → 1) provides incremental value:
- Phase 1 fixes display for existing sessions with lazy-created share offers
- Phase 2 prevents the fallback from being needed for new sessions
- Phase 3 removes the need for reload entirely
