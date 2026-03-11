# Stage 3-4 E2E Test Completion Plan

## Current State Assessment

### What's Working ✅

1. **EMPATHY_REVEALED State Factory** - Creates proper database state:
   - Both users with Stage 0, 1, 2 COMPLETED
   - Both users in Stage 3 IN_PROGRESS
   - Both empathy attempts VALIDATED with delivery status
   - Session ACTIVE, invitation ACCEPTED

2. **Share Page Migration** - Stage 3/4 content is on Share page:
   - Tab selector with Empathy, Needs, Strategies, Agreement tabs
   - NeedsContentSection displays user needs and common ground
   - StrategiesContentSection handles strategy pool, ranking, overlap reveal
   - AgreementContentSection shows agreement confirmation

3. **Backend APIs** - All Stage 3/4 endpoints implemented:
   - `/sessions/:id/needs` - GET/POST needs
   - `/sessions/:id/needs/confirm` - Confirm needs
   - `/sessions/:id/common-ground` - GET common ground
   - `/sessions/:id/common-ground/confirm` - Confirm common ground
   - `/sessions/:id/strategies` - GET/POST strategies
   - `/sessions/:id/strategies/rank` - Submit rankings
   - `/sessions/:id/strategies/overlap` - Get overlap
   - `/sessions/:id/agreements` - GET/POST agreements
   - `/sessions/:id/agreements/:id/confirm` - Confirm agreement

4. **Components** - All UI components exist:
   - NeedCard, NeedsSection, CommonGroundCard
   - StrategyCard, StrategyPool, StrategyRanking, OverlapReveal
   - AgreementCard

5. **Hooks** - React Query hooks for all operations:
   - useNeeds, useConfirmNeeds, useCommonGround, useConfirmCommonGround
   - useStrategies, useSubmitRankings, useStrategiesReveal
   - useAgreements, useCreateAgreement, useConfirmAgreement

### Issues Found ⚠️

1. **Mood Check Still Appears** - Despite setting `lastMoodIntensity: 7` in state factory, mood check shows
   - Root cause: Need to investigate mood check display logic
   - Workaround: Test clicks through it (current approach)

2. **Test Selector Mismatch** - Test couldn't find Needs tab:
   - Test used: `getByTestId('needs-tab')` and `getByRole('button', { name: /needs/i })`
   - Actual testID: `share-tab-selector-tab-needs`

3. **AI Suggestions Not Implemented** - Stage 4 `requestSuggestions` returns empty array
   - Not blocking for happy path test (users can propose strategies manually)

4. **Inline Cards Still Present** - Stage 3 needs show as inline cards on chat screen
   - May be intentional (dual display) or outdated
   - Per PRD: "Stage 3/4 content currently in inline cards - needs migration to Share page"
   - Migration appears complete, but inline cards remain

### What Needs to Be Done 🚧

## Implementation Tasks

### Task 1: Fix E2E Test Selectors
**Priority: HIGH**

Update test to use correct testIDs for Share page tabs:
- `share-tab-selector-tab-empathy`
- `share-tab-selector-tab-needs`
- `share-tab-selector-tab-strategies`
- `share-tab-selector-tab-agreement`

### Task 2: Extend E2E Test for Stage 3 Flow
**Priority: HIGH**

Add test steps for Stage 3 (Need Mapping):
1. Navigate to Share page
2. Click on "Needs" tab
3. Verify needs are displayed
4. Click "Confirm my needs" (if confirmation UI exists on Share page)
5. Wait for partner to confirm
6. Verify common ground appears
7. Confirm common ground

### Task 3: Extend E2E Test for Stage 4 Flow
**Priority: HIGH**

Add test steps for Stage 4 (Strategic Repair):
1. Click on "Strategies" tab
2. Propose a strategy (via API or UI)
3. Mark ready to rank
4. Submit rankings
5. Wait for partner to rank
6. Verify overlap reveal
7. Create agreement from overlapping strategy
8. Confirm agreement

### Task 4: Create Stage 3-4 E2E Fixtures
**Priority: MEDIUM**

Create fixtures for deterministic AI responses:
- `stage-3-4-happy-path.ts` - Full flow fixture
- Needs extraction responses
- Common ground analysis responses
- (Strategy suggestions if implementing AI suggestions)

### Task 5: Investigate Mood Check Issue
**Priority: LOW**

Determine why mood check appears despite `lastMoodIntensity` being set:
- Check mood check display logic in UnifiedSessionScreen
- Verify user.lastMoodIntensity is being read correctly
- May need to also set `lastMoodAt` timestamp

### Task 6: Decide on Inline Cards
**Priority: LOW**

Clarify with product whether inline cards should remain:
- Option A: Remove inline cards (Share page is single source)
- Option B: Keep both (chat has quick view, Share has full view)
- Option C: Chat shows indicator/link, Share has full content

## Test Flow Diagram

```
EMPATHY_REVEALED (seed state)
        │
        ▼
┌───────────────────────────────────────────────────┐
│ User A & B navigate to session                    │
│ (handle mood check if present)                    │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Navigate to Share page                            │
│ Verify Empathy tab shows validated empathy        │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ STAGE 3: Click "Needs" tab                        │
│ User A: Verify needs displayed                    │
│ User A: Confirm needs (API call)                  │
│ User B: Confirm needs (API call)                  │
│ Both: Verify common ground appears                │
│ Both: Confirm common ground (API call)            │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ STAGE 4: Click "Strategies" tab                   │
│ User A: Propose strategy (API call)               │
│ User B: Propose strategy (API call)               │
│ Both: Mark ready to rank (API call)               │
│ Both: Submit rankings (API call)                  │
│ Both: Verify overlap reveal                       │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ AGREEMENT: Click "Agreement" tab                  │
│ User A: Create agreement from overlap (API call)  │
│ User B: Confirm agreement (API call)              │
│ Both: Verify agreement confirmed                  │
│ Screenshot final state                            │
└───────────────────────────────────────────────────┘
        │
        ▼
    TEST COMPLETE ✅
```

## Files to Modify

1. `e2e/tests/stage-3-4-complete.spec.ts` - Main test file
2. `backend/src/testing/state-factory.ts` - Fix any remaining issues
3. `backend/src/lib/e2e-fixtures.ts` - Add Stage 3/4 fixture (if needed)
4. (Optional) `mobile/src/screens/UnifiedSessionScreen.tsx` - Remove inline cards

## Success Criteria

1. ✅ E2E test runs from EMPATHY_REVEALED through Agreement confirmation
2. ✅ Screenshots captured at each stage for visual verification
3. ✅ Both users complete full Stage 3/4 flow
4. ✅ Test is deterministic and reliable (no flaky timeouts)
5. ✅ Test runs in under 3 minutes

## Estimated Complexity

- Task 1 (Fix selectors): Simple - 15 min
- Task 2 (Stage 3 flow): Medium - 1 hour
- Task 3 (Stage 4 flow): Medium - 1 hour
- Task 4 (Fixtures): Medium - 1 hour (if needed)
- Task 5 (Mood check): Low - 30 min investigation
- Task 6 (Inline cards): Decision needed

**Total: ~3-4 hours for full implementation**
