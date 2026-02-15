# Phase 6: Reconciler Fixes - Research

**Researched:** 2026-02-14
**Domain:** Reconciler state machine reliability and race condition mitigation
**Confidence:** HIGH

## Summary

The Empathy Reconciler is a complex asymmetric state machine that runs independently for each direction (A→B, B→A) when analyzing gaps between guessed empathy and actual feelings. Three critical issues block reliable operation:

1. **Infinite share loop**: `hasContextAlreadyBeenShared()` check only in symmetric flow, bypassed by asymmetric resubmit path
2. **ReconcilerResult visibility race**: 3-attempt 100ms retry loop may fail on slow database due to Prisma transaction isolation
3. **No automatic HELD→ANALYZING trigger**: Empathy stuck HELD if partner completes Stage 1 after consent

These issues are well-documented in audit `.planning/phases/01-audit/01-02-AUDIT-RECONCILER.md` with detailed reproduction steps, root causes, and impact analysis.

**Primary recommendation:** Add `hasContextAlreadyBeenShared()` guard to `runReconcilerForDirection()`, investigate Prisma isolation level configuration, and add Ably listener for partner Stage 1 completion.

## Standard Stack

### Core Dependencies

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma Client | 6.x | Database ORM | Standard for Node.js ORMs; handles transactions, migrations, type-safety |
| Ably SDK | Latest | Real-time messaging | Already integrated; proven for session-level and user-level events |
| AWS Bedrock SDK | Latest | AI analysis | Already integrated; Sonnet used for reconciler gap analysis |

**No new dependencies required.** Phase 6 fixes work within existing reconciler architecture.

### Current Reconciler Stack

```
Backend (Node.js/Express):
- Prisma ORM → PostgreSQL (transaction isolation: READ COMMITTED default)
- Ably Realtime → Session/user event broadcasting
- AWS Bedrock → Sonnet 3.7 for gap analysis

Mobile (React Native):
- React Query → Cache-first state management
- Ably React SDK → Real-time event subscriptions
- Custom hooks → useStages.ts (mutations), useUnifiedSession.ts (Ably handlers)
```

**Installation:** No additional packages needed.

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── reconciler.ts           # Core state machine logic
│   ├── empathy-status.ts       # Status queries for UI
│   └── realtime.ts             # Ably event publishing
├── controllers/
│   └── stage2.ts               # HTTP endpoints, mutation triggers
└── utils/
    └── guards.ts               # NEW: Extract hasContextAlreadyBeenShared as guard

mobile/src/
├── hooks/
│   ├── useStages.ts            # Stage 2 mutations (resubmit, share response)
│   ├── useUnifiedSession.ts    # Ably event handlers for reconciler
│   └── queryKeys.ts            # Centralized cache key definitions
└── screens/
    └── UnifiedSessionScreen.tsx # Event subscription and cache updates
```

### Pattern 1: Infinite Loop Prevention via Sharing History Guard

**What:** Before setting empathy status to AWAITING_SHARING, check if subject has already shared context for this direction. Prevents infinite loop where resubmit → same gaps → new share offer.

**When to use:** Every reconciler entry point that may set AWAITING_SHARING status:
- `triggerReconcilerAndUpdateStatuses()` (symmetric flow) ✅ ALREADY HAS CHECK
- `runReconcilerForDirection()` (asymmetric flow) ❌ MISSING CHECK
- `triggerReconcilerForUser()` (resubmit flow) ❌ MISSING CHECK

**Example:**
```typescript
// In runReconcilerForDirection(), before setting AWAITING_SHARING:
const hasSignificantGaps =
  gaps.severity === 'significant' ||
  recommendation.action === 'OFFER_SHARING';

const contextAlreadyShared = hasSignificantGaps
  ? await hasContextAlreadyBeenShared(sessionId, guesserId, subjectId)
  : false;

if (contextAlreadyShared) {
  console.log(`[Reconciler] Context already shared ${subjectId}→${guesserId}, skipping AWAITING_SHARING`);
  status = EmpathyStatus.READY;
} else {
  status = hasSignificantGaps ? EmpathyStatus.AWAITING_SHARING : EmpathyStatus.READY;
}
```

**Source:** Audit document `.planning/phases/01-audit/01-02-AUDIT-RECONCILER.md` lines 539-577

### Pattern 2: Transaction Visibility via Explicit $transaction

**What:** Replace retry loop with explicit Prisma transaction that ensures ReconcilerResult is visible immediately after creation.

**When to use:** When creating ReconcilerResult and immediately querying it in `generateShareSuggestion()`.

**Example:**
```typescript
// CURRENT (fragile 100ms retry):
let dbResult = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  dbResult = await prisma.reconcilerResult.findUnique(...);
  if (dbResult) break;
  if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 100));
}

// BETTER (explicit transaction):
const dbResult = await prisma.$transaction(async (tx) => {
  // Create ReconcilerResult (already done before calling generateShareSuggestion)
  // Query it within same transaction scope
  return tx.reconcilerResult.findUnique({
    where: { sessionId_guesserId_subjectId: {...} }
  });
});
```

**Alternative:** Pass ReconcilerResult ID to `generateShareSuggestion()` instead of re-querying (avoids race entirely).

**Source:** Audit document lines 485-513, Prisma docs on transactions

### Pattern 3: Ably Event Listener for Cross-User State Transitions

**What:** When User A consents to share empathy (status HELD), add Ably listener for User B's `partner.stage_completed` event (Stage 1→2 transition). When received, trigger reconciler for A's direction.

**When to use:** After User A consents but partner hasn't completed Stage 1 yet. Eliminates manual refresh requirement.

**Example:**
```typescript
// Backend: When User B confirms feelHeard, publish event
await publishSessionEvent(sessionId, 'partner.stage_completed', {
  stage: 1,
  userId: userBId,
  advancedToStage: 2,
});

// Mobile: In UnifiedSessionScreen.tsx Ably handler
case 'partner.stage_completed':
  if (data.stage === 1 && data.advancedToStage === 2) {
    // Partner completed Stage 1, check if my empathy is HELD
    const myStatus = queryClient.getQueryData(stageKeys.empathyStatus(sessionId));
    if (myStatus?.myAttempt?.status === 'HELD') {
      // Trigger backend to run reconciler (new endpoint or existing refetch)
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
    }
  }
  break;
```

**Alternative:** Backend detects HELD status when partner completes Stage 1 and auto-triggers reconciler (no mobile change needed).

**Source:** Audit document lines 699-712, existing Ably patterns from Phase 5

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database transaction isolation | Custom retry loops with setTimeout | Prisma `$transaction()` or pass object reference | Prisma handles isolation levels; retry loops mask root cause |
| Message ordering | Explicit 100ms timestamp gaps | Database sequence column or message `order` field | Timestamps unreliable; proper ordering via explicit sequence |
| Sharing history tracking | SHARED_CONTEXT message queries | Persistent ReconcilerShareOffer status or ShareHistory table | Messages can be deleted; share history is business logic |
| Cache invalidation timing | Manual `invalidateQueries` after mutations | Optimistic updates with `setQueryData` | Prevents race conditions; immediate UI feedback |

**Key insight:** Retry loops with fixed delays are band-aids. Fix root cause (transaction scope, data modeling) instead.

## Common Pitfalls

### Pitfall 1: Relying on Message Persistence for State

**What goes wrong:** `hasContextAlreadyBeenShared()` checks for SHARED_CONTEXT messages to detect if subject already shared. If messages are deleted (cleanup, user action), check returns false and loop resumes.

**Why it happens:** Reconciler state (sharing history) stored in ephemeral chat messages instead of persistent business logic table.

**How to avoid:**
1. Add `contextSharedAt` timestamp to ReconcilerResult (persists through cascade delete)
2. OR: Soft-delete ReconcilerShareOffer instead of cascade delete (keep history)
3. OR: Create separate ShareHistory table independent of ReconcilerResult lifecycle

**Warning signs:**
- ReconcilerShareOffer deleted on resubmit (cascade from ReconcilerResult)
- Share suggestion appears again after guesser refines empathy

**Source:** Audit document lines 542-577, lines 1591 (cascade delete issue)

### Pitfall 2: Prisma Transaction Visibility Assumptions

**What goes wrong:** Code creates ReconcilerResult, then immediately queries it. Prisma may not see record due to transaction isolation level (READ COMMITTED default). Retry loop masks issue but fails on slow databases.

**Why it happens:** Prisma Client creates records in separate transaction from subsequent queries. Isolation level delays visibility.

**How to avoid:**
1. Use Prisma `$transaction()` to wrap create+query in same transaction scope
2. Pass created object reference instead of re-querying by ID
3. Configure Prisma isolation level explicitly (READ UNCOMMITTED for dev, SERIALIZABLE for production conflict detection)

**Warning signs:**
- Logs show "ReconcilerResult not found on attempt 1" then succeeds on attempt 2-3
- CRITICAL error "Could not find reconcilerResult after 3 attempts" in production logs
- Share suggestion drawer doesn't appear despite reconciler finding gaps

**Source:** Audit document lines 485-513, Prisma docs on transaction isolation

### Pitfall 3: No Event-Driven State Transition for HELD→ANALYZING

**What goes wrong:** User A consents to share empathy → status HELD. User B completes Stage 1 later. No automatic trigger to advance A's status to ANALYZING. User A must refresh/reopen to trigger reconciler.

**Why it happens:** Reconciler check (`consentToShare()` lines 668-698) only runs when user consents, not when partner completes Stage 1.

**How to avoid:**
1. Add Ably listener in mobile for `partner.stage_completed` (stage 1→2)
2. When received, check if my empathy is HELD, then invalidate cache to trigger backend refetch
3. Backend detects HELD status and auto-runs reconciler (new endpoint or existing flow)

**Warning signs:**
- Empathy status stuck at HELD indefinitely
- User sees "Waiting for partner to complete Stage 1" message even after partner finished
- Requires manual app restart or session refresh to advance

**Source:** Audit document lines 699-712

## Code Examples

Verified patterns from codebase and audit document:

### Sharing History Guard

```typescript
// Source: backend/src/controllers/stage2.ts lines 75-100
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

  if (existingSharedContext) {
    console.log(
      `[hasContextAlreadyBeenShared] Context already shared from ${subjectId} to ${guesserId} at ${existingSharedContext.timestamp.toISOString()}`
    );
    return true;
  }
  return false;
}

// Usage in symmetric flow (ALREADY IMPLEMENTED):
// backend/src/controllers/stage2.ts lines 155-167
const contextAlreadySharedToA = hasSignificantGapsA
  ? await hasContextAlreadyBeenShared(sessionId, userAId, userBId)
  : false;

if (contextAlreadySharedToA) {
  console.log(`[triggerReconcilerAndUpdateStatuses] Context already shared B→A, skipping AWAITING_SHARING for User A`);
  statusA = EmpathyStatus.READY;
} else {
  statusA = hasSignificantGapsA ? EmpathyStatus.AWAITING_SHARING : EmpathyStatus.READY;
}
```

**MISSING:** Same check in `runReconcilerForDirection()` and `triggerReconcilerForUser()`.

### ReconcilerResult Query Retry

```typescript
// Source: backend/src/services/reconciler.ts lines 792-813
// CURRENT FRAGILE PATTERN (100ms retry loop):
let dbResult = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`[Reconciler] Looking up ReconcilerResult (attempt ${attempt}/3)`);
  dbResult = await prisma.reconcilerResult.findUnique({
    where: {
      sessionId_guesserId_subjectId: {
        sessionId,
        guesserId: guesser.id,
        subjectId: subject.id,
      },
    },
  });
  if (dbResult) break;
  if (attempt < 3) {
    console.warn(`[Reconciler] ReconcilerResult not found, waiting 100ms...`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

if (!dbResult) {
  console.error(`[Reconciler] CRITICAL: Could not find reconcilerResult after 3 attempts!`);
  // Share suggestion lost
}
```

**ISSUE:** If dbResult not found after 300ms, share suggestion not displayed. Empathy stuck AWAITING_SHARING.

### Ably Event Handler for Reconciler Status

```typescript
// Source: mobile/src/screens/UnifiedSessionScreen.tsx lines 245-360
// Ably handler for empathy.status_updated event
const handleSessionEvent = useCallback((event: { name: string; data: any }) => {
  switch (event.name) {
    case 'empathy.status_updated':
      // Update empathy status cache directly
      queryClient.setQueryData(
        stageKeys.empathyStatus(sessionId),
        (old: any) => ({
          ...old,
          myAttempt: {
            ...old?.myAttempt,
            status: event.data.empathyStatuses?.[user.id]?.myAttempt?.status,
          },
        })
      );
      // Refetch for full data
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      break;

    case 'empathy.partner_considering_share':
      // Guesser receives notification that subject is considering sharing
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      break;

    case 'empathy.refining':
      // Guesser receives SHARED_CONTEXT, status → REFINING
      queryClient.setQueryData(
        stageKeys.empathyStatus(sessionId),
        (old: any) => ({
          ...old,
          myAttempt: { ...old?.myAttempt, status: 'REFINING' },
          hasNewSharedContext: true,
        })
      );
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
      break;
  }
}, [sessionId, user.id]);
```

**Source:** Audit document `.planning/phases/01-audit/01-04-AUDIT-CACHE-UPDATES.md` lines 481-500

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Symmetric reconciler (both share first) | Asymmetric reconciler (per-direction) | Jan 2026 (current) | Allows reconciler to run when subject completes Stage 1, not waiting for both |
| NEEDS_WORK status | AWAITING_SHARING, REFINING statuses | Jan 2026 (current) | More granular state tracking |
| Share suggestion in chat | Share suggestion in drawer only | Jan 2026 (current) | Less clutter, better UX |
| Fire-and-forget Ably events | Cache-first with optimistic updates | Dec 2025 | Eliminates race conditions |

**Deprecated/outdated:**
- `NEEDS_WORK` status (replaced by AWAITING_SHARING/REFINING) - still in guards for backward compat
- `runReconciler()` symmetric flow - replaced by `runReconcilerForDirection()` for asymmetric execution
- Abstract guidance fields (areaHint, guidanceType, promptSeed) - intended for refinement but unused in current flow

## Open Questions

1. **Prisma Isolation Level Configuration**
   - What we know: Prisma uses READ COMMITTED by default for PostgreSQL
   - What's unclear: Whether configuring SERIALIZABLE would prevent ReconcilerResult visibility race
   - Recommendation: Investigate Prisma schema `previewFeatures = ["transactionApi"]` and explicit isolation level per transaction

2. **ReconcilerShareOffer Cascade Delete vs. Soft Delete**
   - What we know: CASCADE delete on ReconcilerResult → ReconcilerShareOffer loses sharing history
   - What's unclear: Whether soft-delete pattern would add complexity vs. benefit
   - Recommendation: Add `contextSharedAt` timestamp to ReconcilerResult (persists through delete), OR create ShareHistory table

3. **Backend vs. Mobile Trigger for HELD→ANALYZING**
   - What we know: Both approaches viable (backend auto-detect HELD when partner completes Stage 1, or mobile Ably listener triggers backend)
   - What's unclear: Which is more reliable and maintainable
   - Recommendation: Backend auto-detect is simpler (no mobile change), but Ably listener is more event-driven (matches existing pattern)

## Sources

### Primary (HIGH confidence)
- `.planning/phases/01-audit/01-02-AUDIT-RECONCILER.md` (comprehensive state machine audit with reproduction steps)
- `backend/src/services/reconciler.ts` (actual implementation, lines 790-850 show retry loop)
- `backend/src/controllers/stage2.ts` (lines 75-100 hasContextAlreadyBeenShared, lines 155-167 usage)
- `mobile/src/screens/UnifiedSessionScreen.tsx` (lines 245-360 Ably event handlers)

### Secondary (MEDIUM confidence)
- `.planning/phases/01-audit/01-04-AUDIT-CACHE-UPDATES.md` (cache update verification, Ably handler inventory)
- `backend/src/lib/prisma.ts` (Prisma client configuration - no explicit isolation level set)
- Prisma documentation on transaction isolation (inferred from code patterns)

### Tertiary (LOW confidence)
- None - all findings verified against audit documents and actual codebase

## Metadata

**Confidence breakdown:**
- Infinite loop issue: HIGH - Documented in audit with exact code locations (lines 539-577), reproduction steps, root cause analysis
- ReconcilerResult visibility race: HIGH - Code shows 100ms retry loop (lines 790-813), CRITICAL error logged when fails
- HELD→ANALYZING retry: HIGH - Audit documents missing listener (lines 699-712), code confirms no automatic trigger

**Research date:** 2026-02-14
**Valid until:** 60 days (stable codebase, no fast-moving dependencies)

## Next Steps for Planning

**Planner should create tasks for:**

1. **Add sharing history guard to asymmetric flow**
   - File: `backend/src/services/reconciler.ts`
   - Function: `runReconcilerForDirection()` (before setting AWAITING_SHARING)
   - Pattern: Copy `hasContextAlreadyBeenShared()` check from `triggerReconcilerAndUpdateStatuses()`

2. **Add sharing history guard to resubmit flow**
   - File: `backend/src/controllers/stage2.ts`
   - Function: `triggerReconcilerForUser()` (lines 2023-2078)
   - Pattern: Same guard before allowing status → AWAITING_SHARING

3. **Fix ReconcilerResult visibility race**
   - Option A: Pass ReconcilerResult object reference to `generateShareSuggestion()` (no re-query)
   - Option B: Wrap create+query in Prisma `$transaction()`
   - Option C: Increase retry count and delay (band-aid, not recommended)

4. **Add Ably listener for partner Stage 1 completion**
   - Option A: Mobile listener for `partner.stage_completed` → invalidate empathy status cache
   - Option B: Backend auto-detect HELD status when partner completes Stage 1 → trigger reconciler
   - Recommended: Option B (simpler, no mobile change)

5. **Add E2E test for infinite loop scenario**
   - Scenario: User A shares empathy → reconciler finds gaps → User B shares context → User A refines but gaps still exist
   - Expected: Status advances to READY (no new share offer)
   - Actual (without fix): New share offer created (infinite loop)

**Files to modify:**
- `backend/src/services/reconciler.ts` (guards, transaction scope)
- `backend/src/controllers/stage2.ts` (resubmit guard, HELD auto-trigger)
- `e2e/tests/reconciler-infinite-loop.spec.ts` (NEW - test coverage)
