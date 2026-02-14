# Reconciler State Machine Audit

**Last Updated:** 2026-02-14
**Component:** Empathy Reconciler (Stage 2)
**Purpose:** Complete documentation of the reconciler state machine, database schema, race conditions, and known issues

---

## Executive Summary

The **Empathy Reconciler** is the core system that manages the asymmetric empathy exchange flow in Stage 2 (Perspective Stretch). It analyzes gaps between what one person guessed about their partner's feelings (the "guesser") vs. what the partner actually expressed in Stage 1 (the "subject"), and orchestrates a sharing/refinement loop until both directions are complete.

**Key Characteristics:**
- **Asymmetric execution**: Runs independently for each direction (A→B and B→A)
- **Held-until-ready pattern**: Empathy statements are held until both pass reconciliation
- **Mutual reveal**: Neither sees the other's empathy until both are READY
- **Share suggestion loop**: If gaps exist, subject receives AI suggestion to share more context
- **Retry logic**: Uses 100ms delays to work around transaction visibility issues

---

## 1. Database Tables Involved

### 1.1 EmpathyAttempt

**Purpose:** Tracks the empathy statement shared by the guesser (their guess about what the subject is feeling).

**Key Fields:**
- `id` (string): Primary key
- `sessionId` (string): Session reference
- `sourceUserId` (string): The guesser who wrote this empathy statement
- `content` (text): The empathy statement itself
- `status` (EmpathyStatus): Current state in reconciler flow
- `sharedAt` (DateTime): When the guesser consented to share
- `revealedAt` (DateTime?): When revealed to the subject
- `revisionCount` (int): Number of times refined
- `deliveryStatus` (SharedContentDeliveryStatus): PENDING → DELIVERED → SEEN
- `deliveredAt`, `seenAt` (DateTime?): Delivery tracking

**Status Values (EmpathyStatus enum):**
1. **HELD**: Waiting for subject to complete Stage 1
2. **ANALYZING**: Reconciler is comparing guess vs. actual
3. **AWAITING_SHARING**: Gaps found, waiting for subject to respond to share suggestion
4. **REFINING**: Guesser received shared context, can refine empathy
5. **NEEDS_WORK**: Legacy status (use AWAITING_SHARING instead)
6. **READY**: Reconciler passed, waiting for partner's direction to also be READY
7. **REVEALED**: Both directions READY → empathy shown to subject
8. **VALIDATED**: Subject has confirmed accuracy

**Role in State Machine:**
This is the primary state tracker. The `status` field drives the entire reconciler flow. The state machine transitions happen via updates to this field.

---

### 1.2 ReconcilerResult

**Purpose:** Stores the output of reconciler AI analysis comparing guesser's empathy statement vs. subject's Stage 1 content.

**Key Fields:**
- `sessionId`, `guesserId`, `subjectId`: Unique direction identifier
- **Alignment:**
  - `alignmentScore` (0-100)
  - `alignmentSummary` (text)
  - `correctlyIdentified` (string[]): What they got right
- **Gaps:**
  - `gapSeverity`: 'none', 'minor', 'moderate', 'significant'
  - `gapSummary` (text)
  - `missedFeelings` (string[]): What they missed
  - `misattributions` (string[]): What they got wrong
  - `mostImportantGap` (text?)
- **Recommendation:**
  - `recommendedAction`: 'PROCEED', 'OFFER_OPTIONAL', 'OFFER_SHARING'
  - `rationale` (text)
  - `sharingWouldHelp` (boolean)
  - `suggestedShareFocus` (text?): Topic for subject to share about
- **Abstract Guidance (for refinement):**
  - `areaHint`, `guidanceType`, `promptSeed`: Non-specific hints for AI refinement conversation

**Role in State Machine:**
Created once per direction during ANALYZING status. The `recommendedAction` determines the next state:
- PROCEED → READY
- OFFER_SHARING (+ suggestedShareFocus) → AWAITING_SHARING
- OFFER_OPTIONAL (+ suggestedShareFocus) → AWAITING_SHARING
- OFFER_OPTIONAL (no suggestedShareFocus) → READY (treated as PROCEED per US-8)

**Cascade Behavior:**
Deleted when guesser resubmits empathy (triggers re-analysis). Deletion cascades to ReconcilerShareOffer.

---

### 1.3 ReconcilerShareOffer

**Purpose:** Tracks the share suggestion made to the subject and their response.

**Key Fields:**
- `resultId` (foreign key to ReconcilerResult, unique)
- `userId` (string): The subject being asked to share
- `status` (ReconcilerShareStatus):
  - PENDING → OFFERED → ACCEPTED | DECLINED | EXPIRED
- `suggestedContent` (text?): AI-generated draft of what to share
- `suggestedReason` (text?): Why this would help
- `refinedContent` (text?): If user refined the suggestion
- `sharedContent` (text?): Final content shared
- `sharedAt`, `declinedAt` (DateTime?)
- `deliveryStatus` (SharedContentDeliveryStatus): PENDING → DELIVERED → SEEN
- `deliveredAt`, `seenAt` (DateTime?): Delivery tracking

**Role in State Machine:**
Created when EmpathyAttempt transitions to AWAITING_SHARING. The subject's response changes the status:
- ACCEPTED → creates SHARED_CONTEXT messages, sets EmpathyAttempt to REFINING
- DECLINED → sets EmpathyAttempt to READY
- EXPIRED (timeout) → sets EmpathyAttempt to READY

**Cascade Behavior:**
Automatically deleted when ReconcilerResult is deleted (when guesser resubmits). This is the source of the infinite loop bug documented in hasContextAlreadyBeenShared check.

---

### 1.4 EmpathyValidation

**Purpose:** Records whether the subject validated the guesser's empathy as accurate.

**Key Fields:**
- `attemptId` (foreign key to EmpathyAttempt)
- `userId` (string): The subject who is validating
- `validated` (boolean): true = accurate, false = inaccurate
- `feedback` (text?): Optional feedback if inaccurate
- `feedbackShared` (boolean): Whether feedback was shared with guesser

**Role in State Machine:**
Only used after REVEALED status. When validated=true, sets EmpathyAttempt.status to VALIDATED. Both users must validate before advancing to Stage 3.

---

### 1.5 Message

**Purpose:** Stores all chat messages, including empathy-related special messages.

**Relevant MessageRole values:**
- `EMPATHY_STATEMENT`: The guesser's shared empathy (appears in their own chat)
- `SHARED_CONTEXT`: Context shared by subject to help guesser refine
- `SHARE_SUGGESTION`: Legacy (not currently used in new flow)
- `AI`: Standard AI messages including reconciler feedback

**Role in State Machine:**
Messages are created at key transitions:
- EMPATHY_STATEMENT message created on consent to share
- SHARED_CONTEXT messages created when subject accepts/refines share suggestion (3 messages: intro AI, the shared context itself, reflection AI)
- AI messages for alignment feedback when status → READY

**Cascade Behavior:**
SHARED_CONTEXT messages persist even when ReconcilerResult is deleted. This causes the infinite loop (share suggestion loop) because the code uses SHARED_CONTEXT messages to detect "already shared" state.

---

### 1.6 StageProgress

**Purpose:** Tracks user's stage completion state.

**Relevant Fields:**
- `sessionId`, `userId`, `stage`
- `status`: NOT_STARTED, IN_PROGRESS, GATE_PENDING, COMPLETED
- `gatesSatisfied` (JSON): Stage-specific completion conditions
  - Stage 2 gates: `{ empathyValidated: boolean, validatedAt: string }`

**Role in State Machine:**
Not directly part of reconciler state machine, but validation updates gatesSatisfied. Both users must have `empathyValidated: true` before Stage 2 → 3 transition.

---

## 2. State Machine Diagram

### 2.1 Valid State Transitions

```
[User Consents to Share Empathy]
         ↓
      HELD (waiting for subject to complete Stage 1)
         ↓
   [Subject confirms "I feel heard" in Stage 1]
         ↓
   ANALYZING (reconciler comparing guess vs actual)
         ↓
   [Reconciler AI analyzes gaps]
         ↓
    ┌─────────────┴──────────────┐
    ↓                            ↓
 [No/minor gaps]          [Significant gaps]
    ↓                            ↓
 READY                    AWAITING_SHARING
    ↓                            ↓
    |                    [Subject responds]
    |                      ↓           ↓
    |                 [Accept]    [Decline]
    |                      ↓           ↓
    |                 REFINING      READY
    |                      ↓
    |              [Guesser refines & resubmits]
    |                      ↓
    |                  ANALYZING (loop back)
    |                      ↓
    └──────────────────→ READY (eventually)
                           ↓
                [Both directions READY]
                           ↓
                       REVEALED
                           ↓
                [Subject validates]
                           ↓
                       VALIDATED
```

### 2.2 Transition Details

#### HELD → ANALYZING
**Trigger:** `hasPartnerCompletedStage1()` returns true (subject confirmed feelHeard in Stage 1)
**Function:** `runReconcilerForDirection()` called by `consentToShare()` when both users have shared empathy
**Guard:** Both users must have EmpathyAttempt records with sharedAt timestamp
**Side Effects:**
- Sets both EmpathyAttempt.status to ANALYZING
- Calls `analyzeEmpathyGap()` to run AI analysis
- Creates ReconcilerResult record

**Race Condition:** If partner hasn't completed Stage 1, empathy stays HELD indefinitely. No retry mechanism.

---

#### ANALYZING → AWAITING_SHARING
**Trigger:** Reconciler AI returns `recommendedAction: OFFER_SHARING` or `(OFFER_OPTIONAL + suggestedShareFocus exists)`
**Function:** `runReconcilerForDirection()` → `generateShareSuggestion()`
**Guard:** `hasContextAlreadyBeenShared()` must return false (prevents infinite loop)
**Side Effects:**
- Sets EmpathyAttempt.status to AWAITING_SHARING
- Creates ReconcilerShareOffer with status PENDING
- Generates AI-suggested share content
- Publishes `empathy.status_updated` Ably event to guesser (with full empathy status)
- Publishes `empathy.partner_considering_share` event

**Race Condition Workaround:**
Uses 3-attempt retry loop with 100ms delay to find ReconcilerResult after creation:
```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  dbResult = await prisma.reconcilerResult.findUnique(...);
  if (dbResult) break;
  if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 100));
}
```
**Risk:** If record not found after 3 attempts, share suggestion is lost (logged as CRITICAL error).

---

#### ANALYZING → READY
**Trigger:** Reconciler AI returns `recommendedAction: PROCEED` or `(OFFER_OPTIONAL + no suggestedShareFocus)`
**Function:** `runReconcilerForDirection()` → sets status READY
**Guard:** None
**Side Effects:**
- Sets EmpathyAttempt.status to READY
- Creates AI alignment message for guesser (US-6: PROCEED Positive Feedback)
- Publishes alignment message via Ably
- Calls `checkAndRevealBothIfReady()` to check mutual reveal condition

---

#### AWAITING_SHARING → REFINING
**Trigger:** Subject accepts or refines share suggestion
**Function:** `respondToShareSuggestion()` (action: 'accept' | 'refine')
**Guard:** ReconcilerShareOffer must have status OFFERED or PENDING
**Side Effects:**
- Updates ReconcilerShareOffer: status → ACCEPTED, sets sharedContent, sharedAt
- Updates EmpathyAttempt.status to REFINING
- Creates 3 messages in guesser's chat (explicit 100ms timestamps to ensure order):
  1. AI intro: "Partner hasn't seen your empathy yet because the reconciler suggested they share more. This is what they shared:"
  2. SHARED_CONTEXT message with the shared content
  3. AI reflection prompt: "How does this land for you?"
- Creates 2 messages in subject's chat:
  1. SHARED_CONTEXT message (their own shared content)
  2. AI acknowledgment + stage-appropriate continuation
- Deletes any SHARE_SUGGESTION messages (drawer flow)
- Publishes `empathy.refining` event to guesser with full status

**Infinite Loop Bug:**
When guesser resubmits empathy, ReconcilerResult is deleted (cascades to ReconcilerShareOffer). Reconciler runs again, finds same gaps, creates new share offer. The code checks `hasContextAlreadyBeenShared()` which looks for SHARED_CONTEXT messages to prevent re-offering, but this check is fragile because:
- SHARED_CONTEXT messages persist after ReconcilerResult deletion
- The check is only in `triggerReconcilerAndUpdateStatuses()` not in `runReconcilerForDirection()`
- If check fails, loop repeats indefinitely

---

#### AWAITING_SHARING → READY
**Trigger:** Subject declines share suggestion
**Function:** `respondToShareSuggestion()` (action: 'decline')
**Guard:** ReconcilerShareOffer must have status OFFERED or PENDING
**Side Effects:**
- Updates ReconcilerShareOffer: status → DECLINED, sets declinedAt
- Updates EmpathyAttempt.status to READY
- Deletes SHARE_SUGGESTION messages
- Calls `checkAndRevealBothIfReady()`

---

#### REFINING → ANALYZING
**Trigger:** Guesser resubmits revised empathy statement
**Function:** `resubmitEmpathy()`
**Guard:** EmpathyAttempt.status must be REFINING or NEEDS_WORK
**Side Effects:**
- Updates EmpathyAttempt: content, status → ANALYZING, revisionCount++
- Deletes ReconcilerResult (cascades to ReconcilerShareOffer)
- Creates new EMPATHY_STATEMENT message
- Calls `triggerReconcilerForUser()` to re-run reconciler for this direction
- Creates AI acknowledgment message

**Infinite Loop Risk:** If reconciler finds same gaps after resubmit, it will create new share offer. The `hasContextAlreadyBeenShared()` check prevents immediate re-offering, but if that check fails, loop repeats.

---

#### READY → REVEALED (Mutual Reveal)
**Trigger:** Both directions reach READY status simultaneously
**Function:** `checkAndRevealBothIfReady()`
**Guard:** Both EmpathyAttempt records must have status READY
**Side Effects:**
- Updates both EmpathyAttempt.status to REVEALED
- Sets revealedAt, deliveryStatus → DELIVERED, deliveredAt
- Publishes `empathy.revealed` event to both users with full empathy status
- Includes `guesserUserId` in event so mobile can filter (only subject sees validation_needed modal)

**Race Condition Protection:** Atomic query checks both are READY before updating. No retry loop needed.

---

#### REVEALED → VALIDATED
**Trigger:** Subject validates guesser's empathy as accurate
**Function:** `validateEmpathy()` (validated: true)
**Guard:** EmpathyAttempt.status must be REVEALED
**Side Effects:**
- Creates/updates EmpathyValidation record
- Updates EmpathyAttempt: status → VALIDATED, deliveryStatus → SEEN, sets seenAt
- Updates StageProgress.gatesSatisfied: empathyValidated → true
- Publishes `partner.stage_completed` event
- Publishes `empathy.status_updated` event to guesser with full status
- If both users validated, calls `triggerStage3Transition()`

---

### 2.3 Invalid Transitions (Prevented by Guards)

The code prevents these transitions via status checks:

1. **HELD → REFINING**: Cannot refine before reconciler runs
2. **ANALYZING → VALIDATED**: Cannot validate before reveal
3. **AWAITING_SHARING → VALIDATED**: Cannot skip refinement phase
4. **REFINING → REVEALED**: Must resubmit before mutual reveal
5. **VALIDATED → REFINING**: Cannot go backwards after validation

No explicit state machine validation, but HTTP endpoints return 400 errors if guards fail.

---

## 3. Reconciler Entry Points

### 3.1 Primary Entry: `consentToShare()`

**File:** `backend/src/controllers/stage2.ts`
**Route:** `POST /sessions/:id/empathy/consent`
**Trigger:** User consents to share their empathy draft

**Flow:**
1. Creates ConsentRecord
2. Creates EmpathyAttempt with status HELD
3. Creates EMPATHY_STATEMENT message
4. Checks if partner also consented:
   - If yes: Updates both to ANALYZING, calls `triggerReconcilerAndUpdateStatuses()`
   - If no: Stays HELD, waits for partner

**Race Condition:** If both users consent simultaneously, both may call `triggerReconcilerAndUpdateStatuses()`. The function is not idempotent but Prisma transactions prevent duplicate ReconcilerResult creation (unique constraint on sessionId+guesserId+subjectId).

---

### 3.2 Symmetric Reconciler: `runReconciler()`

**File:** `backend/src/services/reconciler.ts`
**Called By:** Legacy code (not used in current flow)
**Behavior:** Runs reconciler for both directions (A→B and B→A) simultaneously

**Issues:**
- Requires both users to have submitted empathy (blocks asymmetric flow)
- Used in old symmetric flow, replaced by `runReconcilerForDirection()`
- Still exists for backward compatibility

---

### 3.3 Asymmetric Reconciler: `runReconcilerForDirection()`

**File:** `backend/src/services/reconciler.ts`
**Called By:** `consentToShare()` → `triggerReconcilerAndUpdateStatuses()`
**Behavior:** Runs reconciler for a SINGLE direction when subject completes Stage 1

**Flow:**
1. Gets guesser's empathy statement
2. Gets subject's Stage 1 witnessing content
3. Calls `analyzeEmpathyGap()` to run AI analysis
4. Creates ReconcilerResult
5. Determines outcome:
   - No gaps → status READY, creates alignment message
   - Significant gaps → status AWAITING_SHARING, generates share suggestion
6. Publishes Ably events
7. Calls `checkAndRevealBothIfReady()` if status → READY

**Race Condition Workaround:** 3-attempt retry loop to find ReconcilerResult after creation (100ms delays).

---

### 3.4 Resubmit Entry: `resubmitEmpathy()`

**File:** `backend/src/controllers/stage2.ts`
**Route:** `POST /sessions/:id/empathy/resubmit`
**Trigger:** Guesser revises empathy after receiving shared context

**Flow:**
1. Validates EmpathyAttempt.status is REFINING or NEEDS_WORK
2. Updates content, status → ANALYZING, revisionCount++
3. Deletes ReconcilerResult (cascades to ReconcilerShareOffer)
4. Creates new EMPATHY_STATEMENT message
5. Calls `triggerReconcilerForUser()` → `runReconcilerForDirection()`

**Infinite Loop Risk:** If reconciler finds same gaps, it creates new share offer. The `hasContextAlreadyBeenShared()` check (in `triggerReconcilerAndUpdateStatuses()`) prevents immediate re-offering by looking for existing SHARED_CONTEXT messages. If this check is bypassed (e.g., messages deleted, wrong query), loop repeats.

---

## 4. Share Suggestion Flow

### 4.1 Generation: `generateShareSuggestion()`

**Trigger:** Reconciler finds significant gaps (recommendedAction: OFFER_SHARING)
**AI Prompt:** Generates a 1-3 sentence suggestion for what subject could share to help guesser understand better

**Outputs:**
- `suggestedContent`: The AI-generated draft text
- `reason`: Why sharing this would help

**Storage:**
- Updates ReconcilerResult: `suggestedShareContent`, `suggestedShareReason`
- Creates ReconcilerShareOffer: status PENDING, stores suggestion

**Race Condition Workaround:** Same 3-attempt retry loop to find ReconcilerResult.

---

### 4.2 Retrieval: `getShareSuggestionForUser()`

**Route:** `GET /sessions/:id/empathy/share-suggestion`
**Trigger:** Mobile UI requests share suggestion (drawer display)

**Flow:**
1. Finds ReconcilerShareOffer with status PENDING for userId
2. Marks as OFFERED (status transition)
3. Returns suggestion + reason + guesserName

**Race Condition:** If user responds before GET endpoint is called, response endpoint handles both PENDING and OFFERED status.

---

### 4.3 Response: `respondToShareSuggestion()`

**Route:** `POST /sessions/:id/empathy/share-suggestion/respond`
**Actions:** accept | decline | refine

**Accept Flow:**
1. Uses suggestedContent as-is
2. Creates SHARED_CONTEXT messages (3 for guesser, 2 for subject)
3. Updates EmpathyAttempt.status to REFINING
4. Publishes `empathy.refining` event

**Refine Flow:**
1. Calls AI to regenerate suggestion based on user's feedback
2. If AI succeeds, uses refined content; else falls back to original
3. Same message creation flow as Accept

**Decline Flow:**
1. Updates ReconcilerShareOffer: status DECLINED
2. Updates EmpathyAttempt.status to READY
3. Calls `checkAndRevealBothIfReady()`

---

## 5. Race Condition Workarounds

### 5.1 ReconcilerResult Creation Visibility (100ms Retry Loop)

**Location:** `generateShareSuggestion()` lines 792-813
**Issue:** ReconcilerResult record may not be immediately visible after creation due to Prisma transaction isolation or replication lag.

**Workaround:**
```typescript
let dbResult = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  dbResult = await prisma.reconcilerResult.findUnique({
    where: { sessionId_guesserId_subjectId: {...} }
  });
  if (dbResult) break;
  if (attempt < 3) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Risk:**
- If record not found after 3 attempts (300ms total), share suggestion is not displayed
- Logged as `CRITICAL` error but no automatic recovery
- User experience: Share suggestion drawer doesn't appear, empathy stays AWAITING_SHARING indefinitely

**Root Cause:** Likely Prisma transaction isolation level or connection pooling issue. Should investigate if `READ COMMITTED` isolation is causing visibility delays.

---

### 5.2 Message Timestamp Ordering (Explicit 100ms Gaps)

**Location:** `respondToShareSuggestion()` lines 1165-1169
**Issue:** Database timestamps may have insufficient precision, causing messages to appear out of order in chat.

**Workaround:**
```typescript
const baseTime = Date.now();
const introTimestamp = new Date(baseTime);
const sharedContextTimestamp = new Date(baseTime + 100);
const reflectionTimestamp = new Date(baseTime + 200);
```

**Risk:**
- If system clock skews or messages created in parallel, order may still break
- 100ms gaps are arbitrary (should be database tick resolution)

**Root Cause:** Prisma `DateTime` fields default to `now()` which uses database server time. If multiple messages created in same transaction, they may get identical timestamps.

---

### 5.3 Infinite Loop Prevention (hasContextAlreadyBeenShared)

**Location:** `controllers/stage2.ts` lines 75-100, usage in `triggerReconcilerAndUpdateStatuses()` lines 155-163
**Issue:** When guesser resubmits empathy, ReconcilerResult is deleted (cascades to ReconcilerShareOffer). Reconciler runs again and may find same gaps, creating new share offer. This creates infinite loop: share → resubmit → share → resubmit.

**Workaround:**
```typescript
async function hasContextAlreadyBeenShared(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<boolean> {
  const existingSharedContext = await prisma.message.findFirst({
    where: {
      sessionId,
      role: 'SHARED_CONTEXT',
      senderId: subjectId,
      forUserId: guesserId,
    },
  });
  return !!existingSharedContext;
}
```

**Usage:**
```typescript
const contextAlreadySharedToA = hasSignificantGapsA
  ? await hasContextAlreadyBeenShared(sessionId, userAId, userBId)
  : false;

if (contextAlreadySharedToA) {
  statusA = EmpathyStatus.READY; // Skip AWAITING_SHARING
}
```

**Risks:**
1. **Check only in symmetric flow:** The check is in `triggerReconcilerAndUpdateStatuses()` (symmetric flow) but NOT in `runReconcilerForDirection()` (asymmetric flow) or `triggerReconcilerForUser()` (resubmit flow). If resubmit calls asymmetric flow, check is bypassed.
2. **Message-based state:** Relies on SHARED_CONTEXT messages persisting. If messages are deleted (cleanup, user action), check fails and loop resumes.
3. **Single direction check:** Doesn't track which specific content was shared. If subject shares different content each time, all shares create messages, but check still passes (prevents re-offering but doesn't detect duplicate shares).

**Root Cause:** ReconcilerShareOffer is cascade-deleted when ReconcilerResult is deleted. The system loses track of "subject already shared context for these gaps." Should use a persistent flag or separate table to track sharing history independent of reconciler re-runs.

---

### 5.4 Response Status Flexibility (PENDING | OFFERED)

**Location:** `respondToShareSuggestion()` lines 1002-1027
**Issue:** User may respond to share suggestion before GET endpoint marks it as OFFERED, causing status mismatch.

**Workaround:**
```typescript
const shareOffer = await prisma.reconcilerShareOffer.findFirst({
  where: {
    userId,
    status: { in: ['OFFERED', 'PENDING'] }, // Accept both
    result: { sessionId },
  },
});

if (shareOffer.status === 'PENDING') {
  // Mark as OFFERED first for proper tracking
  await prisma.reconcilerShareOffer.update({
    where: { id: shareOffer.id },
    data: { status: 'OFFERED' },
  });
}
```

**Risk:** None. This is defensive programming to handle race condition gracefully.

---

## 6. Issues Found

### 6.1 CRITICAL: Infinite Share Loop

**Severity:** Critical (blocks user flow)
**Component:** Resubmit flow + Reconciler re-analysis
**Symptoms:**
- Guesser refines empathy after receiving shared context
- Resubmits → reconciler runs again
- Finds same gaps → creates new share suggestion
- Subject shares again → guesser refines again
- Loop repeats indefinitely

**Root Cause:**
1. `resubmitEmpathy()` deletes ReconcilerResult (cascade deletes ReconcilerShareOffer)
2. Calls `triggerReconcilerForUser()` → `runReconcilerForDirection()`
3. Reconciler re-analyzes with revised empathy
4. If gaps still exist (plausible if refinement was insufficient), it sets status AWAITING_SHARING
5. `runReconcilerForDirection()` does NOT check `hasContextAlreadyBeenShared()`
6. New ReconcilerShareOffer created
7. Subject sees new share suggestion (even though they already shared)

**Mitigation (current):**
- `hasContextAlreadyBeenShared()` check in `triggerReconcilerAndUpdateStatuses()` (symmetric flow)
- NOT present in `runReconcilerForDirection()` (asymmetric flow) or `triggerReconcilerForUser()` (resubmit flow)

**Fix Required:**
1. **Option A:** Add `hasContextAlreadyBeenShared()` check to `runReconcilerForDirection()` before setting AWAITING_SHARING
2. **Option B:** Don't delete ReconcilerShareOffer on resubmit; instead mark as superseded and create new version
3. **Option C:** Track sharing history in separate table independent of ReconcilerResult lifecycle

---

### 6.2 CRITICAL: ReconcilerResult Not Found After Creation

**Severity:** Critical (share suggestion lost)
**Component:** `generateShareSuggestion()` retry loop
**Symptoms:**
- Reconciler finds significant gaps
- Attempts to create ReconcilerShareOffer
- ReconcilerResult not found after 3 attempts (300ms)
- Share suggestion not displayed to subject
- EmpathyAttempt stuck in AWAITING_SHARING

**Root Cause:**
- Prisma transaction isolation level may delay visibility of newly created ReconcilerResult
- 3 attempts × 100ms = 300ms may be insufficient for slow database

**Mitigation (current):**
- 3-attempt retry loop with 100ms delays
- Logs `CRITICAL` error if not found

**Fix Required:**
1. Investigate Prisma transaction isolation level (switch to READ COMMITTED?)
2. Increase retry count or delay
3. Add fallback: If ReconcilerResult not found, mark EmpathyAttempt as READY (skip sharing)
4. Add monitoring/alerting for this error

---

### 6.3 MEDIUM: Message Timestamp Precision

**Severity:** Medium (degraded experience)
**Component:** `respondToShareSuggestion()` message creation
**Symptoms:**
- SHARED_CONTEXT messages may appear out of order in chat
- Intro AI → shared context → reflection AI order not guaranteed

**Root Cause:**
- Prisma `DateTime` defaults to database server time
- Multiple messages created in quick succession may get identical timestamps
- Chat UI sorts by timestamp

**Mitigation (current):**
- Explicit 100ms gaps between message timestamps

**Fix Required:**
1. Use monotonic sequence number instead of timestamp for ordering
2. Add explicit `order` field to Message model
3. Update chat UI to sort by `order` first, then `timestamp`

---

### 6.4 MEDIUM: No Retry for Partner Stage 1 Completion

**Severity:** Medium (blocks progress until manual retry)
**Component:** HELD → ANALYZING transition
**Symptoms:**
- Guesser consents to share empathy
- EmpathyAttempt.status set to HELD
- Partner completes Stage 1 later
- No automatic trigger to advance HELD → ANALYZING

**Root Cause:**
- `consentToShare()` only checks `hasPartnerCompletedStage1()` at consent time
- No listener for partner's Stage 1 completion

**Mitigation (current):**
- None. User must refresh/reopen session to trigger check.

**Fix Required:**
1. Add Ably event listener for partner Stage 1 completion
2. Trigger reconciler when partner confirms feelHeard
3. OR: Add periodic polling to check partner status

---

### 6.5 LOW: ReconcilerShareOffer Cascade Delete on Resubmit

**Severity:** Low (design decision, not bug)
**Component:** ReconcilerResult deletion cascade
**Symptoms:**
- When guesser resubmits empathy, ReconcilerShareOffer is deleted
- Sharing history lost

**Root Cause:**
- Cascade delete is intentional (foreign key constraint)
- Forces clean slate for re-analysis

**Mitigation (current):**
- `hasContextAlreadyBeenShared()` checks SHARED_CONTEXT messages instead

**Fix Required:**
- None. This is working as designed, but fragile. Consider soft-delete or versioning instead.

---

### 6.6 LOW: Abstract Guidance Fields Unused

**Severity:** Low (incomplete feature)
**Component:** ReconcilerResult.areaHint, guidanceType, promptSeed
**Symptoms:**
- Fields populated during reconciler analysis
- Intended for refinement AI hints
- Not used in current refinement flow (`refineEmpathy()` uses full context retrieval)

**Root Cause:**
- Feature designed but not fully implemented
- Refinement flow uses shared context directly instead of abstract hints

**Fix Required:**
- None. Either remove fields or implement hint-based refinement.

---

### 6.7 LOW: NEEDS_WORK Status Deprecated

**Severity:** Low (legacy code)
**Component:** EmpathyStatus enum
**Symptoms:**
- NEEDS_WORK status exists but is legacy (replaced by AWAITING_SHARING)
- Code still checks for it in guards

**Fix Required:**
- Remove NEEDS_WORK from enum after migration
- Update guards to only check REFINING

---

## Summary

The reconciler state machine is a complex asymmetric flow with multiple race condition workarounds and a critical infinite loop vulnerability. The system relies on eventual consistency and retry logic to handle Prisma transaction visibility issues. Key fragile areas:

1. **Infinite loop risk:** Resubmit flow can create infinite share suggestion loop if `hasContextAlreadyBeenShared()` check is bypassed
2. **ReconcilerResult visibility:** 100ms retry loop may fail on slow databases
3. **Message ordering:** Explicit timestamp gaps are fragile workaround for ordering issues
4. **No automatic retry:** HELD status doesn't advance automatically when partner completes Stage 1

**Next Steps:** Fix infinite loop by adding shared context check to all reconciler entry points, investigate Prisma isolation level, and add retry mechanism for HELD → ANALYZING transition.

---

## 7. User Perspectives: Reconciler Flow

This section documents what each user experiences during the reconciler flow, from both the guesser's perspective (person whose empathy is being analyzed) and the subject's perspective (person whose feelings are being guessed about).

### 7.1 User A (Guesser) Flow

**User A** has written an empathy statement trying to guess what **User B** is feeling.

#### 7.1.1 Initial Share (HELD Status)

**What User A sees:**
1. Clicks "Share" on empathy statement panel in AI chat
2. Sees confirmation: "That took courage - trying to imagine [User B]'s perspective"
3. AI message suggests using Inner Thoughts while waiting
4. Empathy statement appears in chat with label "What you shared"

**UI State:**
- Empathy panel disappears from AI chat
- Input remains enabled (can continue AI conversation)
- Share tab shows "Empathy Pending" state
- Invitation indicator shows "Empathy Sent" timeline marker (derived from `invitation.messageConfirmedAt` cache timestamp)

**What User A does NOT see:**
- User B's empathy statement (still held by reconciler)
- Any indication of reconciler status
- Whether User B has shared empathy yet

**Waiting for:** User B to complete Stage 1 (confirm "I feel heard")

---

#### 7.1.2 Reconciler Analysis (ANALYZING Status)

**Trigger:** User B confirms feelHeard in Stage 1

**What User A sees:**
- No immediate UI change (analysis happens in background)
- Continues AI conversation normally
- Waiting banner does NOT appear (status is transparent)

**What User A does NOT see:**
- That reconciler is running
- Gap analysis results
- Whether User B is being asked to share more context

**Duration:** Typically 5-10 seconds for AI analysis

---

#### 7.1.3a Path 1: No Gaps (READY Status)

**Trigger:** Reconciler finds no significant gaps

**What User A sees:**
1. AI message appears: "[User B] has felt heard. The reconciler reports your attempt to imagine what they're feeling was quite accurate. [User B] is now considering your perspective, and once they do, you'll both see what each other shared."
2. Share tab updates to "Empathy Ready" state

**UI State:**
- Waiting banner: "Waiting for [User B] to validate your empathy"
- Input enabled (can continue AI conversation)
- Share tab: Empathy card shows "Pending validation"

**What User A does NOT see:**
- User B's empathy statement (still waiting for both to be READY)
- Specific alignment score
- What they got right/wrong

**Waiting for:** User B's empathy to also reach READY status (mutual reveal)

---

#### 7.1.3b Path 2: Gaps Found (AWAITING_SHARING Status)

**Trigger:** Reconciler finds significant gaps, subject (User B) is asked to share more context

**What User A sees:**
1. Ably event `empathy.partner_considering_share` updates cache
2. Waiting banner appears: "Waiting for [User B] to respond to share suggestion"
3. Share tab updates to "Awaiting Context" state

**UI State:**
- Waiting banner shows partner is considering whether to share
- Input enabled (can continue AI conversation)
- Share tab: Empathy card shows "Partner considering sharing more context"

**What User A does NOT see:**
- What gaps were found
- What User B is being asked to share about
- The share suggestion text

**Ably Events Received:**
- `empathy.status_updated` (status: AWAITING_SHARING, includes full empathy status)
- `empathy.partner_considering_share`

**Cache Updates:**
- `stageKeys.empathyStatus` updated with `myAttempt.status: AWAITING_SHARING`
- Waiting banner derived from empathy status

**Waiting for:** User B to respond to share suggestion (accept, refine, or decline)

---

#### 7.1.4 Path 2a: Subject Shares Context (REFINING Status)

**Trigger:** User B accepts or refines share suggestion

**What User A sees:**
1. Ably event `empathy.refining` triggers cache update
2. Three messages appear in AI chat (with explicit 100ms timestamp gaps for ordering):
   - AI intro: "[User B] hasn't seen your empathy statement yet because the reconciler suggested they share more. This is what they shared:"
   - SHARED_CONTEXT message: "[User B's shared content]"
   - AI reflection: "How does this land for you? Take a moment to reflect on what [User B] shared. Does this give you any new insight into what they might be experiencing?"
3. Waiting banner updates: "Refine your empathy based on new context"
4. Share tab shows "Refining" state with "Refine" button

**UI State:**
- Input enabled (can continue AI conversation about shared context)
- Waiting banner: "You can refine your empathy or keep your original statement"
- Share tab: Empathy card shows SHARED_CONTEXT content with "Refine" button
- "Refine" button navigates to Share tab → Refine flow

**Ably Events Received:**
- `empathy.refining` (includes full empathy status with `hasNewSharedContext: true`)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `myAttempt.status: REFINING`
  - `sharedContext: { content, sharedAt }`
  - `hasNewSharedContext: true`
  - `messageCountSinceSharedContext: 0`
- `messageKeys.infinite` updated with 3 new messages

**What User A can do:**
1. Continue AI conversation normally (input not blocked)
2. Click "Refine" button on Share tab to enter refinement mode:
   - Opens Share tab with SHARED_CONTEXT content displayed
   - Shows AI chat below with refinement conversation
   - Can ask AI questions about the shared context
   - AI uses abstract guidance hints (areaHint, guidanceType, promptSeed) to ask probing questions
   - When ready, AI proposes revised empathy statement
3. Resubmit revised empathy via Share tab
   - Calls `resubmitEmpathy()`
   - Status → ANALYZING (loops back to reconciler)

**Waiting for:** User A to decide whether to refine or keep original empathy

---

#### 7.1.5 Path 2a→ Resubmit Refined Empathy (ANALYZING Again)

**Trigger:** User A clicks "Resubmit" on Share tab after refining

**What User A sees:**
1. New EMPATHY_STATEMENT message in AI chat: "[Revised empathy content]"
2. AI acknowledgment: "You're showing real understanding here. The reconciler will review your updated perspective shortly."
3. Waiting banner: "Reconciler analyzing your refined empathy"
4. Share tab updates to "Analyzing" state

**UI State:**
- Input enabled (can continue AI conversation)
- Waiting banner: "Reconciler analyzing..."
- Share tab: Empathy card shows "Analyzing" spinner

**What User A does NOT see:**
- That ReconcilerResult was deleted and recreated
- Whether the same gaps will be found again

**Ably Events:** None (reconciler runs in background)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `myAttempt.status: ANALYZING`
  - `myAttempt.revisionCount` incremented
  - `myAttempt.content` updated
- `messageKeys.infinite` updated with new EMPATHY_STATEMENT and AI acknowledgment messages

**Waiting for:** Reconciler to re-analyze revised empathy

**Infinite Loop Risk:** If reconciler finds same gaps after resubmit, User A will loop back to AWAITING_SHARING status. The `hasContextAlreadyBeenShared()` check prevents immediate re-offering, but if that check fails, User B will see new share suggestion and cycle repeats.

---

#### 7.1.6 Path 2b: Subject Declines to Share (READY Status)

**Trigger:** User B declines share suggestion

**What User A sees:**
1. Waiting banner disappears (status changes to READY)
2. Share tab updates to "Empathy Ready" state
3. No message in AI chat about the decline

**UI State:**
- Waiting banner: "Waiting for [User B] to validate your empathy"
- Input enabled
- Share tab: Empathy card shows "Pending validation"

**Ably Events:** None (decline is silent to guesser)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `myAttempt.status: READY`

**What User A does NOT see:**
- That User B declined to share
- Why they declined

**Waiting for:** User B's empathy to also reach READY status (mutual reveal)

---

#### 7.1.7 Mutual Reveal (REVEALED Status)

**Trigger:** Both User A's and User B's empathy attempts reach READY status

**What User A sees:**
1. Ably event `empathy.revealed` triggers cache update
2. Share tab updates to show User B's empathy statement
3. Modal prompt appears (only for User B, the subject): "Validate whether User A's empathy feels accurate"

**UI State (User A - Guesser):**
- Share tab: Both empathy statements now visible
- User B's empathy shown with "Waiting for validation" label
- Input enabled (can continue AI conversation)
- Waiting banner: "Waiting for [User B] to validate your empathy"

**UI State (User B - Subject):**
- Share tab: Both empathy statements visible
- User A's empathy shown with "Validate accuracy" button
- Modal appears: "Does [User A]'s empathy feel accurate?"
- Options: "Accurate" / "Not quite"

**Ably Events Received:**
- `empathy.revealed` (includes `guesserUserId` for filtering)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `myAttempt.status: REVEALED`
  - `myAttempt.revealedAt` set
  - `partnerAttempt: { ...empathy data... }`

**Waiting for:** User B to validate User A's empathy

---

#### 7.1.8 Validation (VALIDATED Status)

**Trigger:** User B validates User A's empathy as accurate

**What User A sees:**
1. Ably event `empathy.status_updated` with validation info
2. Share tab updates: User A's empathy card shows "Validated" badge
3. If both users have validated, Stage 3 transition begins

**UI State:**
- Share tab: Empathy card shows green checkmark "Validated"
- If both validated: Stage 2 completion banner appears
- Input enabled

**Ably Events Received:**
- `empathy.status_updated` (validatedBy: User B's ID)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `myAttempt.status: VALIDATED`
  - `myAttempt.deliveryStatus: SEEN`
  - `myAttempt.seenAt` set

**Stage Transition:** If both users validated, `triggerStage3Transition()` runs:
1. Marks Stage 2 as COMPLETED
2. Creates Stage 3 IN_PROGRESS records
3. Creates AI transition message
4. Publishes `partner.stage_completed` event

---

### 7.2 User B (Subject) Flow

**User B** is the subject of User A's empathy guess. User A is trying to imagine what User B is feeling.

#### 7.2.1 Initial Share (HELD Status)

**What User B sees:**
1. Clicks "Share" on empathy statement panel in AI chat
2. Sees confirmation: "That took courage - trying to imagine [User A]'s perspective"
3. AI message suggests using Inner Thoughts while waiting
4. Empathy statement appears in chat with label "What you shared"

**UI State:**
- Same as User A's experience (symmetric at this stage)
- Share tab shows "Empathy Pending" state

**What User B does NOT see:**
- User A's empathy statement (still held by reconciler)
- Whether User A has shared empathy yet
- Any indication that User A's empathy is being analyzed against User B's Stage 1 content

**Difference from User A:**
- User B may NOT have completed Stage 1 yet (feelHeard confirmation)
- If User B completes Stage 1 after sharing empathy, it triggers reconciler for User A's direction
- Reconciler runs asymmetrically: User A's empathy is analyzed against User B's Stage 1 content immediately, even if User B hasn't shared empathy yet

---

#### 7.2.2 Reconciler Finds Gaps in User A's Empathy (Subject Receives Share Suggestion)

**Trigger:** User A shared empathy → User B completed Stage 1 → reconciler analyzed gaps → found significant gaps

**What User B sees:**
1. Ably event `empathy.status_updated` updates cache (User A's empathy status → AWAITING_SHARING)
2. Share tab shows "Share Suggestion" drawer
3. Drawer contents:
   - "Help [User A] understand you better"
   - AI-suggested content (1-3 sentences)
   - Reason: "This would help them understand [specific gap]"
   - Actions: "Share" / "Edit" / "Decline"

**UI State:**
- Share tab: Drawer overlays the screen
- AI chat input enabled (can continue conversation)
- Drawer shows suggestedContent from ReconcilerShareOffer

**What User B can do:**
1. **Accept:** Shares the AI-suggested content as-is
   - Calls `respondToShareSuggestion({ action: 'accept' })`
   - Creates SHARED_CONTEXT messages in both chats
   - User A's status → REFINING
2. **Refine:** Edits the suggestion before sharing
   - Opens refinement UI (text input)
   - Calls AI to regenerate based on User B's feedback
   - Shares refined version
3. **Decline:** Chooses not to share
   - Calls `respondToShareSuggestion({ action: 'decline' })`
   - User A's status → READY
   - No message sent to User A

**Ably Events:** None (drawer triggered by cache update from reconciler)

**Cache Data:**
- `stageKeys.shareOffer` contains:
  - `hasSuggestion: true`
  - `suggestion: { guesserName, suggestedContent, reason }`

**What User B does NOT see:**
- User A's empathy statement (still held by reconciler)
- Specific gap analysis results
- Alignment score

---

#### 7.2.3a Subject Accepts/Refines Share Suggestion

**Trigger:** User B clicks "Share" or "Share Refined" in drawer

**What User B sees:**
1. Optimistic update: Drawer closes immediately
2. Two messages appear in User B's AI chat:
   - SHARED_CONTEXT message: "[What User B shared]"
   - AI acknowledgment: "Thank you for sharing that with [User A]. They'll have the chance to refine their understanding of what you're going through. [Stage-appropriate continuation]"
3. Share tab updates to show "Context Shared" state
4. Delivery status shows "Pending" → "Delivered" → "Seen"

**UI State:**
- Drawer closed (local latch prevents re-showing)
- Share tab: Shared context card appears
- Card shows delivery status:
  - "Pending" (content saved, not yet delivered to User A)
  - "Delivered" (User A can see it in Share tab)
  - "Seen" (User A has viewed Share tab after delivery)
- Input enabled (can continue AI conversation)

**Ably Events Received:**
- `empathy.refining` (sent to User A, not User B)

**Cache Updates:**
- `stageKeys.empathyStatus` updated:
  - `sharedContentDeliveryStatus: DELIVERED` (when User A's empathy revealed)
  - `mySharedContext: { content, sharedAt, deliveryStatus }`
- `messageKeys.infinite` updated with SHARED_CONTEXT and AI acknowledgment messages

**Delivery Status Tracking:**
- **PENDING:** Content saved in ReconcilerShareOffer but not yet in User A's chat
- **DELIVERED:** SHARED_CONTEXT message created in User A's chat (when User A's empathy revealed)
- **SEEN:** User A viewed Share tab after sharedAt timestamp (tracked via UserVessel.lastViewedShareTabAt)

**What User B does NOT see:**
- User A's empathy statement (still held by reconciler)
- Whether User A is refining their empathy

---

#### 7.2.4a Subject Declines Share Suggestion

**Trigger:** User B clicks "Decline" in drawer

**What User B sees:**
1. Drawer closes immediately
2. No message in AI chat about decline
3. Share tab updates to "Empathy Ready" state

**UI State:**
- Drawer closed (local latch prevents re-showing)
- Share tab: No shared context card (nothing was shared)
- Waiting banner: "Waiting for [User A] to validate your empathy"
- Input enabled

**Ably Events:** None (decline is silent to both users)

**Cache Updates:**
- `stageKeys.shareOffer` updated:
  - `hasSuggestion: false`
- `stageKeys.empathyStatus` NOT updated (User A's status changes to READY on backend)

**What User B does NOT see:**
- That User A's empathy status changed to READY
- User A's empathy statement (still waiting for mutual reveal)

---

#### 7.2.5 Subject Flow After Sharing (Same as Guesser)

After User B shares context (or declines), the flow merges with User A's experience:
1. Wait for both empathy attempts to reach READY status
2. Mutual reveal (REVEALED status)
3. Validation (VALIDATED status)
4. Stage 3 transition (if both validated)

**Difference from Guesser:**
- User B (subject) sees validation modal when empathy is revealed
- User B validates whether User A's empathy feels accurate
- User B can see their own shared context in Share tab with delivery status

---

## 8. Ably Events in Reconciler Flow

This section lists every Ably event published during the reconciler flow, when it's fired, who receives it, what mobile handler processes it, and what cache updates happen.

### 8.1 Event: `empathy.status_updated`

**When Fired:**
1. After reconciler completes analysis (both directions analyzed)
2. After subject validates guesser's empathy

**Who Receives:** All session members

**Payload:**
```typescript
{
  stage: 2,
  statuses: {
    [userAId]: EmpathyStatus, // e.g., AWAITING_SHARING, READY
    [userBId]: EmpathyStatus
  },
  empathyStatuses: {
    [userAId]: EmpathyExchangeStatusResponse,
    [userBId]: EmpathyExchangeStatusResponse
  },
  // Validation-specific (if fired after validation)
  status?: 'VALIDATED',
  forUserId?: string, // Guesser whose empathy was validated
  validatedBy?: string,
  triggeredByUserId?: string // Excludes this user from receiving event
}
```

**Mobile Handler:** `useUnifiedSession.ts` → `handleAblyEvent()`

**Cache Updates:**
1. Invalidates `stageKeys.empathyStatus(sessionId)` query
2. Updates `sessionKeys.state(sessionId)` with new empathy statuses
3. Triggers re-render of Share tab and waiting banners

**UI Impact:**
- Waiting banner text changes based on new status
- Share tab drawer appears if `hasSuggestion: true`
- Validation modal appears if `forUserId` matches current user

**Filtering:** Event includes `forUserId` and `triggeredByUserId` so mobile can:
- Show validation modal only to guesser whose empathy was validated
- Exclude events triggered by current user (prevents race conditions)

---

### 8.2 Event: `empathy.partner_considering_share`

**When Fired:** After reconciler sets guesser's status to AWAITING_SHARING

**Who Receives:** Guesser only (User A)

**Payload:**
```typescript
{
  forUserId: string, // Guesser's ID
  timestamp: number
}
```

**Mobile Handler:** `useUnifiedSession.ts` → `handleAblyEvent()`

**Cache Updates:**
1. Updates `stageKeys.empathyStatus(sessionId)` if stale
2. No direct cache write (relies on `empathy.status_updated` for full status)

**UI Impact:**
- Waiting banner shows "Waiting for [Subject] to respond to share suggestion"
- Share tab updates to "Awaiting Context" state

**Purpose:** Provides immediate feedback to guesser that subject is considering sharing, without waiting for full status refetch.

---

### 8.3 Event: `empathy.revealed`

**When Fired:** After `checkAndRevealBothIfReady()` sets both empathy attempts to REVEALED

**Who Receives:** Both users (guesser and subject in each direction)

**Payload:**
```typescript
{
  direction: 'outgoing', // Which direction was revealed (not used in current code)
  guesserUserId: string, // The guesser in this direction
  forUserId: string, // The user receiving this event
  empathyStatus: EmpathyExchangeStatusResponse
}
```

**Mobile Handler:** `useUnifiedSession.ts` → `handleAblyEvent()`

**Cache Updates:**
1. Updates `stageKeys.empathyStatus(sessionId)` with full status
2. Updates `sessionKeys.state(sessionId)` with revealed empathy data

**UI Impact:**
- Share tab shows both empathy statements
- Validation modal appears (only for subject, filtered by `guesserUserId`)
- Timeline indicator "Empathy Revealed" appears

**Filtering:** Event includes `guesserUserId` so mobile can:
- Show validation modal only to subject (NOT to guesser)
- Subject validates whether guesser's empathy feels accurate

---

### 8.4 Event: `empathy.refining`

**When Fired:** After subject accepts/refines share suggestion

**Who Receives:** Guesser only (User A)

**Payload:**
```typescript
{
  guesserId: string,
  forUserId: string,
  empathyStatus: EmpathyExchangeStatusResponse,
  hasNewContext: true
}
```

**Mobile Handler:** `useUnifiedSession.ts` → `handleAblyEvent()`

**Cache Updates:**
1. Updates `stageKeys.empathyStatus(sessionId)` with:
   - `myAttempt.status: REFINING`
   - `sharedContext: { content, sharedAt }`
   - `hasNewSharedContext: true`
2. Updates `messageKeys.infinite(sessionId)` to include 3 new messages (intro AI, SHARED_CONTEXT, reflection AI)

**UI Impact:**
- Messages appear in AI chat (intro → shared context → reflection)
- Waiting banner updates to "You can refine your empathy or keep your original statement"
- Share tab shows "Refine" button
- Timeline indicator "Context Shared" appears

**Purpose:** Notifies guesser that subject shared context and empathy can now be refined.

---

### 8.5 Event: `partner.stage_completed`

**When Fired:** After user validates partner's empathy

**Who Receives:** Partner only (excludes user who triggered validation)

**Payload:**
```typescript
{
  stage: 2,
  validated: boolean,
  completedBy: string,
  empathyStatus: EmpathyExchangeStatusResponse,
  triggeredByUserId: string // Excludes this user from receiving event
}
```

**Mobile Handler:** `useUnifiedSession.ts` → `handleAblyEvent()`

**Cache Updates:**
1. Updates `stageKeys.empathyStatus(sessionId)` with full status
2. Updates `sessionKeys.state(sessionId)` with stage completion info

**UI Impact:**
- Share tab updates to show "Validated" badge on empathy card
- If both validated: Stage 3 transition message appears
- Timeline indicator "Empathy Validated" appears

**Filtering:** Event includes `triggeredByUserId` to exclude the user who validated (prevents race conditions with local cache update).

---

### 8.6 Event: `empathy.context_shared` (LEGACY - Not Used)

**Status:** Defined in types but not published by current code

**Original Purpose:** Notify guesser that subject shared context

**Current Replacement:** `empathy.refining` event is used instead

---

### 8.7 Event: `empathy.share_suggestion` (LEGACY - Not Used)

**Status:** Defined in types but not published by current code

**Original Purpose:** Notify subject that they have a share suggestion

**Current Replacement:** Share suggestion is fetched via HTTP GET endpoint, cache update triggers drawer

---

## 9. Post-Reconciliation: Transition to Stage 3

### 9.1 Trigger Condition

**Automatic Transition:** When both users have validated their partner's empathy as accurate.

**Validation Check in `validateEmpathy()`:**
```typescript
// After user validates
if (validated && partnerValidation?.validated) {
  triggerStage3Transition(sessionId, user.id, partnerId).catch(err =>
    console.warn('[validateEmpathy] Failed to trigger transition:', err)
  );
}
```

**Function:** `triggerStage3Transition()` in `controllers/stage2.ts` lines 1459-1598

---

### 9.2 Transition Steps

1. **Generate AI Transition Message:**
   - Fetches user names for personalization
   - Calls Sonnet AI to generate celebration message:
     - Celebrates their success in hearing each other
     - Pivots to future: "Now that we understand each other, let's find a way forward together"
     - Introduces Stage 3: Strategy & Solutions
   - Saves message to database (role: AI, stage: 2)

2. **Update Stage Progress for Both Users:**
   - Marks Stage 2 as COMPLETED (status, completedAt)
   - Creates Stage 3 records with status IN_PROGRESS (via upsert)

3. **Publish Realtime Event:**
   - Event: `partner.stage_completed`
   - Payload:
     ```typescript
     {
       previousStage: 2,
       currentStage: 3,
       userId: string,
       message: {
         id: string,
         content: string,
         timestamp: string
       }
     }
     ```
   - Sent to all session members

4. **Embed Session Content (Non-Blocking):**
   - Calls `embedSessionContent()` to update session-level embedding for fact-ledger architecture

---

### 9.3 What Users See

**Both Users:**
1. AI transition message appears in chat: "Congratulations [User A] and [User B]! You've successfully built a foundation of understanding. Now it's time to move to Stage 3, where you'll co-create solutions that work for everyone."
2. Stage indicator in UI updates: Stage 2 → Stage 3
3. Share tab shows "Stage 2 Complete" badge on empathy cards
4. New Stage 3 UI appears (Need Mapping conversation begins)

**Cache Updates:**
- `sessionKeys.state(sessionId)` updated:
  - `progress.myProgress.stage: 3`
  - `progress.partnerProgress.stage: 3`
- `messageKeys.infinite(sessionId)` includes transition message
- `stageKeys.progress(sessionId)` invalidated and refetched

**UI Impact:**
- Stage banner changes to "Stage 3: Need Mapping"
- AI conversation context shifts to need identification
- Share tab updates to show Stage 3 content

---

### 9.4 Edge Cases

**What if only one user validates?**
- Transition does NOT trigger
- Non-validating user sees "Waiting for [Partner] to validate your empathy" banner
- Validating user sees "Waiting for [Partner] to complete validation" banner

**What if user validates as "not accurate"?**
- `validated: false` in EmpathyValidation record
- Feedback coach flow begins (if implemented)
- Transition does NOT trigger
- Current implementation: User can provide feedback, but no automated retry flow

**What if validation is skipped?**
- `skipRefinement()` endpoint allows marking as accepted without formal validation
- Sets `gatesSatisfied.empathyValidated: true` via skip
- Transition triggers if both users skip or validate

---

## 10. Consolidated Issues Summary

### 10.1 Critical Issues

1. **Infinite Share Loop (6.1)**
   - **Impact:** Blocks user flow indefinitely
   - **Root Cause:** ReconcilerShareOffer cascade-deleted on resubmit, reconciler re-analyzes and finds same gaps, creates new share suggestion
   - **Mitigation:** `hasContextAlreadyBeenShared()` check (fragile, not in all code paths)
   - **Fix Required:** Add check to all reconciler entry points OR track sharing history in separate table

2. **ReconcilerResult Not Found After Creation (6.2)**
   - **Impact:** Share suggestion lost, empathy stuck in AWAITING_SHARING
   - **Root Cause:** Prisma transaction isolation delays visibility of newly created ReconcilerResult
   - **Mitigation:** 3-attempt retry loop with 100ms delays
   - **Fix Required:** Investigate Prisma isolation level, increase retry count, add fallback to mark as READY

---

### 10.2 Medium Issues

3. **Message Timestamp Precision (6.3)**
   - **Impact:** Messages may appear out of order in chat
   - **Root Cause:** Database timestamps may have insufficient precision
   - **Mitigation:** Explicit 100ms gaps between message timestamps
   - **Fix Required:** Use monotonic sequence number for ordering

4. **No Retry for Partner Stage 1 Completion (6.4)**
   - **Impact:** Empathy stuck in HELD until manual retry
   - **Root Cause:** No listener for partner's Stage 1 completion
   - **Mitigation:** None (user must refresh)
   - **Fix Required:** Add Ably event listener for partner feelHeard confirmation

---

### 10.3 Low Issues

5. **ReconcilerShareOffer Cascade Delete (6.5)**
   - **Impact:** Sharing history lost on resubmit
   - **Root Cause:** Intentional cascade delete
   - **Mitigation:** `hasContextAlreadyBeenShared()` checks messages instead
   - **Fix Required:** None (working as designed, but fragile)

6. **Abstract Guidance Fields Unused (6.6)**
   - **Impact:** Incomplete feature
   - **Root Cause:** Refinement flow uses shared context directly
   - **Fix Required:** Remove fields OR implement hint-based refinement

7. **NEEDS_WORK Status Deprecated (6.7)**
   - **Impact:** Legacy code clutter
   - **Root Cause:** Replaced by AWAITING_SHARING/REFINING
   - **Fix Required:** Remove after migration

---

## 11. Complete Reconciler State Machine Summary

### Flow Overview

1. **User consents to share empathy** → EmpathyAttempt.status = HELD
2. **Partner completes Stage 1** → Triggers reconciler
3. **Reconciler analyzes gaps** → EmpathyAttempt.status = ANALYZING
4. **Gap decision:**
   - **No gaps:** Status = READY → Wait for mutual reveal
   - **Gaps found:** Status = AWAITING_SHARING → Subject receives share suggestion
5. **Subject responds:**
   - **Accept/Refine:** Status = REFINING → Guesser receives shared context
   - **Decline:** Status = READY → Wait for mutual reveal
6. **Guesser refines (if status=REFINING):**
   - Resubmits empathy → Status = ANALYZING (loop to step 3)
7. **Both directions READY:**
   - Mutual reveal → Status = REVEALED
8. **Subject validates:**
   - Status = VALIDATED
9. **Both validated:**
   - Transition to Stage 3

### Key Invariants

- **Asymmetric execution:** Each direction (A→B, B→A) runs independently
- **Held-until-ready:** Empathy statements hidden until both directions READY
- **Mutual reveal:** Neither sees partner's empathy until both pass reconciliation
- **Single share per direction:** Subject shares context once; guesser can refine multiple times
- **Cascade delete:** ReconcilerResult deletion cascades to ReconcilerShareOffer (creates infinite loop risk)

### Fragile Areas

1. **Infinite loop vulnerability:** Resubmit → same gaps → new share suggestion
2. **Retry logic dependency:** 100ms delays to work around transaction visibility
3. **Message-based state tracking:** `hasContextAlreadyBeenShared()` relies on SHARED_CONTEXT messages persisting
4. **No automatic HELD→ANALYZING trigger:** Requires manual retry if partner completes Stage 1 later

---

**End of Audit**
