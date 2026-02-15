# Architecture Patterns: Reconciler Edge Cases & Stage 3-4 Integration

**Project:** Meet Without Fear
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

The existing reconciler architecture uses a state machine (`HELD → ANALYZING → NO_GAPS/GAPS_FOUND/NEEDS_WORK → AWAITING_SHARING → REFINING → REVEALED`) integrated with Ably real-time events and React Query cache-first state management. GAPS_FOUND and NEEDS_WORK are legacy statuses—current implementation uses `AWAITING_SHARING` and `REFINING` with reconciler actions (PROCEED, OFFER_OPTIONAL, OFFER_SHARING). Stage 3-4 follow the same architectural patterns: backend DTOs, React Query hooks, Ably events for partner updates, and cache-first UI derivation.

**Critical Integration Points:**
- **Reconciler edge cases** integrate via existing `EmpathyStatus` enum, `ReconcilerShareOffer` table, and Ably `empathy.*` events
- **Stage 3-4** integrate via new `stageKeys` cache entries, Share page tab navigation, and existing stage advancement system
- **Screenshots** are captured via Playwright's `page.screenshot()` at key checkpoints in two-browser E2E tests

## Recommended Architecture

### Reconciler State Machine (Current Implementation)

The reconciler does NOT use GAPS_FOUND or NEEDS_WORK as database statuses. These may exist as historical references but are not active states.

**Active Flow:**

```
HELD (empathy shared, waiting for partner Stage 1)
  ↓ (partner confirms feel-heard)
ANALYZING (reconciler runs via runReconcilerForDirection)
  ↓
  ├─→ NO GAPS: → READY (markEmpathyReady) → wait for both READY → REVEALED
  │
  ├─→ MODERATE GAPS (action: OFFER_OPTIONAL with suggestedShareFocus):
  │     → AWAITING_SHARING (generateShareSuggestion)
  │     → subject sees share suggestion via GET /sessions/:id/reconciler/share-offer
  │     → subject responds (accept/decline/refine) via POST .../share-offer/respond
  │       ├─→ ACCEPT: → REFINING (guesser) → subject continues stage conversation
  │       └─→ DECLINE: → READY (guesser) → wait for both READY → REVEALED
  │
  └─→ SIGNIFICANT GAPS (action: OFFER_SHARING):
        → AWAITING_SHARING (same flow as moderate)
```

**Database Schema:**

```prisma
model EmpathyAttempt {
  status EmpathyAttemptStatus // HELD, ANALYZING, AWAITING_SHARING, REFINING, READY, REVEALED, VALIDATED
}

model ReconcilerResult {
  recommendedAction String // PROCEED, OFFER_OPTIONAL, OFFER_SHARING
  gapSeverity String // none, minor, moderate, significant
  suggestedShareFocus String? // What to share (nullable)
}

model ReconcilerShareOffer {
  status ReconcilerShareStatus // PENDING, OFFERED, ACCEPTED, DECLINED, EXPIRED
  suggestedContent String // AI-generated suggestion
  refinedContent String? // User's refinement input
  sharedContent String? // Final shared content
}
```

**Key Functions:**

| Function | Purpose | Integration |
|----------|---------|-------------|
| `runReconcilerForDirection(sessionId, guesserId, subjectId)` | Analyze empathy gap for one direction | Called when subject confirms feel-heard |
| `generateShareSuggestion(...)` | Create AI suggestion for subject | Creates `ReconcilerShareOffer` record |
| `respondToShareSuggestion(sessionId, userId, {action, refinedContent})` | Subject accepts/declines/refines | Updates `EmpathyAttempt.status` to REFINING or READY |
| `markEmpathyReady(sessionId, guesserId, subjectName)` | No sharing needed path | Updates to READY, creates alignment message |
| `checkAndRevealBothIfReady(sessionId)` | Mutual reveal when both READY | Updates to REVEALED, sends Ably events |

### Ably Event System

**Session Events (Partner Notifications):**

```typescript
// Published from backend/src/services/realtime.ts
export async function publishSessionEvent(
  sessionId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  excludeUserId?: string
)

// Reconciler events:
'empathy.status_updated' → { status, forUserId, empathyStatus, message }
'empathy.revealed' → { direction, guesserUserId, forUserId, empathyStatus }
'empathy.context_shared' → { sharedContent, sharedAt }
```

**Mobile Event Handling:**

```typescript
// In UnifiedSessionScreen.tsx / useUnifiedSession.ts
useEffect(() => {
  const channel = ably.channels.get(`session:${sessionId}`);

  channel.subscribe('empathy.status_updated', (message) => {
    // Invalidate empathyStatus query to trigger refetch
    queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
  });

  channel.subscribe('empathy.revealed', (message) => {
    // Show validation modal if I'm the subject (not the guesser)
    if (message.data.guesserUserId !== myUserId) {
      // Subject sees validation_needed modal
    }
    queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
  });
}, [sessionId, myUserId]);
```

### React Query Cache Integration

**Cache Keys (from mobile/src/hooks/queryKeys.ts):**

```typescript
stageKeys.empathyStatus(sessionId) // EmpathyExchangeStatusResponse
stageKeys.shareOffer(sessionId)    // GetShareSuggestionResponse
stageKeys.partnerEmpathy(sessionId) // GetPartnerEmpathyResponse
```

**Cache Update Pattern (Cache-First):**

```typescript
// In useRespondToShareOffer mutation (mobile/src/hooks/useStages.ts)
onMutate: async ({ sessionId, action, sharedContent }) => {
  // 1. Cancel outgoing queries
  await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });

  // 2. Snapshot for rollback
  const previousInfinite = queryClient.getQueryData(messageKeys.infinite(sessionId));

  // 3. Optimistic update (only for accept action)
  if (action === 'accept' && sharedContent) {
    queryClient.setQueryData(messageKeys.infinite(sessionId), (old) => ({
      ...old,
      pages: [...old.pages, { messages: [optimisticMessage] }]
    }));
  }

  return { previousInfinite };
},

onSuccess: (data) => {
  // 4. Replace optimistic with server response
  queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
  queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
},

onError: (error, vars, context) => {
  // 5. Rollback on error
  if (context?.previousInfinite) {
    queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
  }
}
```

**UI Derivation (No Local State):**

```typescript
// In mobile/src/utils/chatUIState.ts or component
const { data: empathyStatus } = useEmpathyStatus(sessionId);

// Derive panel visibility from cache
const showShareSuggestionDrawer = empathyStatus?.awaitingSharing && empathyStatus?.suggestion?.hasSuggestion;
const showRefinementPrompt = empathyStatus?.myAttempt?.status === 'REFINING';
const showValidationModal = empathyStatus?.partnerAttempt?.status === 'REVEALED' && !validated;
```

## Stage 3-4 Integration Architecture

Stage 3 (Need Mapping) and Stage 4 (Strategic Repair) follow the same architectural patterns as Stage 2.

### Component Boundaries

| Component | Responsibility | Lives In | Communicates With |
|-----------|---------------|----------|-------------------|
| **UnifiedSessionScreen** | Orchestrates all stages, chat interface | `mobile/src/screens/` | All stage hooks, Ably subscriptions |
| **SharePageScreen** | Tab navigation for Empathy/Needs/Strategies/Agreement | `mobile/src/screens/` | Stage-specific content sections |
| **NeedsContentSection** | Stage 3 UI (needs list, common ground) | Share page | `useNeeds`, `useCommonGround` |
| **StrategiesContentSection** | Stage 4 UI (pool, ranking, overlap) | Share page | `useStrategies`, `useSubmitRankings` |
| **ChatInterface** | Message rendering, typing indicators, timeline | `mobile/src/components/` | Message hooks, streaming |

### Data Flow: Stage 3 (Need Mapping)

```
User completes Stage 2 (both empathy validated)
  ↓
Backend auto-advances to Stage 3 (via checkAndRevealBothIfReady)
  ↓
User navigates to Share page → Needs tab
  ↓
Frontend: useNeeds(sessionId) → GET /sessions/:id/needs
  ↓
Backend: AI extracts needs from Stage 1 messages (if not cached)
  ↓
Frontend: Renders NeedCard[] with confirm buttons
  ↓
User confirms needs → useMutation POST /sessions/:id/needs/confirm
  ↓ (optimistic update to cache)
Frontend: queryClient.setQueryData(stageKeys.needs(sessionId), ...)
  ↓
Backend: Marks needs confirmed, publishes Ably event
  ↓
Partner: Ably 'partner.needs_shared' → invalidates stageKeys.commonGround
  ↓
Backend: When BOTH confirm → analyzes common ground
  ↓
Frontend: useCommonGround(sessionId) → renders CommonGroundCard[]
  ↓
Both users confirm common ground → Stage 3 complete → auto-advance to Stage 4
```

### Data Flow: Stage 4 (Strategic Repair)

```
User in Stage 4 → Strategies tab
  ↓
Frontend: useStrategies(sessionId) → GET /sessions/:id/strategies
  ↓
User proposes strategy → useProposeStrategy mutation
  ↓ (optimistic update)
Backend: Saves strategy, publishes Ably 'partner.strategy_proposed'
  ↓
Partner: Invalidates stageKeys.strategies, refetches
  ↓
Both users mark ready to rank → useMarkReadyToRank
  ↓
Both users submit rankings → useSubmitRankings
  ↓ (optimistic update to cache)
Backend: Analyzes overlap when both submit
  ↓
Frontend: useStrategiesReveal → shows OverlapReveal component
  ↓
User creates agreement from overlap → useCreateAgreement
  ↓
Partner confirms agreement → useConfirmAgreement
  ↓
Backend: Marks agreement AGREED, publishes Ably event
  ↓
Session can be resolved → useResolveSession
```

### Ably Events for Stage 3-4

```typescript
// Existing events (from backend/src/services/realtime.ts)
'partner.needs_shared' → { sessionId, timestamp, userId }
'partner.common_ground_confirmed' → { sessionId, timestamp }
'partner.ready_to_rank' → { sessionId, timestamp, userId }
'partner.ranking_submitted' → { sessionId, timestamp }
'agreement.proposed' → { agreementId, description }
'agreement.confirmed' → { agreementId, agreedAt }
```

**Mobile Subscription Pattern:**

```typescript
// In UnifiedSessionScreen or stage-specific component
useEffect(() => {
  const channel = ably.channels.get(`session:${sessionId}`);

  const handler = (message: Types.Message) => {
    switch (message.name) {
      case 'partner.needs_shared':
        queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
        break;
      case 'partner.ranking_submitted':
        queryClient.invalidateQueries({ queryKey: stageKeys.strategiesReveal(sessionId) });
        break;
    }
  };

  channel.subscribe(handler);
  return () => channel.unsubscribe(handler);
}, [sessionId]);
```

## Playwright Screenshot Integration

**Screenshot Capture Pattern:**

```typescript
// In e2e/tests/two-browser-*.spec.ts
test('stage flow', async ({ browser }) => {
  const harness = new TwoBrowserHarness({ ... });

  // 1. Setup
  await harness.setupUserA(browser, request);
  await harness.setupUserB(browser, request);

  // 2. Execute stage actions
  await signCompact(harness.userAPage);
  await confirmFeelHeard(harness.userAPage);

  // 3. Capture screenshot at checkpoint
  await harness.userAPage.screenshot({
    path: 'test-results/stage1-user-a-feel-heard.png'
  });

  // 4. Navigate to Share page for Stage 3-4 verification
  await navigateToShareFromSession(harness.userAPage);
  await harness.userAPage.screenshot({
    path: 'test-results/stage3-needs-panel.png'
  });
});
```

**Screenshot Storage:**

- **Path:** `e2e/test-results/` (gitignored, not committed)
- **Naming:** `{stage}-{user}-{checkpoint}.png`
- **Purpose:** Visual verification, debugging, documentation
- **Retention:** Cleared on `npm run test` via Playwright config

**When to Capture Screenshots:**

| Checkpoint | Path | Purpose |
|------------|------|---------|
| Feel-heard confirmed | `stage1-user-{a\|b}-feel-heard.png` | Verify Stage 1 completion |
| Empathy draft panel | `stage2-user-{a\|b}-empathy-draft.png` | Verify empathy panel appears |
| Empathy revealed | `stage2-empathy-revealed.png` | Verify mutual reveal |
| Needs confirmed | `stage3-needs-confirmed.png` | Verify needs UI |
| Common ground | `stage3-common-ground.png` | Verify common ground analysis |
| Strategy pool | `stage4-strategy-pool.png` | Verify strategy collection |
| Overlap reveal | `stage4-overlap-reveal.png` | Verify overlap analysis |
| Agreement confirmed | `stage4-agreement-confirmed.png` | Verify final agreement |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Local State for Server-Derived Data

**What:** Using `useState` to track whether a panel should show, separate from cache data.

```typescript
// BAD
const [showShareSuggestion, setShowShareSuggestion] = useState(false);
useEffect(() => {
  if (empathyStatus?.awaitingSharing) {
    setShowShareSuggestion(true);
  }
}, [empathyStatus]);
```

**Why bad:** State and cache can desync on page reload or invalidation.

**Instead:**

```typescript
// GOOD
const { data: empathyStatus } = useEmpathyStatus(sessionId);
const showShareSuggestion = empathyStatus?.awaitingSharing && empathyStatus?.suggestion?.hasSuggestion;
```

### Anti-Pattern 2: Manual Ably Event Parsing Without Invalidation

**What:** Directly updating component state from Ably events without touching cache.

```typescript
// BAD
channel.subscribe('empathy.revealed', (message) => {
  setPartnerEmpathyRevealed(true);
});
```

**Why bad:** Cache is stale, other components won't update.

**Instead:**

```typescript
// GOOD
channel.subscribe('empathy.revealed', (message) => {
  queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
});
```

### Anti-Pattern 3: Mixing GAPS_FOUND/NEEDS_WORK with Current Flow

**What:** Treating `GAPS_FOUND` or `NEEDS_WORK` as database statuses.

**Why bad:** These are not active statuses in the current implementation. The system uses `AWAITING_SHARING` and `REFINING` with reconciler actions (PROCEED, OFFER_OPTIONAL, OFFER_SHARING).

**Instead:** Use `EmpathyStatus` enum values: HELD, ANALYZING, AWAITING_SHARING, REFINING, READY, REVEALED, VALIDATED.

### Anti-Pattern 4: Skipping Optimistic Updates for Instant Actions

**What:** Waiting for server response before updating UI for user-initiated actions.

**Why bad:** Perceived lag, poor UX.

**Instead:** Optimistic update → server call → replace on success → rollback on error (see Cache Update Pattern above).

## Integration Checklist

When adding new reconciler edge cases or Stage 3-4 features:

### Backend Integration
- [ ] Define DTO in `shared/src/dto/` (e.g., `reconciler.ts`, `needs.ts`, `strategies.ts`)
- [ ] Create/update database model in `backend/prisma/schema.prisma`
- [ ] Implement service function in `backend/src/services/` (e.g., `reconciler.ts`, `needs.ts`)
- [ ] Add controller endpoint in `backend/src/controllers/`
- [ ] Add route in `backend/src/routes/`
- [ ] Publish Ably event via `publishSessionEvent()` for partner updates

### Mobile Integration
- [ ] Add query key to `mobile/src/hooks/queryKeys.ts` (e.g., `stageKeys.shareOffer`)
- [ ] Create React Query hook in `mobile/src/hooks/useStages.ts` with optimistic updates
- [ ] Subscribe to Ably events in `UnifiedSessionScreen` or component
- [ ] Derive UI state from cache (no local state for server data)
- [ ] Update `chatUIState.ts` or component if panel visibility logic needed

### E2E Testing
- [ ] Add test to `e2e/tests/two-browser-*.spec.ts` using `TwoBrowserHarness`
- [ ] Create fixture in `backend/src/lib/e2e-fixtures.ts` (if MOCK_LLM=true)
- [ ] Capture screenshots at checkpoints using `page.screenshot({ path: 'test-results/...' })`
- [ ] Verify Ably events trigger cache invalidation via polling/assertions

## Sources

**PRIMARY (HIGH confidence):**
- `backend/src/services/reconciler.ts` - Reconciler state machine implementation
- `shared/src/dto/empathy.ts` - EmpathyStatus enum, ReconcilerShareStatus enum
- `shared/src/dto/reconciler.ts` - ReconcilerResult, ReconcilerAction types
- `backend/prisma/schema.prisma` - Database schema for EmpathyAttempt, ReconcilerResult, ReconcilerShareOffer
- `mobile/src/hooks/queryKeys.ts` - Cache key definitions
- `mobile/src/hooks/useStages.ts` - React Query hooks for all stages
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Ably subscription patterns
- `e2e/tests/two-browser-stage-2.spec.ts` - Screenshot capture examples

**SECONDARY (MEDIUM confidence):**
- `implementation/stage-3-4-e2e-completion-plan.md` - Stage 3-4 architecture overview
- `e2e/playwright.two-browser.config.ts` - Screenshot configuration
- CLAUDE.md memory section - Cache key patterns and panel display pattern
