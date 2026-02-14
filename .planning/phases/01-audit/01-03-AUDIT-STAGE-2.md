# Stage 2 (Perspective Stretch / Empathy) - Two-User Interaction Audit

**Phase:** 01-audit
**Plan:** 03
**Date:** 2026-02-14
**Purpose:** Document all two-user interaction paths in Stage 2, tracing backend flows, Ably events, cache updates, and UI state changes for both users.

---

## Overview

Stage 2 is the most complex stage in the Meet Without Fear process. It involves:
- Drafting empathy statements (each user independently guesses partner's feelings/needs)
- Consenting to share empathy attempts
- **Reconciler** — AI compares empathy guess vs actual Stage 1 content
- Asymmetric flow when gaps are detected (share suggestions, refinement, resubmission)
- Validation/refinement loop
- Stage 3 transition when both users validated

This audit traces **8 core interaction paths**, each with specific DB writes, Ably events, cache updates, and UI state changes.

---

## State Machine: Empathy Status Flow

```
┌──────────┐
│   HELD   │ ← User consents to share (waiting for partner)
└────┬─────┘
     │ Partner also consents
     ↓
┌──────────┐
│ANALYZING │ ← Reconciler runs for both directions
└────┬─────┘
     │
     ├─ No gaps → READY → (both ready?) → REVEALED → VALIDATED
     │
     └─ Gaps detected:
        ├─ AWAITING_SHARING (Subject shown share suggestion)
        │   → Subject shares context → REFINING (Guesser must revise)
        │      → Guesser resubmits → ANALYZING (loop)
        │
        └─ (Legacy) NEEDS_WORK → refinement conversation → resubmit → ANALYZING
```

---

## Interaction Path 1: Empathy Draft Save

**Trigger:** User edits/saves their empathy draft (Stage 2 in-progress).

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/draft`
**Controller:** `saveDraft` in `backend/src/controllers/stage2.ts`

**Validations:**
- Session exists and user has access
- Session status is ACTIVE (or INVITED for creator)
- User is in Stage 2 (`progress.stage === 2`)

**DB Writes:**
```sql
UPSERT EmpathyDraft {
  sessionId, userId,
  content: <user input>,
  readyToShare: <optional boolean>,
  version: version + 1
}
```

**Ably Events:** None (draft save is silent — no partner notification).

### Acting User (Mobile)

**Mutation:** `useSaveEmpathyDraft` in `mobile/src/hooks/useStages.ts`

**Cache Updates:**
- `onSuccess`: Invalidates `stageKeys.empathyDraft(sessionId)`
- No optimistic update (not performance-critical)

**UI State:** No panel visibility changes. Draft content auto-saves as user types.

### Partner (Mobile)

**No notification.** Draft is private until consent is granted.

### Issues Found

None. Draft save is a simple single-user operation with no race conditions.

---

## Interaction Path 2: Consent to Share Empathy

**Trigger:** User confirms empathy statement and consents to share.

**CRITICAL:** This is the entry point to the reconciler flow. Understanding when the reconciler runs is essential.

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/consent`
**Controller:** `consentToShare` in `backend/src/controllers/stage2.ts`

**Validations:**
- Session exists and user has access
- User is in Stage 2
- Draft exists and is marked `readyToShare: true`

**DB Writes:**
```sql
1. INSERT ConsentRecord {
     userId, sessionId,
     targetType: 'EMPATHY_DRAFT',
     decision: GRANTED,
     decidedAt: now
   }

2. INSERT EmpathyAttempt {
     draftId, sessionId, sourceUserId,
     content: draft.content,
     sharedAt: now,
     status: HELD  // Initially HELD until partner also shares
   }

3. INSERT Message {
     role: EMPATHY_STATEMENT,
     content: draft.content,
     senderId: userId,
     forUserId: userId,  // User's own chat (shows "What you shared")
     stage: 2
   }

4. IF both users have shared:
     UPDATE EmpathyAttempt
     SET status = ANALYZING
     WHERE sessionId AND sourceUserId IN (userA, userB) AND status = HELD

   Then: triggerReconcilerAndUpdateStatuses(sessionId) fires in background
```

**Ably Events:**

1. `partner.empathy_shared` → Published to partner's user channel
   - Payload: `{ stage: 2, sharedBy: userId, empathyStatus: <partner's status> }`
   - Triggers partner's session list update

**Reconciler Trigger:**
- **First user:** EmpathyAttempt created with `status: HELD`. No reconciler run.
- **Second user:** Both attempts set to `ANALYZING`, then `triggerReconcilerAndUpdateStatuses(sessionId)` runs **in background** (fire-and-forget).

### Reconciler Flow (Background)

**Function:** `triggerReconcilerAndUpdateStatuses` in `stage2.ts`

**Steps:**
1. `runReconciler(sessionId)` → Returns `{ aUnderstandingB, bUnderstandingA }`
2. For each direction:
   - Check gaps severity: `gaps.severity === 'significant'` OR `recommendation.action === 'OFFER_SHARING'`
   - **Anti-loop check:** `hasContextAlreadyBeenShared(sessionId, guesserId, subjectId)`
     - Prevents infinite loop where resubmit → reconciler → AWAITING_SHARING → share → resubmit → loop
   - If context already shared → status = `READY` (skip sharing step)
   - Else if gaps exist → status = `AWAITING_SHARING` (subject must respond to share suggestion)
   - Else → status = `READY`
3. Update EmpathyAttempt status for both users
4. If `AWAITING_SHARING`:
   - `generateShareSuggestionForDirection(sessionId, guesserId, subjectId)` (background)
   - Publish `empathy.partner_considering_share` event to guesser
5. Publish `empathy.status_updated` event with **full empathy status data for both users**
6. Call `checkAndRevealBothIfReady(sessionId)` → If both `READY`, reveal simultaneously

**Ably Events from Reconciler:**

1. `empathy.partner_considering_share` (if gaps detected)
   - Channel: session channel
   - Payload: `{ forUserId: guesserId, timestamp }`
   - Purpose: Notify guesser that subject is considering sharing context

2. `empathy.status_updated` (always published)
   - Channel: session channel
   - Payload: `{ stage: 2, statuses: { userAId: 'READY', userBId: 'AWAITING_SHARING' }, empathyStatuses: <full status for both> }`
   - Purpose: Update both clients' empathy status cache immediately

### Acting User (Mobile)

**Mutation:** `useConsentToShareEmpathy` in `mobile/src/hooks/useStages.ts`

**Cache Updates:**

**onMutate (Optimistic):**
```typescript
// 1. Add optimistic empathy statement message
messageKeys.infinite(sessionId) ← {
  id: `optimistic-empathy-${timestamp}`,
  role: EMPATHY_STATEMENT,
  content: draftContent,
  sharedContentDeliveryStatus: 'sending'
}

// 2. Hide empathy draft panel immediately
stageKeys.empathyDraft(sessionId) ← {
  canConsent: false,
  alreadyConsented: true
}

// 3. Optimistically set empathy status
stageKeys.empathyStatus(sessionId) ← {
  myAttempt: { status: partnerAttempt ? 'ANALYZING' : 'HELD' },
  analyzing: !!partnerAttempt,
  sharedContentDeliveryStatus: 'sending'
}
```

**onSuccess:**
```typescript
// 1. Replace optimistic message with real empathy message
messageKeys.infinite(sessionId) ← Remove optimistic, add real message with skipTypewriter: true

// 2. Add transition AI message (if generated)
messageKeys.infinite(sessionId) ← Add AI message

// 3. Update empathy status cache directly (clear 'sending' status)
stageKeys.empathyStatus(sessionId) ← { sharedContentDeliveryStatus: 'pending' }

// 4. Invalidate for eventual server sync
invalidateQueries: empathyDraft, partnerEmpathy, progress, empathyStatus, sessionState
```

**onError:** Rollback all optimistic updates.

**UI State Changes:**
- Empathy panel hides immediately (via `computeShowEmpathyPanel` → `empathyAlreadyConsented: true`)
- If both shared: waiting banner may show "Reconciler analyzing..." (via Ably event)

### Partner (Mobile)

**Realtime Handler:** `useRealtime.ts` listens for `partner.empathy_shared`

**Cache Updates:**
```typescript
// Event includes full empathyStatus for partner, so update directly:
stageKeys.empathyStatus(sessionId) ← event.empathyStatus

// Also invalidate to refetch:
invalidateQueries: partnerEmpathy, empathyStatus, progress
```

**UI State Changes:**
- If partner hasn't shared yet: See "Waiting for [partner] to share empathy" banner
- If partner already shared: Both now `ANALYZING` → reconciler status may show

### Issues Found

**1. Race Condition Risk:** Reconciler runs in background after `consentToShare` returns. If mobile refetches `empathyStatus` immediately after mutation success, it may see `HELD` or `ANALYZING` before reconciler completes. This is mitigated by:
- `empathy.status_updated` event publishes full status after reconciler completes
- Mobile listens for this event and updates cache directly

**2. Missing Stage Cache Update:** When second user consents and both advance to `ANALYZING`, the `sessionKeys.state` cache is NOT updated with the new stage. This is intentional (per commit 6c6504e) to avoid invalidation race conditions, but means stage progression relies on separate `stageKeys.progress` invalidation.

**3. Reconciler Anti-Loop Logic:** The `hasContextAlreadyBeenShared` check prevents infinite loops, but this logic is buried in `triggerReconcilerAndUpdateStatuses`. If a future refactor removes this check, the loop will return.

---

## Interaction Path 3: Get Partner Empathy

**Trigger:** User polls/fetches partner's empathy attempt to see if it's ready.

### Backend Flow

**Endpoint:** `GET /sessions/:id/empathy/partner`
**Controller:** `getPartnerEmpathy` in `backend/src/controllers/stage2.ts`

**DB Reads:**
```sql
SELECT EmpathyAttempt
WHERE sessionId AND sourceUserId = partnerId

SELECT EmpathyValidation
WHERE attemptId AND userId = currentUserId
```

**Conditions for Revealing:**
- Partner's attempt exists
- `partnerAttempt.status === REVEALED` OR `partnerAttempt.status === VALIDATED`

If status is `HELD`, `ANALYZING`, `AWAITING_SHARING`, or `REFINING` → attempt is NOT returned (user sees "Waiting for partner").

**Ably Events:** None (this is a query endpoint).

### Acting User (Mobile)

**Query:** `usePartnerEmpathy` in `mobile/src/hooks/useStages.ts`

**Cache Key:** `stageKeys.partnerEmpathy(sessionId)`

**Stale Time:** 30 seconds (empathy status is more frequently polled via `useEmpathyStatus`).

**UI Usage:** Not frequently called directly. Instead, `useEmpathyStatus` provides combined status including partner empathy.

### Partner (Mobile)

**No interaction.** This is a read-only query.

### Issues Found

None. This is a simple query with clear gating logic.

---

## Interaction Path 4: Validate Partner's Empathy

**Trigger:** User marks partner's empathy statement as accurate/inaccurate.

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/validate`
**Controller:** `validateEmpathy` in `backend/src/controllers/stage2.ts`

**Validations:**
- User is in Stage 2
- Partner's empathy attempt exists

**DB Writes:**
```sql
1. UPSERT EmpathyValidation {
     attemptId, userId,
     validated: <boolean>,
     feedback: <optional string>,
     validatedAt: now
   }

2. IF validated === true:
     UPDATE EmpathyAttempt
     SET status = VALIDATED, deliveryStatus = SEEN, seenAt = now
     WHERE id = partnerAttempt.id

3. UPDATE StageProgress
   SET gatesSatisfied.empathyValidated = true
   WHERE sessionId, userId, stage = 2
```

**Ably Events:**

1. `partner.stage_completed` → Published to partner
   - Payload: `{ stage: 2, validated, completedBy: userId, empathyStatus: <partner's status>, triggeredByUserId: userId }`
   - Excludes actor (`excludeUserId: userId`) to prevent race conditions

2. IF validated === true: `empathy.status_updated` → Published to partner
   - Payload: `{ status: VALIDATED, forUserId: partnerId, empathyStatus: <partner's status>, validatedBy: userId, triggeredByUserId: userId }`
   - Purpose: Show partner a modal celebrating validation

**Stage 3 Transition:**
If both users have validated each other's empathy, trigger `triggerStage3Transition(sessionId, userId, partnerId)` in background.

### Acting User (Mobile)

**Mutation:** `useValidateEmpathy` in `mobile/src/hooks/useStages.ts`

**Cache Updates:**
```typescript
onSuccess:
  invalidateQueries: partnerEmpathy, progress, sessionDetail
```

**No optimistic update** (validation is not latency-sensitive).

**UI State Changes:**
- Accuracy feedback panel hides (via `computeShowAccuracyFeedbackPanel` → `hasPartnerEmpathyForValidation: false`)
- If both validated: Stage 3 transition message appears

### Partner (Mobile)

**Realtime Handler:** Listens for `partner.stage_completed` and `empathy.status_updated`

**Cache Updates:**
```typescript
// Update empathy status cache with event payload
stageKeys.empathyStatus(sessionId) ← event.empathyStatus

// Invalidate for refetch
invalidateQueries: empathyStatus, progress
```

**UI State Changes:**
- If `validated === true`: Modal shows "Partner found your empathy accurate!" (triggered by `empathy.status_updated` event with `forUserId: partnerId`)
- If both validated: Stage 3 transition message appears

### Issues Found

**1. Validation Modal Logic:** The modal trigger relies on `empathy.status_updated` event with `forUserId: partnerId`. If this event is missed (connection drop), partner won't see the modal. However, the validation status is persisted in DB, so a refetch will show correct state.

**2. Stage 3 Transition Race:** `triggerStage3Transition` runs in background when both users validate. If mobile immediately advances to Stage 3 via client-side logic before the transition message is created, the message may appear out of order.

---

## Interaction Path 5: Empathy Refinement (Legacy NEEDS_WORK Flow)

**Trigger:** User's empathy attempt has `status: NEEDS_WORK` or `REFINING`, and they want to improve it through AI conversation.

**Note:** This is the older refinement flow. The new asymmetric reconciler flow uses share suggestions (Path 6-7) instead.

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/refine`
**Controller:** `refineEmpathy` in `backend/src/controllers/stage2.ts`

**Validations:**
- User's empathy attempt exists
- `attempt.status === NEEDS_WORK` OR `attempt.status === REFINING`

**Logic:**
1. Get reconciler result for abstract guidance hint
2. If `status === REFINING`, fetch shared context from subject
3. Build AI prompt with area hint and shared context (if available)
4. Call `getSonnetResponse` to generate refinement conversation
5. Return AI response with optional `proposedRevision` and `canResubmit` flag

**DB Writes:** None (refinement conversation is ephemeral).

**Ably Events:** None.

### Acting User (Mobile)

**Mutation:** Not currently wired in mobile (refinement UI not implemented in v1.0).

**Expected Flow:**
- User in `NEEDS_WORK` or `REFINING` status
- Opens refinement chat
- Sends messages to refine understanding
- AI proposes revised statement
- User submits via `useResubmitEmpathy` (Path 5b)

### Partner (Mobile)

**No interaction.** Refinement is private.

### Issues Found

**1. UI Not Implemented:** Mobile app doesn't have a refinement chat UI for `NEEDS_WORK` status. Users are stuck if reconciler sets status to `NEEDS_WORK` without offering a share suggestion.

**2. Shared Context Delivery:** When `status === REFINING`, shared context is included in the AI prompt. However, the prompt says "DO NOT reveal specific things partner said" for `NEEDS_WORK`, but "You CAN reference the shared context" for `REFINING`. This inconsistency could confuse the AI.

---

## Interaction Path 5b: Resubmit Empathy Statement

**Trigger:** User has refined their empathy attempt and wants to resubmit for re-analysis.

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/resubmit`
**Controller:** `resubmitEmpathy` in `backend/src/controllers/stage2.ts`

**Validations:**
- User's empathy attempt exists
- `attempt.status === NEEDS_WORK` OR `attempt.status === REFINING`

**DB Writes:**
```sql
1. UPDATE EmpathyAttempt
   SET content = <new content>,
       status = ANALYZING,
       revisionCount = revisionCount + 1
   WHERE sessionId AND sourceUserId = userId

2. DELETE ReconcilerResult
   WHERE sessionId AND guesserId = userId
   (Forces reconciler to re-run)

3. INSERT Message {
     role: EMPATHY_STATEMENT,
     content: <new content>,
     senderId: userId,
     forUserId: userId,
     stage: 2
   }
```

**Ably Events:** None directly, but reconciler will run and publish events (see Path 2).

**Reconciler Trigger:**
- `triggerReconcilerForUser(sessionId, guesserId, subjectId)` runs in background
- Uses `runReconcilerForDirection` (asymmetric flow) instead of `runReconciler` (symmetric flow)
- This is critical: at this point, only the guesser may have shared empathy

### Acting User (Mobile)

**Mutation:** `useResubmitEmpathy` in `mobile/src/hooks/useStages.ts`

**Cache Updates:**

**onMutate (Optimistic):**
```typescript
// Add optimistic message
messageKeys.infinite(sessionId) ← {
  id: `optimistic-resubmit-${timestamp}`,
  role: EMPATHY_STATEMENT,
  content: revisedContent,
  sharedContentDeliveryStatus: 'sending'
}
```

**onSuccess:**
```typescript
// Replace optimistic with real message
messageKeys.infinite(sessionId) ← Remove optimistic, add real message with skipTypewriter: true

// Add transition AI message (if generated)
messageKeys.infinite(sessionId) ← Add AI message

// Invalidate for reconciler to update status
invalidateQueries: empathyDraft, empathyStatus, progress
```

**UI State Changes:**
- Status changes from `REFINING` or `NEEDS_WORK` → `ANALYZING` → (reconciler result) → `READY` or back to `AWAITING_SHARING`

### Partner (Mobile)

**No direct notification.** However, if reconciler completes and sets status to `READY` for both, `checkAndRevealBothIfReady` will publish reveal events.

### Issues Found

**1. Reconciler Loop Risk:** If reconciler finds gaps again after resubmit, it will set status back to `AWAITING_SHARING`. The anti-loop check (`hasContextAlreadyBeenShared`) prevents asking for more sharing, but the guesser could be stuck in `REFINING` → resubmit → `AWAITING_SHARING` → (already shared) → `READY` cycle if context wasn't helpful.

**2. Delivery Status Missing:** The resubmit response includes `empathyMessage.deliveryStatus: 'pending'`, but this field isn't defined in the Message model (it's only on EmpathyAttempt). This could cause type errors in mobile.

---

## Interaction Path 6: Get Share Suggestion (Asymmetric Reconciler - Subject Side)

**Trigger:** Reconciler detected gaps in partner's (guesser's) empathy attempt. Subject is shown a share suggestion.

### Backend Flow

**Endpoint:** `GET /sessions/:id/empathy/share-suggestion`
**Controller:** `getShareSuggestion` in `backend/src/controllers/stage2.ts`

**Service:** `getShareSuggestionForUser(sessionId, userId)` in `backend/src/services/reconciler.ts`

**Logic:**
1. Find `ReconcilerResult` where `subjectId = userId` (user is the subject whose context is needed)
2. Find associated `ReconcilerShareOffer` with `status = OFFERED`
3. Return suggestion with:
   - `guesserName`: Name of person trying to understand
   - `suggestedShareFocus`: High-level topic to share about
   - `suggestedContent`: AI-generated draft content
   - `reason`: Why sharing would help
   - `action`: OFFER_SHARING (strong) or OFFER_OPTIONAL (soft)

**DB Reads:**
```sql
SELECT ReconcilerResult
WHERE sessionId AND subjectId = userId

SELECT ReconcilerShareOffer
WHERE resultId AND status = OFFERED

SELECT User.firstName
WHERE id = guesserId
```

**Ably Events:** None (this is a query endpoint).

### Acting User (Mobile)

**Query:** `useShareOffer` in `mobile/src/hooks/useStages.ts`

**Cache Key:** `stageKeys.shareOffer(sessionId)`

**Stale Time:** 0 (always check for fresh offer).

**UI State Changes:**
- If `hasSuggestion: true` → Share suggestion panel shows above input (via `computeShowShareSuggestionPanel`)
- Panel priority: Higher than empathy statement panel, lower than feel-heard panel

### Partner (Guesser) (Mobile)

**Receives Event:** `empathy.partner_considering_share` (published when reconciler set status to `AWAITING_SHARING`)

**Cache Updates:**
```typescript
// Invalidate empathy status to show waiting state
invalidateQueries: empathyStatus
```

**UI State Changes:**
- Waiting banner shows: "Waiting for [partner] to consider sharing context" (via `waitingStatus: 'awaiting-subject-decision'`)

### Issues Found

**1. Share Suggestion Generation Timing:** `generateShareSuggestionForDirection` runs in background after reconciler completes. If subject polls for share suggestion before generation completes, they'll see `hasSuggestion: false`. However, the `empathy.status_updated` event should trigger a refetch.

**2. Offer Status Not Updated on Poll:** The `GET /share-suggestion` endpoint doesn't update the offer status from `PENDING` → `OFFERED`. This happens implicitly when the offer is generated, but if generation fails, the offer may be stuck in `PENDING` forever.

---

## Interaction Path 7: Respond to Share Suggestion

**Trigger:** Subject accepts, declines, or refines the share suggestion.

### Backend Flow

**Endpoint:** `POST /sessions/:id/empathy/share-suggestion/respond`
**Controller:** `respondToShareSuggestion` in `backend/src/controllers/stage2.ts`

**Validations:**
- `action` must be one of: `accept`, `decline`, `refine`
- If `action === refine`, `refinedContent` is required

**Service:** `reconcilerRespondToShareSuggestion(sessionId, userId, { action, refinedContent })` in `reconciler.ts`

**Logic:**

**If action === 'accept' or 'refine':**
```sql
1. INSERT Message {
     role: SHARED_CONTEXT,
     content: <suggestedContent or refinedContent>,
     senderId: userId (subject),
     forUserId: guesserId,
     stage: 2
   }

2. UPDATE ReconcilerShareOffer
   SET status = ACCEPTED, respondedAt = now

3. UPDATE EmpathyAttempt
   SET status = REFINING
   WHERE sessionId AND sourceUserId = guesserId
```

**If action === 'decline':**
```sql
1. UPDATE ReconcilerShareOffer
   SET status = DECLINED, respondedAt = now

2. UPDATE EmpathyAttempt
   SET status = READY
   WHERE sessionId AND sourceUserId = guesserId
   (Proceed without sharing)
```

**Ably Events:**

**If accepted/refined:**
- `empathy.refining` → Published to guesser
  - Payload: `{ guesserId, forUserId: guesserId, empathyStatus: <guesser's full status>, hasNewContext: true }`
  - Purpose: Notify guesser they have new shared context to review

**If declined:**
- No event (guesser continues with current understanding)

### Acting User (Subject) (Mobile)

**Mutation:** `useRespondToShareOffer` in `mobile/src/hooks/useStages.ts`

**Cache Updates:**

**onMutate (Optimistic) — if action === 'accept':**
```typescript
// Add optimistic "What you shared" message
messageKeys.infinite(sessionId) ← {
  id: `optimistic-shared-${timestamp}`,
  role: EMPATHY_STATEMENT,
  content: sharedContent
}

// Hide share offer panel immediately
stageKeys.shareOffer(sessionId) ← { hasSuggestion: false }
```

**onSuccess:**
```typescript
// Replace optimistic with real message (if provided)
messageKeys.infinite(sessionId) ← Remove optimistic, add real message

// Invalidate queries
invalidateQueries: empathyStatus, shareOffer, progress
```

**UI State Changes:**
- Share suggestion panel hides immediately (via local latch `hasRespondedToShareOfferLocal: true`)
- If accepted: "What you shared" message appears in timeline

### Partner (Guesser) (Mobile)

**Realtime Handler:** Listens for `empathy.refining`

**Cache Updates:**
```typescript
// Event includes full empathyStatus for guesser
stageKeys.empathyStatus(sessionId) ← event.empathyStatus

// Invalidate for refetch
invalidateQueries: empathyStatus, progress
```

**UI State Changes:**
- Status changes from `AWAITING_SHARING` → `REFINING`
- **Critical:** Input is HIDDEN until guesser views the Share tab (`hasUnviewedSharedContext: true`)
- After viewing Share tab: "Refine your understanding" prompt appears (NOT implemented in v1.0)

### Issues Found

**1. Guesser Blocked Without Refinement UI:** When guesser receives shared context (`status: REFINING`), they must view the Share tab before continuing. However, there's no clear "Refine" button in the AI chat. The intended flow is to use the Share screen's "Refine" button, but this isn't obvious to users.

**2. Shared Context Not Shown in Messages:** The `SHARED_CONTEXT` message is created with `forUserId: guesserId`, meaning it only appears in the guesser's chat. The subject (who shared it) doesn't see it in their own timeline. This could be confusing if they want to reference what they shared.

**3. Decline Flow Not Tested:** If subject declines to share, guesser's status is set to `READY` immediately. But if guesser's empathy attempt still has significant gaps, this could lead to inaccurate understanding being validated.

---

## Interaction Path 8: Empathy Exchange Status (Polling/Query Endpoint)

**Trigger:** Mobile polls for current empathy exchange status to update UI.

### Backend Flow

**Endpoint:** `GET /sessions/:id/empathy/status`
**Controller:** `getEmpathyExchangeStatus` in `backend/src/controllers/stage2.ts`

**Service:** `buildEmpathyExchangeStatus(sessionId, userId)` in `backend/src/services/empathy-status.ts`

**Returns:** `EmpathyExchangeStatusResponse` with:
- `myAttempt`: Current user's empathy attempt (content, status, delivery status, revision count)
- `partnerAttempt`: Partner's attempt (if REVEALED or VALIDATED)
- `partnerCompletedStage1`: Whether partner confirmed feel-heard
- `analyzing`: Whether reconciler is running
- `awaitingSharing`: Whether waiting for subject to respond
- `hasNewSharedContext`: Whether guesser has unviewed context
- `hasUnviewedSharedContext`: Whether guesser MUST view Share tab before continuing
- `sharedContext`: Shared context from subject (if any)
- `refinementHint`: Abstract guidance for refinement (if NEEDS_WORK)
- `readyForStage3`: Whether both validated
- `messageCountSinceSharedContext`: For delaying refinement UI
- `sharedContentDeliveryStatus`: Delivery status of shared content
- `mySharedContext`: Content the user shared (for Subject to see in Partner tab)
- `myReconcilerResult`: Reconciler result summary
- `partnerHasSubmittedEmpathy`: Whether partner submitted (even if not revealed)
- `partnerEmpathyHeldStatus`: Partner's status (even if not revealed)

**DB Reads:** Complex multi-table query fetching all empathy-related data.

**Ably Events:** None (this is a query endpoint).

### Acting User (Mobile)

**Query:** `useEmpathyStatus` in `mobile/src/hooks/useStages.ts`

**Cache Key:** `stageKeys.empathyStatus(sessionId)`

**Stale Time:** 5 seconds (frequently polled during Stage 2).

**UI Usage:** Used by `computeChatUIState` to determine panel visibility:
- `analyzing: true` → Show "Reconciler analyzing..." banner
- `awaitingSharing: true` → Show waiting banner or share suggestion panel
- `hasNewSharedContext: true` → Show refine prompt (NOT implemented)
- `hasUnviewedSharedContext: true` → Hide input until Share tab viewed
- `myAttempt.status: REVEALED` → Show partner empathy for validation

### Partner (Mobile)

**No direct interaction.** However, Ably events trigger invalidations that cause this query to refetch:
- `empathy.status_updated` → invalidates `empathyStatus`
- `partner.empathy_shared` → invalidates `empathyStatus`

### Issues Found

**1. Over-Polling:** Mobile polls this endpoint every 5 seconds during Stage 2. With Ably events updating cache, this is mostly redundant. However, it provides a safety net for missed events.

**2. Delivery Status Mismatch:** The `getEmpathyDeliveryStatus` function in `empathy-status.ts` derives delivery status from `attempt.status`:
- `VALIDATED` → `'seen'`
- `REVEALED` → `'delivered'`
- Else → `'pending'`

But the `EmpathyAttempt` model has a separate `deliveryStatus` field (PENDING, SEEN). These two status sources could diverge if not kept in sync.

---

## Panel Visibility Logic (Stage 2 Specific)

All panel visibility is computed by `computeChatUIState` in `mobile/src/utils/chatUIState.ts`.

### Empathy Statement Panel

**Function:** `computeShowEmpathyPanel(inputs)`

**Conditions:**
1. `myStage === Stage.PERSPECTIVE_STRETCH` (Stage 2)
2. `hasEmpathyContent === true` (liveProposedEmpathyStatement OR draft content exists)
3. `empathyAlreadyConsented === false` (not yet shared)
4. `hasSharedEmpathyLocal === false` (local latch to prevent flash after sharing)
5. `isRefiningEmpathy === false` (when refining, use Share screen's Refine button instead)

**Issues:**
- If `myStage` cache is stale (due to intentional non-invalidation in `useConfirmFeelHeard`), panel may not show even if user is in Stage 2.
- Local latch `hasSharedEmpathyLocal` is component state, not cache. If user navigates away and back, latch is lost and panel could reappear (though cache should prevent this).

### Share Suggestion Panel

**Function:** `computeShowShareSuggestionPanel(inputs)`

**Conditions:**
1. `hasShareSuggestion === true` (from `useShareOffer`)
2. `hasRespondedToShareOfferLocal === false` (local latch)

**Priority:** Higher than empathy panel, lower than feel-heard panel.

**Issues:**
- Local latch `hasRespondedToShareOfferLocal` is component state. Same navigation issue as empathy panel.

### Accuracy Feedback Panel

**Function:** `computeShowAccuracyFeedbackPanel(inputs)`

**Conditions:**
1. `myStage === Stage.PERSPECTIVE_STRETCH` (Stage 2)
2. `hasPartnerEmpathyForValidation === true` (partner empathy exists and not yet validated)

**Issues:**
- This panel is NOT currently implemented in mobile UI (no Accuracy Feedback component exists).
- The logic is in place, but the actual UI is missing.

---

## Consent Flow (Stage 2 Specific)

**Note:** The consent flow is mostly generic (handled by `backend/src/routes/consent.ts` and `consent.ts`), but Stage 2 has a specific consent type: `EMPATHY_DRAFT`.

### Consent Request Creation

**Implicitly created** when user marks draft as `readyToShare: true`. No explicit consent request is made; the `consentToShare` endpoint checks for existence of a ready draft.

### Consent Grant

**Handled by:** `consentToShare` in `stage2.ts` (not generic consent controller).

**DB Writes:**
```sql
INSERT ConsentRecord {
  userId, sessionId,
  targetType: EMPATHY_DRAFT,
  targetId: draftId,
  requestedByUserId: userId,  // Self-consent
  decision: GRANTED,
  decidedAt: now
}
```

**No partner consent required** — each user independently consents to share their own draft.

### Consent Deny

**Not applicable.** Users can choose not to mark draft as ready to share, but there's no explicit "deny consent" action.

### Consent Revoke

**Not implemented for empathy drafts.** Once shared, empathy attempts cannot be un-shared (per design principle: commitment to the process).

---

## Waiting States in Stage 2

Waiting states are computed by `computeWaitingStatus` in `mobile/src/utils/getWaitingStatus.ts`.

### Scenario 1: User A has shared, User B hasn't

**User A (acted first):**
- `myAttempt.status: HELD` (waiting for partner)
- `waitingStatus: 'empathy-pending'`
- Banner: "Waiting for [Partner] to share their empathy statement"
- Input: Visible (can continue chatting or use Inner Thoughts)

**User B (hasn't acted):**
- `empathyDraft` exists with content
- Empathy panel shows: "Review what you'll share"
- Input: Visible (normal flow)

### Scenario 2: Both shared, reconciler analyzing

**Both users:**
- `myAttempt.status: ANALYZING`
- `analyzing: true`
- `waitingStatus: 'reconciler-analyzing'`
- Banner: "The reconciler is analyzing your empathy statements..."
- Input: Visible

**Duration:** Usually 5-15 seconds (reconciler + LLM call).

### Scenario 3: User A has gaps, User B is ready

**User A (guesser with gaps):**
- `myAttempt.status: AWAITING_SHARING` (waiting for partner to share context)
- `waitingStatus: 'awaiting-subject-decision'`
- Banner: "Waiting for [Partner] to consider sharing additional context"
- Input: Visible

**User B (subject with share suggestion):**
- `shareOffer.hasSuggestion: true`
- Share suggestion panel shows above input
- `waitingStatus: null` (not waiting)
- Input: Visible

### Scenario 4: User A refining after receiving context

**User A (guesser refining):**
- `myAttempt.status: REFINING`
- `hasUnviewedSharedContext: true` → **Input HIDDEN** until Share tab viewed
- After viewing Share tab: `hasNewSharedContext: true`
- Expected UI: "Refine your understanding" prompt (NOT implemented)

**User B (subject who shared):**
- `mySharedContext` exists with `deliveryStatus: 'pending'` → `'delivered'` → `'seen'`
- `waitingStatus: 'revision-analyzing'` (after guesser resubmits)
- Banner: "Waiting for [Partner] to refine their understanding"
- Input: Visible

### Scenario 5: Both ready, waiting for reveal

**Both users:**
- `myAttempt.status: READY`
- `waitingStatus: 'empathy-pending'` (waiting for both to be ready)
- Banner: "Waiting for [Partner] to finish Stage 2"
- Input: Visible

**Reveal trigger:** `checkAndRevealBothIfReady(sessionId)` runs when both are `READY`.

### Scenario 6: Partner empathy revealed, waiting for validation

**Both users:**
- `myAttempt.status: REVEALED`
- `partnerAttempt.status: REVEALED`
- Accuracy feedback panel shows (for both users)
- Input: Visible (can discuss empathy statements)

---

## Stage 2 → Stage 3 Entry Conditions

**Gate Conditions (per `backend/src/middleware/stage-gates.ts`):**
```typescript
Stage 2 → Stage 3:
- empathyShared: true (EmpathyAttempt exists for user)
- empathyValidated: true (EmpathyValidation.validated === true for partner's attempt)
```

**Automatic Advancement:**
- `triggerStage3Transition(sessionId, userId, partnerId)` is called when both users validate each other's empathy
- This creates a transition message and updates `StageProgress` for both users:
  - Stage 2: `status: COMPLETED, completedAt: now`
  - Stage 3: `status: IN_PROGRESS, startedAt: now`

**Manual Advancement:**
- User can also manually advance via `POST /sessions/:id/stages/advance` if gates are satisfied

**Issues:**
- No explicit "Ready to advance" confirmation UI. Users just see a transition message and are automatically moved to Stage 3.
- If one user validates but the other doesn't, the first user is stuck waiting with no clear indication of what's blocking them.

---

## Issues Summary (Consolidated)

### Critical (Blocks User Flow)

1. **Missing Refinement UI (Guesser Side)**
   - **Status:** REFINING after receiving shared context
   - **Expected:** "Refine your understanding" prompt in AI chat or Share screen
   - **Actual:** Input is hidden, no clear next step
   - **Impact:** Guesser is blocked and doesn't know how to proceed

2. **Missing Accuracy Feedback Panel**
   - **Logic exists:** `computeShowAccuracyFeedbackPanel`
   - **UI missing:** No component renders this panel
   - **Impact:** Users can't validate partner's empathy via panel (must use other flow)

### High (Race Conditions / Reliability)

3. **Reconciler Status Race Condition**
   - **Issue:** Reconciler runs in background after `consentToShare` returns
   - **Risk:** Mobile refetch before reconciler completes → sees stale status
   - **Mitigation:** `empathy.status_updated` event + polling
   - **Impact:** Brief UI flicker showing wrong status

4. **Stage Cache Not Updated on Consent**
   - **Issue:** `sessionKeys.state` intentionally NOT invalidated after mutations
   - **Reason:** Avoid invalidation race conditions (per commit 6c6504e)
   - **Impact:** Panel visibility relies on stale stage cache until separate refetch

5. **Validation Modal Depends on Ably Event**
   - **Issue:** Modal trigger is `empathy.status_updated` with `forUserId: partnerId`
   - **Risk:** If event is missed (connection drop), modal won't show
   - **Mitigation:** DB state is correct, refetch shows correct status
   - **Impact:** User misses celebratory modal

### Medium (UX / Clarity)

6. **Guesser Can't See Shared Context in Timeline**
   - **Issue:** `SHARED_CONTEXT` message only has `forUserId: guesserId`
   - **Impact:** Subject can't reference what they shared in chat
   - **Workaround:** Partner tab shows shared content

7. **Decline Flow Not Tested**
   - **Issue:** If subject declines to share, guesser proceeds with gaps
   - **Risk:** Inaccurate understanding validated as accurate
   - **Impact:** Process integrity compromised

8. **Over-Polling Empathy Status**
   - **Issue:** Mobile polls every 5 seconds during Stage 2
   - **Reason:** Safety net for missed Ably events
   - **Impact:** Unnecessary API load, but provides reliability

### Low (Code Quality / Maintenance)

9. **Delivery Status Dual Source**
   - **Issue:** `getEmpathyDeliveryStatus` derives from `attempt.status`, but `EmpathyAttempt.deliveryStatus` exists
   - **Risk:** Two sources could diverge
   - **Impact:** UI shows incorrect delivery status

10. **Anti-Loop Logic Buried**
    - **Issue:** `hasContextAlreadyBeenShared` check prevents infinite loop
    - **Location:** `triggerReconcilerAndUpdateStatuses` (buried in complex function)
    - **Risk:** Future refactor could remove this check
    - **Impact:** Infinite loop: resubmit → reconciler → AWAITING_SHARING → share → resubmit

11. **Local Latches in Component State**
    - **Issue:** `hasSharedEmpathyLocal`, `hasRespondedToShareOfferLocal` are component state
    - **Risk:** Navigation clears latches → panels could reappear
    - **Mitigation:** Cache should prevent this, but not guaranteed
    - **Impact:** UI flicker on navigation

---

## Cross-Reference with CONCERNS.md

From `.planning/codebase/CONCERNS.md`:

> **Reconciler race conditions (manual retry logic with 100ms delays)**

**Found in this audit:**
- `triggerReconcilerAndUpdateStatuses` runs in background (fire-and-forget)
- No explicit retry logic with delays in current code
- However, the `runReconciler` service may have retry logic (not audited here)

> **Stage transition cache updates (documented fix for feel-heard, but pattern repeats)**

**Found in this audit:**
- `useConfirmFeelHeard` intentionally does NOT invalidate `sessionKeys.state` (commit 6c6504e)
- Same pattern in `useConsentToShareEmpathy` — cache is updated directly, not invalidated
- This is intentional to avoid race conditions, but creates complexity

---

## Recommendations

### Immediate (v1.0 Blocker)

1. **Implement Refinement UI for Guesser**
   - Add "Refine" button on Share screen when `status: REFINING`
   - Button opens refinement chat or inline editor
   - Clear instruction: "Review shared context and update your understanding"

2. **Implement Accuracy Feedback Panel**
   - Wire up `computeShowAccuracyFeedbackPanel` logic
   - Create `AccuracyFeedbackPanel` component
   - Show above input when partner empathy is revealed

3. **Add Blocking Reason to Waiting Banners**
   - When `waitingStatus: 'empathy-pending'`, show which user is blocking
   - Example: "Waiting for [Partner] to validate your empathy statement"

### Short-Term (v1.1)

4. **Add Shared Context to Subject's Timeline**
   - Change `SHARED_CONTEXT` message to show for both users
   - Subject sees "What you shared", Guesser sees "Context from [Partner]"

5. **Test Decline Flow**
   - Add E2E test for subject declining share suggestion
   - Verify guesser's experience when proceeding with gaps

6. **Consolidate Delivery Status**
   - Remove `getEmpathyDeliveryStatus` derivation
   - Use `EmpathyAttempt.deliveryStatus` as single source of truth
   - Update on validation: `VALIDATED` → `deliveryStatus: SEEN`

### Long-Term (v1.2+)

7. **Reduce Polling Frequency**
   - Rely more on Ably events for status updates
   - Only poll empathy status when Ably connection is lost
   - Add exponential backoff for polling

8. **Move Local Latches to Cache**
   - `hasSharedEmpathyLocal` → derive from `empathyDraft.alreadyConsented`
   - `hasRespondedToShareOfferLocal` → derive from `shareOffer.status`
   - Eliminates component state, improves navigation resilience

9. **Extract Anti-Loop Logic**
   - Move `hasContextAlreadyBeenShared` to standalone guard function
   - Add explicit logging when loop is prevented
   - Add test coverage for loop prevention

---

## Files Audited

**Backend:**
- `backend/src/routes/stage2.ts` — API endpoints
- `backend/src/controllers/stage2.ts` — Request handlers (2,262 lines)
- `backend/src/services/empathy-status.ts` — Status query builder
- `backend/src/services/realtime.ts` — Ably event publishing
- `backend/src/routes/consent.ts` — Generic consent routes
- `backend/src/controllers/consent.ts` — Generic consent handlers

**Mobile:**
- `mobile/src/hooks/useStages.ts` — Stage mutations (1,886 lines)
- `mobile/src/hooks/useChatUIState.ts` — UI state derivation hook
- `mobile/src/utils/chatUIState.ts` — Pure UI state computation (525 lines)
- `mobile/src/hooks/queryKeys.ts` — Cache key definitions

**Shared:**
- `shared/src/dto/empathy.ts` — Empathy DTOs and types (391 lines)
- `shared/src/dto/session-state.ts` — Session state response

---

## Completion Checklist

- [x] All 8 interaction paths documented
- [x] Backend flow traced for each path (endpoints, controllers, DB writes)
- [x] Ably events documented (event name, payload, channel, recipients)
- [x] Acting user cache updates documented (optimistic + success + error)
- [x] Partner cache updates documented (realtime handlers)
- [x] UI state changes documented (panel visibility, waiting states)
- [x] Panel visibility logic mapped to cache values
- [x] Consent flow fully traced
- [x] Waiting states documented for asymmetric scenarios
- [x] Stage 2 → Stage 3 entry conditions identified
- [x] Issues flagged with severity ratings
- [x] Cross-referenced with CONCERNS.md
- [x] Recommendations provided

---

**Audit completed:** 2026-02-14
**Total interaction paths:** 8
**Total issues found:** 11 (1 critical, 2 high, 4 medium, 4 low)
**Lines of code audited:** ~5,000+ lines across backend and mobile
