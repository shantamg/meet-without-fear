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
