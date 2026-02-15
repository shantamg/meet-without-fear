# Integration Guide: Reconciler Edge Cases & Stage 3-4 Architecture

**Project:** Meet Without Fear
**Researched:** 2026-02-15
**Overall confidence:** HIGH
**Focus:** How reconciler edge cases and Stage 3-4 integrate with existing architecture

## Executive Summary

This guide documents how GAPS_FOUND/NEEDS_WORK flows, refinement patterns, and Stage 3-4 features integrate with the existing cache-first React Query architecture, Ably event system, and E2E test infrastructure. The key finding is that **reconciler edge cases are already implemented** using `AWAITING_SHARING` and `REFINING` statuses—GAPS_FOUND and NEEDS_WORK do NOT appear as active database statuses in the current codebase.

Stage 3-4 integration is **complete** at the code level (DTOs, hooks, components, Ably events all exist). The main work is extending E2E tests to cover the full flow and capturing screenshots at integration checkpoints.

## Reconciler Edge Case Integration

### Current Implementation vs. Expected Statuses

**CRITICAL FINDING:** The codebase does NOT use `GAPS_FOUND` or `NEEDS_WORK` as active `EmpathyStatus` values.

**Active Statuses (from `shared/src/dto/empathy.ts`):**
```typescript
export const EmpathyStatus = {
  HELD: 'HELD',                      // ✅ Active
  ANALYZING: 'ANALYZING',            // ✅ Active
  AWAITING_SHARING: 'AWAITING_SHARING', // ✅ Active (replaces GAPS_FOUND)
  REFINING: 'REFINING',              // ✅ Active (replaces NEEDS_WORK)
  NEEDS_WORK: 'NEEDS_WORK',          // ⚠️ Legacy - not used in active code
  READY: 'READY',                    // ✅ Active
  REVEALED: 'REVEALED',              // ✅ Active
  VALIDATED: 'VALIDATED',            // ✅ Active
}
```

**Reconciler Actions (controls behavior):**
```typescript
export const ReconcilerAction = {
  PROCEED: 'PROCEED',               // No gaps - go straight to READY
  OFFER_OPTIONAL: 'OFFER_OPTIONAL', // Moderate gaps - suggest sharing
  OFFER_SHARING: 'OFFER_SHARING',   // Significant gaps - strongly recommend sharing
}
```

### Integration Pattern: How Edge Cases Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Reconciler analyzes gap between empathy and Stage 1 content │
│ Returns: ReconcilerResult with action + gapSeverity         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │                               │
        action = PROCEED              action = OFFER_*
         (no/minor gaps)            (moderate/significant gaps)
              │                               │
              ▼                               ▼
    markEmpathyReady()          generateShareSuggestion()
    status = READY              status = AWAITING_SHARING
              │                               │
              │                    ┌──────────┴──────────┐
              │                    │                     │
              │              Subject ACCEPTS      Subject DECLINES
              │              via respond API      via respond API
              │                    │                     │
              │         status = REFINING       status = READY
              │         (guesser receives           (same as
              │          shared context)          PROCEED path)
              │                    │                     │
              └────────────────────┴─────────────────────┘
                              │
                              ▼
                   Both directions READY
                              │
                              ▼
              checkAndRevealBothIfReady()
              status = REVEALED (both users)
```

### Code Integration Points

**Backend Service:**
- `backend/src/services/reconciler.ts` - State machine logic
- `runReconcilerForDirection()` - Analyzes one direction
- `generateShareSuggestion()` - Creates `ReconcilerShareOffer`
- `respondToShareSuggestion()` - Handles accept/decline/refine

**Mobile Hooks:**
- `useEmpathyStatus(sessionId)` - Fetches status via `stageKeys.empathyStatus`
- `useShareOffer(sessionId)` - Fetches pending offer via `stageKeys.shareOffer`
- `useRespondToShareOffer()` - Mutation with optimistic updates

**Cache Invalidation:**
```typescript
// In UnifiedSessionScreen.tsx
channel.subscribe('empathy.status_updated', (message) => {
  queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
});

channel.subscribe('empathy.revealed', (message) => {
  queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
});
```

### What "GAPS_FOUND" and "NEEDS_WORK" Should Mean

**Recommendation:**

1. **If these are NEW features to add:**
   - Map to existing `AWAITING_SHARING` and `REFINING` flows
   - Update documentation to use current status names

2. **If these are legacy references:**
   - Remove from planning documents
   - Document migration: GAPS_FOUND → AWAITING_SHARING, NEEDS_WORK → REFINING

3. **If these are UI labels (not database statuses):**
   - Use in UI text but map to `AWAITING_SHARING`/`REFINING` in code
   - Example: Show "Needs work" label when `status === 'REFINING'`

## Stage 3-4 Integration

### Integration Status: Already Complete

All Stage 3-4 code exists:

**Backend (✅ Complete):**
- DTOs in `shared/src/dto/needs.ts` and `shared/src/dto/strategies.ts`
- Services in `backend/src/services/needs.ts`, `strategies.ts`
- Controllers in `backend/src/controllers/stage3.ts`, `stage4.ts`
- Routes in `backend/src/routes/stage3.ts`, `stage4.ts`

**Mobile (✅ Complete):**
- Hooks in `mobile/src/hooks/useStages.ts`
- Components in `mobile/src/components/` (NeedsSection, StrategyPool, etc.)
- Share page in `mobile/src/screens/SharePageScreen.tsx`

**E2E (⚠️ Needs Extension):**
- Stage 0-2 tests complete
- Stage 3-4 test plan documented in `implementation/stage-3-4-e2e-completion-plan.md`
- **Work needed:** Extend tests with Stage 3-4 steps and screenshots

### Stage 3 Integration Pattern

**Data Flow:**
```
User completes Stage 2 (both empathy validated)
  ↓
Backend: checkAndRevealBothIfReady() auto-advances to Stage 3
  ↓ (Ably event: partner.advanced)
Mobile: Invalidates stageKeys.progress(sessionId)
  ↓
User navigates to Share page → Needs tab
  ↓
Mobile: useNeeds(sessionId) → GET /sessions/:id/needs
  ↓
Backend: needsService.extractNeeds() (AI extraction from Stage 1)
  ↓
Mobile: Renders NeedCard[] with confirm buttons
  ↓
User confirms needs → useMutation POST /sessions/:id/needs/confirm
  ↓ (optimistic cache update)
queryClient.setQueryData(stageKeys.needs(sessionId), updatedNeeds)
  ↓
Backend: Marks needs confirmed, publishes 'partner.needs_shared'
  ↓
Partner: Ably event → invalidates stageKeys.commonGround
  ↓
Backend: When BOTH confirm → runs findCommonGround()
  ↓
Mobile: useCommonGround(sessionId) → GET /sessions/:id/common-ground
  ↓
Backend: Returns CommonGroundDTO[] (semantic similarity matching)
  ↓
Mobile: Renders CommonGroundCard[] with confirm buttons
  ↓
Both confirm → Stage 3 complete → auto-advance to Stage 4
```

**Cache Keys Used:**
- `stageKeys.needs(sessionId)` - User's identified needs
- `stageKeys.commonGround(sessionId)` - Shared common ground

**Ably Events:**
- `partner.needs_shared` - Partner confirmed their needs
- `partner.common_ground_confirmed` - Partner confirmed common ground

### Stage 4 Integration Pattern

**Data Flow:**
```
User in Stage 4 → Strategies tab
  ↓
Mobile: useStrategies(sessionId) → GET /sessions/:id/strategies
  ↓
Backend: Returns all strategies (anonymous, no attribution)
  ↓
Mobile: Renders StrategyPool component
  ↓
User proposes strategy → useProposeStrategy mutation
  ↓ (optimistic cache update)
queryClient.setQueryData(stageKeys.strategies(sessionId), [
  ...old.strategies,
  optimisticStrategy
])
  ↓
Backend: Saves strategy, publishes 'partner.strategy_proposed'
  ↓
Partner: Ably event → invalidates stageKeys.strategies
  ↓
Both users mark ready → useMarkReadyToRank
  ↓
Both submit rankings → useSubmitRankings
  ↓ (optimistic cache update)
Backend: Calculates overlap when both ranked
  ↓
Mobile: useStrategiesReveal → GET /sessions/:id/strategies/overlap
  ↓
Backend: Returns top-3 overlap (or best individual choices if no overlap)
  ↓
Mobile: Renders OverlapReveal component
  ↓
User creates agreement → useCreateAgreement
  ↓
Partner confirms → useConfirmAgreement
  ↓
Backend: Marks AGREED, publishes 'agreement.confirmed'
  ↓
Session complete → useResolveSession
```

**Cache Keys Used:**
- `stageKeys.strategies(sessionId)` - All strategies in pool
- `stageKeys.strategiesReveal(sessionId)` - Overlap reveal data
- `stageKeys.agreements(sessionId)` - Agreement confirmations

**Ably Events:**
- `partner.strategy_proposed` - Partner added strategy
- `partner.ready_to_rank` - Partner marked ready
- `partner.ranking_submitted` - Partner submitted rankings
- `agreement.proposed` - Agreement created
- `agreement.confirmed` - Partner confirmed agreement

## E2E Test Integration

### Current Test Coverage

**Complete (Stage 0-2):**
- `e2e/tests/two-browser-stage-0.spec.ts` - Compact signing
- `e2e/tests/two-browser-stage-1.spec.ts` - Feel-heard confirmation
- `e2e/tests/two-browser-stage-2.spec.ts` - Empathy sharing, reconciler, validation
- `e2e/tests/two-browser-full-flow.spec.ts` - Stages 0→2 complete

**Incomplete (Stage 3-4):**
- Test plan documented in `implementation/stage-3-4-e2e-completion-plan.md`
- State factory `EMPATHY_REVEALED` exists in `backend/src/testing/state-factory.ts`
- **Work needed:** Extend tests with Stage 3-4 steps

### Screenshot Integration Pattern

**From existing tests (`two-browser-stage-2.spec.ts`):**

```typescript
// At key checkpoint
await harness.userAPage.screenshot({
  path: 'test-results/stage2-user-a-empathy-draft.png'
});

// For both users at same state
await Promise.all([
  harness.userAPage.screenshot({ path: 'test-results/stage3-needs-panel-a.png' }),
  harness.userBPage.screenshot({ path: 'test-results/stage3-needs-panel-b.png' }),
]);
```

**Recommended Screenshot Checkpoints:**

| Stage | Checkpoint | Path | Purpose |
|-------|------------|------|---------|
| 3 | Needs displayed | `stage3-needs-panel-{a\|b}.png` | Verify needs extraction UI |
| 3 | Common ground | `stage3-common-ground-{a\|b}.png` | Verify common ground matching |
| 4 | Strategy pool | `stage4-strategy-pool-{a\|b}.png` | Verify anonymous pool display |
| 4 | Overlap reveal | `stage4-overlap-reveal-{a\|b}.png` | Verify ranking overlap calculation |
| 4 | Agreement confirmed | `stage4-agreement-confirmed-{a\|b}.png` | Verify final state |

### TwoBrowserHarness Pattern

**From `e2e/tests/two-browser-stage-2.spec.ts`:**

```typescript
const harness = new TwoBrowserHarness({
  userA: {
    email: 'stage3-a@e2e.test',
    name: 'Shantam',
    fixtureId: 'user-a-full-journey',
  },
  userB: {
    email: 'stage3-b@e2e.test',
    name: 'Darryl',
    fixtureId: 'stage-3-4-happy-path', // NEW fixture needed
  },
});

// Setup
await harness.cleanup();
await harness.setupUserA(browser, request);
await harness.createSession();
await harness.setupUserB(browser, request);

// Navigate
await harness.navigateUserA();
await harness.navigateUserB();

// Stage-specific actions
await navigateToShareFromSession(harness.userAPage);
const needsTab = harness.userAPage.getByTestId('share-tab-selector-tab-needs');
await needsTab.click();

// Screenshot
await harness.userAPage.screenshot({ path: 'test-results/stage3-needs.png' });
```

## Integration Checklist

When extending for new reconciler patterns or Stage 3-4 features:

### Backend
- [x] DTOs defined in `shared/src/dto/`
- [x] Service functions in `backend/src/services/`
- [x] Controllers in `backend/src/controllers/`
- [x] Routes in `backend/src/routes/`
- [x] Ably events published via `publishSessionEvent()`

### Mobile
- [x] Query keys in `mobile/src/hooks/queryKeys.ts`
- [x] Hooks with optimistic updates in `mobile/src/hooks/useStages.ts`
- [x] Ably subscriptions in `UnifiedSessionScreen` or components
- [x] UI components in `mobile/src/components/`
- [ ] Cache invalidation verified for all Ably events

### E2E
- [ ] Test extended to cover Stage 3-4 in `e2e/tests/two-browser-*.spec.ts`
- [ ] Fixture created (if MOCK_LLM=true) in `backend/src/lib/e2e-fixtures.ts`
- [ ] Screenshots captured at checkpoints
- [ ] Test verifies Ably events trigger cache invalidation

## Open Questions for Clarification

1. **GAPS_FOUND and NEEDS_WORK statuses:**
   - Are these NEW features to build?
   - Or legacy references to rename to AWAITING_SHARING/REFINING?
   - Or UI labels that map to existing statuses?

2. **Screenshot retention:**
   - Should screenshots be archived for visual regression testing?
   - Or only kept temporarily for debugging?
   - Current: Cleared on each test run (not committed)

3. **Mood check appearing in tests:**
   - Root cause unknown (sets `lastMoodIntensity: 7` but still appears)
   - Workaround: Click through in tests
   - Should this be investigated or is workaround acceptable?

## Next Steps

1. **Clarify GAPS_FOUND/NEEDS_WORK requirements** (blocks reconciler edge case work)
2. **Verify Ably event → cache invalidation** for Stage 3-4 (low risk, quick test)
3. **Extend E2E tests** following plan in `implementation/stage-3-4-e2e-completion-plan.md`
4. **Capture screenshots** at documented checkpoints

**Estimated effort:** 3-4 hours for E2E extension (per existing plan)
