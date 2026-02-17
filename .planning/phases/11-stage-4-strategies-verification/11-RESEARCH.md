# Phase 11: Stage 4 (Strategies) Verification - Research

**Researched:** 2026-02-17
**Domain:** Stage 4 (Strategic Repair) E2E testing with strategy collection, ranking, overlap reveal, and agreement confirmation
**Confidence:** HIGH

## Summary

Phase 11 verifies that Stage 4 (Strategic Repair) works end-to-end for both users. The stage enables both users to contribute strategy suggestions to an anonymous pool, rank strategies independently, see overlap when both have ranked, and confirm a final agreement. Unlike Stage 3 (parallel needs extraction), Stage 4 is sequential - both users must complete Stage 3 before entering Stage 4.

The backend fully implements Stage 4 functionality: strategy proposal service (`backend/src/controllers/stage4.ts`), ranking logic with overlap detection, and agreement creation. Mobile UI exists with `StrategicRepairScreen.tsx` implementing five phases: COLLECTING, RANKING, REVEALING, NEGOTIATING, and AGREED. Visual components include `StrategyPool`, `StrategyRanking`, `OverlapReveal`, and `AgreementCard`.

Phase 10 established critical patterns for testing React Native Web with Playwright: testIDs are not reliably accessible, API-driven actions work better than UI clicks, and text-based selectors provide verification. Screenshots serve as visual documentation when UI interaction is unreliable.

**Primary recommendation:** Create two-browser E2E test using API-driven approach from Phase 10. Start session at NEED_MAPPING_COMPLETE (Stage 3 done), use fixtures for deterministic AI strategy suggestions, verify each phase with screenshots. Accept that UI button clicks may not work - use API calls for actions, verify UI state with text-based selectors and screenshots.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRAT-01 | Both users can view and contribute strategy suggestions | Backend: GET /sessions/:id/strategies returns anonymous pool, POST /sessions/:id/strategies creates proposals. Mobile: StrategicRepairScreen COLLECTING phase with UserStrategyInput component, hooks useStrategies and useProposeStrategy exist |
| STRAT-02 | Both users can rank strategies | Backend: POST /sessions/:id/strategies/rank accepts rankedIds array. Mobile: StrategicRepairScreen RANKING phase with StrategyRanking component, useSubmitRankings hook exists |
| STRAT-03 | Overlap reveal shows agreed strategies to both users | Backend: GET /sessions/:id/strategies/overlap returns overlap array after both rank. Mobile: StrategicRepairScreen REVEALING phase with OverlapReveal component, useStrategiesReveal hook exists |
| STRAT-04 | Both users can confirm agreement | Backend: POST /sessions/:id/agreements creates agreement, POST /sessions/:id/agreements/:id/confirm confirms. Mobile: AgreementCard component with onConfirm callback, useConfirmAgreement and useResolveSession hooks exist |
| STRAT-05 | Playwright screenshots capture strategy pool, ranking, and agreement states | E2E infrastructure from Phase 10: SessionBuilder supports NEED_MAPPING_COMPLETE starting point, two-browser pattern with side-by-side contexts, screenshot capture at each phase |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | 1.40+ (project) | E2E testing framework | Project uses Playwright for all E2E tests with iPhone 12 device emulation |
| SessionBuilder | Phase 8+ | Test session setup | Fluent API for creating sessions at specific stages (NEED_MAPPING_COMPLETE for Stage 4 entry) |
| E2E Fixtures | Backend pattern | Deterministic AI responses | All E2E tests use mocked LLM with per-user fixtures (MOCK_LLM=true) |
| React Query | ^4.x | State management | Mobile uses cache-first pattern with optimistic updates for all mutations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| test-utils helpers | Phase 3-10 | E2E test utilities | createUserContext, handleMoodCheck, makeApiRequest for authenticated API calls |
| AWS Bedrock | ^3.x | AI service (backend) | AI strategy suggestions via getCompletion, falls back to mock if no API key |
| Prisma | ^5.x | Database ORM | Strategies stored in StrategyProposal, rankings in StrategyRanking, agreements in Agreement tables |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-browser tests | API-only tests | UI interaction verifies actual user experience, but RN Web makes this challenging |
| Mocked AI fixtures | Live AI (MOCK_LLM=false) | Mocked AI is deterministic and fast, live AI is non-deterministic and slow |
| API-driven actions | UI button clicks | UI clicks preferred but unreliable in RN Web; API calls work consistently |
| SessionBuilder | Manual DB seeding | SessionBuilder provides cleaner API and handles relationships automatically |

**Installation:**
```bash
# No new dependencies - all tools already in project
cd e2e && npx playwright test  # Run E2E tests
```

## Architecture Patterns

### Recommended Project Structure
```
.planning/phases/11-stage-4-strategies-verification/
├── 11-RESEARCH.md              # This file
├── 11-01-PLAN.md               # Two-browser E2E test for strategy collection and ranking
├── 11-02-PLAN.md               # Overlap reveal and agreement confirmation test
└── 11-VERIFICATION.md          # Cross-check all requirements

e2e/tests/
├── two-browser-stage-4.spec.ts # Main E2E test for Stage 4 (new)
└── fixtures/
    └── stage-4-strategies.ts   # Fixture with strategy suggestions responses (new)

backend/src/fixtures/
└── stage-4-strategies.ts       # E2E fixture for deterministic strategy generation (new)

test-results/
├── stage-4-01-strategy-pool-user-a.png
├── stage-4-01-strategy-pool-user-b.png
├── stage-4-02-ranking-user-a.png
├── stage-4-02-ranking-user-b.png
├── stage-4-03-overlap-reveal-user-a.png
├── stage-4-03-overlap-reveal-user-b.png
├── stage-4-04-agreement-user-a.png
└── stage-4-04-agreement-user-b.png
```

### Pattern 1: Two-Browser Stage 4 Test Structure
**What:** Use SessionBuilder with NEED_MAPPING_COMPLETE starting point, create fixtures with deterministic strategy suggestions and ranking responses
**When to use:** All Stage 4 E2E tests (requires both users to see strategy phases simultaneously)
**Example:**
```typescript
// Source: Adapted from e2e/tests/two-browser-stage-3.spec.ts
test.describe('Stage 4: Strategic Repair', () => {
  let sessionId: string;
  let userAId: string, userBId: string;
  let pageA: Page, pageB: Page;

  test.beforeEach(async ({ browser, request }) => {
    // Start at NEED_MAPPING_COMPLETE (Stage 3 complete, Stage 4 IN_PROGRESS)
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA('user-a@e2e.test', 'Alice')
      .userB('user-b@e2e.test', 'Bob')
      .startingAt('NEED_MAPPING_COMPLETE')
      .withFixture('stage-4-strategies') // Deterministic strategy generation
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    // Create browser contexts side-by-side
    const { page: pageASetup } = await createUserContext(
      browser, 'user-a@e2e.test', userAId, 'stage-4-strategies', { x: 0, y: 0 }
    );
    const { page: pageBSetup } = await createUserContext(
      browser, 'user-b@e2e.test', userBId, 'stage-4-strategies', { x: 450, y: 0 }
    );
    pageA = pageASetup;
    pageB = pageBSetup;
  });
});
```

### Pattern 2: Strategy Generation Fixture
**What:** Create E2E fixture with deterministic `generate-strategies` operation responses
**When to use:** All Stage 4 tests need predictable strategy suggestions to verify UI display
**Example:**
```typescript
// Source: Adapted from backend/src/fixtures/stage-3-needs.ts
// backend/src/fixtures/stage-4-strategies.ts (NEW FILE)
export const stage4Strategies: E2EFixture = {
  name: 'Stage 4 Strategies',
  description: 'Deterministic AI responses for strategy generation and overlap detection',

  responses: [
    // Reuse Stage 0-3 responses from existing fixtures for session setup
  ],

  operations: {
    'generate-strategies': {
      response: {
        strategies: [
          {
            description: 'Have a 10-minute phone-free conversation at dinner each day for 5 days',
            needsAddressed: ['Connection', 'Recognition'],
            duration: '5 days',
            measureOfSuccess: 'Did we do it? How did it feel?'
          },
          {
            description: 'Say one specific thing I appreciate each morning for a week',
            needsAddressed: ['Recognition'],
            duration: '1 week',
            measureOfSuccess: 'Did we remember? Did it feel genuine?'
          },
          {
            description: 'Use a pause signal when conversations get heated',
            needsAddressed: ['Safety', 'Connection'],
            duration: 'Ongoing',
            measureOfSuccess: 'Did we use it? Did it help?'
          }
        ]
      }
    }
  }
};
```

### Pattern 3: API-Driven Phase Progression
**What:** Use API calls to advance through Stage 4 phases rather than unreliable UI clicks
**When to use:** All Stage 4 E2E tests (learned from Phase 10 that RN Web testIDs aren't accessible)
**Example:**
```typescript
// Source: Pattern from e2e/tests/two-browser-stage-3.spec.ts and backend/src/controllers/stage4.ts

// Phase 1: Get strategies (triggers generation if empty)
const strategiesA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`);
const strategiesDataA = await strategiesA.json();
console.log(`User A sees ${strategiesDataA.data?.strategies?.length} strategies`);

// Phase 2: Mark ready to rank
await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);

// Phase 3: Submit rankings
const strategyIds = strategiesDataA.data.strategies.map(s => s.id);
const userARanking = [strategyIds[0], strategyIds[1], strategyIds[2]]; // Top 3
const userBRanking = [strategyIds[0], strategyIds[2], strategyIds[1]]; // Different order

await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
  rankedIds: userARanking
});
await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
  rankedIds: userBRanking
});

// Phase 4: Get overlap
const overlapResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/overlap`);
const overlapData = await overlapResponse.json();
console.log(`Overlap: ${overlapData.data?.overlap?.length} strategies`);

// Phase 5: Create and confirm agreement
const agreementResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/agreements`, {
  strategyId: overlapData.data.overlap[0].id,
  description: overlapData.data.overlap[0].description,
  type: 'MICRO_EXPERIMENT',
  duration: '5 days',
  measureOfSuccess: 'Did we do it?'
});
const agreementData = await agreementResponse.json();

await apiB.post(
  `${API_BASE_URL}/api/sessions/${sessionId}/agreements/${agreementData.data.agreement.id}/confirm`,
  { confirmed: true }
);
```

### Pattern 4: Text-Based UI Verification
**What:** Use text selectors and screenshots to verify UI state changes between phases
**When to use:** When testIDs aren't accessible (common in RN Web)
**Example:**
```typescript
// Source: Pattern from e2e/tests/two-browser-stage-3.spec.ts

// Verify strategy pool phase (COLLECTING)
const poolTitleA = pageA.getByText(/Here is what we have come up with/i);
await expect(poolTitleA).toBeVisible({ timeout: 10000 });
await pageA.screenshot({ path: 'test-results/stage-4-01-pool-user-a.png' });

// Verify ranking phase
const rankingInstructionsA = pageA.getByText(/Rank these strategies/i);
await expect(rankingInstructionsA).toBeVisible({ timeout: 10000 });
await pageA.screenshot({ path: 'test-results/stage-4-02-ranking-user-a.png' });

// Verify overlap reveal
const overlapTitleA = pageA.getByText(/You both chose/i);
await expect(overlapTitleA).toBeVisible({ timeout: 10000 });
await pageA.screenshot({ path: 'test-results/stage-4-03-overlap-user-a.png' });

// Verify agreement phase
const agreementTitleA = pageA.getByText(/Your Micro-Experiment/i);
await expect(agreementTitleA).toBeVisible({ timeout: 10000 });
await pageA.screenshot({ path: 'test-results/stage-4-04-agreement-user-a.png' });
```

### Anti-Patterns to Avoid
- **DON'T rely on testIDs for critical UI interactions** - Phase 10 proved testIDs aren't accessible in RN Web
- **DON'T test Stage 4 without completing Stage 3 first** - Stage 4 is sequential and requires common ground from Stage 3
- **DON'T use UI button clicks for phase advancement** - Use API calls; UI clicks in RN Web are unreliable in Playwright
- **DON'T expect immediate phase transitions** - Some phase changes require backend processing (polling may be needed)
- **DON'T test with single-browser** - Ranking and agreement require both user perspectives to verify overlap logic

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session setup at Stage 4 | Manual DB inserts | SessionBuilder.startingAt('NEED_MAPPING_COMPLETE') | Handles user creation, relationship, session, invitation, Stage 0-3 progression atomically |
| Two-user browser contexts | Custom context creation | createUserContext helper (test-utils) | Handles iPhone 12 emulation, E2E headers, window positioning consistently |
| Strategy ranking logic | Manual overlap detection | Backend service in stage4.ts | Already implements rank comparison, overlap calculation, handles edge cases |
| Agreement creation flow | Manual agreement records | POST /agreements and POST /agreements/:id/confirm | Handles validation, status tracking, notification of partner |
| Phase transition detection | Fixed waits | Poll phase endpoint or check UI text | Phase changes are async (some require AI calls), polling is more reliable |

**Key insight:** Stage 4 backend and mobile implementations are complete and working (evidenced by `StrategicRepairScreen.tsx` with all five phases implemented). The gap is E2E test coverage with visual verification. Phase 10 established that React Native Web testIDs don't work in Playwright - the proven pattern is API-driven actions + text-based verification + screenshots for documentation.

## Common Pitfalls

### Pitfall 1: Strategy Pool Not Populating
**What goes wrong:** Strategies endpoint returns empty array even though session is in Stage 4.
**Why it happens:** Stage 4 doesn't automatically generate strategies on entry. The frontend triggers generation via `useRequestStrategySuggestions()` or the backend generates when the first `GET /strategies` call happens IF common ground exists from Stage 3.
**How to avoid:** After navigating to Stage 4, call GET /strategies endpoint or POST /strategies/suggest to trigger AI generation. Use fixture's `generate-strategies` operation for deterministic responses.
**Warning signs:** Strategy pool shows "No strategies yet" message, strategies array length is 0.

**Source:** backend/src/controllers/stage4.ts lines 95-155 (getStrategies doesn't auto-generate, just returns existing)

### Pitfall 2: Ranking Phase Not Unlocking
**What goes wrong:** Both users try to rank but phase stays in COLLECTING. Ranking interface doesn't appear.
**Why it happens:** Both users must call `POST /strategies/ready` before the phase transitions to RANKING. Single user marking ready is not enough.
**How to avoid:** Test must explicitly call ready endpoint for BOTH users before expecting ranking phase. Check `canStartRanking: true` in response.
**Warning signs:** Phase stuck at COLLECTING, `markReady` response shows `partnerReady: false`, ranking UI doesn't render.

**Source:** docs/mvp-planning/plans/backend/api/stage-4.md lines 190-215 (MarkReadyResponse shows both users must be ready)

### Pitfall 3: Overlap Reveal Requires Both Rankings
**What goes wrong:** Overlap endpoint called after User A ranks but returns empty or error.
**Why it happens:** Overlap calculation only runs after BOTH users submit rankings via `POST /strategies/rank`. Calling overlap endpoint prematurely returns waiting state.
**How to avoid:** Test must submit rankings for both users, then poll or wait before calling overlap endpoint. Check `awaitingReveal: false` in ranking response.
**Warning signs:** Overlap endpoint returns `phase: 'RANKING'` instead of `'REVEALING'`, overlap array is empty when it shouldn't be.

**Source:** backend/src/controllers/stage4.ts (ranking submission logic), docs/mvp-planning/plans/backend/api/stage-4.md lines 252-277

### Pitfall 4: Agreement Confirmation Requires Both Users
**What goes wrong:** User A confirms agreement but session doesn't resolve. Agreement stuck in PROPOSED status.
**Why it happens:** Agreement needs both users to confirm. User A creates agreement (PROPOSED), User B must call confirm endpoint with `confirmed: true`. Only then can session be resolved.
**How to avoid:** Test must call confirm endpoint for BOTH users (or at least partner must confirm if creator doesn't need to). Check `sessionCanResolve: true` in confirm response before calling resolve endpoint.
**Warning signs:** Agreement shows `agreedByPartner: false`, session status not RESOLVED, resolve endpoint returns error about pending agreements.

**Source:** docs/mvp-planning/plans/backend/api/stage-4.md lines 332-356 (ConfirmAgreementResponse includes sessionCanResolve flag)

### Pitfall 5: React Native Web TestIDs Not Accessible
**What goes wrong:** Test tries to click strategy card or ranking button via testID selector, fails with "element not found" despite element being visible in screenshots.
**Why it happens:** React Native Web renders testIDs in a format that Playwright can't reliably select. This was extensively documented in Phase 10.
**How to avoid:** Use text-based selectors for verification (`getByText`) and API calls for actions. Avoid relying on testIDs like `strategy-card-{id}` or `ranking-submit-button`.
**Warning signs:** `getByTestId()` selector fails, screenshots show element is rendered, falling back to text selector works.

**Source:** .planning/phases/10-stage-3-needs-verification/10-02-SUMMARY.md lines 127-143 (React Native Web testID selectors not accessible)

### Pitfall 6: Phase Confusion from Parallel State
**What goes wrong:** User A sees RANKING phase but User B sees COLLECTING phase. Test expects synchronized phase but they differ.
**Why it happens:** StrategyPhase is tracked per-session but UI displays based on cached query data. If one user's cache isn't invalidated, they see stale phase.
**How to avoid:** Reload pages or poll strategy endpoint after phase-changing actions (markReady, submitRanking). Phase transitions happen server-side; frontend must refetch.
**Warning signs:** User A's page shows ranking UI but User B's shows collection UI, phase values differ between users in API responses.

**Source:** Mobile pattern (cache-first architecture), Phase changes require invalidation or polling

## Code Examples

Verified patterns from official sources:

### SessionBuilder with NEED_MAPPING_COMPLETE Starting Point
```typescript
// Source: e2e/helpers/session-builder.ts lines 14-22 (TargetStage type)
// Pattern adapted from e2e/tests/two-browser-stage-3.spec.ts

const setup = await new SessionBuilder(API_BASE_URL)
  .userA(userA.email, userA.name)
  .userB(userB.email, userB.name)
  .startingAt('NEED_MAPPING_COMPLETE')
  .withFixture('stage-4-strategies')
  .setup(request);

sessionId = setup.session.id;
userAId = setup.userA.id;
userBId = setup.userB!.id;

// At this point:
// - Both users have completed Stage 0 (compact signed)
// - Both users have completed Stage 1 (feel heard)
// - Both users have completed Stage 2 (empathy shared and validated)
// - Both users have completed Stage 3 (needs confirmed, common ground discovered)
// - Both users are in Stage 4 IN_PROGRESS
```

### Get Strategy Pool
```typescript
// Source: backend/src/controllers/stage4.ts lines 95-155

// GET /sessions/:id/strategies
const strategiesResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`);
const strategiesData = await strategiesResponse.json();

console.log(`Strategies count: ${strategiesData.data?.strategies?.length}`);
console.log(`Phase: ${strategiesData.data?.phase}`);

// Response format:
// {
//   success: true,
//   data: {
//     strategies: [
//       {
//         id: 'strat_123',
//         description: 'Have a phone-free dinner...',
//         needsAddressed: ['Connection'],
//         duration: '5 days',
//         measureOfSuccess: 'Did we do it?'
//       }
//     ],
//     phase: 'COLLECTING'
//   }
// }
```

### Propose User Strategy
```typescript
// Source: backend/src/controllers/stage4.ts lines 157-249

// POST /sessions/:id/strategies
const proposeResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
  description: 'Check in with each other before making weekend plans',
  needsAddressed: ['Connection', 'Autonomy'],
  duration: '2 weeks',
  measureOfSuccess: 'Did we both feel heard about our weekend preferences?'
});

const proposeData = await proposeResponse.json();
console.log(`Strategy created: ${proposeData.data?.strategy?.id}`);
console.log(`Total strategies: ${proposeData.data?.totalStrategies}`);
```

### Mark Ready and Submit Rankings
```typescript
// Source: backend/src/controllers/stage4.ts, docs/mvp-planning/plans/backend/api/stage-4.md lines 190-250

// POST /sessions/:id/strategies/ready
const readyResponseA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
const readyDataA = await readyResponseA.json();

console.log(`User A ready: ${readyDataA.data?.ready}`);
console.log(`User B ready: ${readyDataA.data?.partnerReady}`);
console.log(`Can start ranking: ${readyDataA.data?.canStartRanking}`);

// Wait for both users to be ready
const readyResponseB = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);

// POST /sessions/:id/strategies/rank
const rankResponseA = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
  rankedIds: ['strat_1', 'strat_2', 'strat_3'] // Ordered from most to least preferred
});

const rankDataA = await rankResponseA.json();
console.log(`Ranking submitted: ${rankDataA.data?.submitted}`);
console.log(`Partner submitted: ${rankDataA.data?.partnerSubmitted}`);
console.log(`Awaiting reveal: ${rankDataA.data?.awaitingReveal}`);
```

### Get Overlap and Create Agreement
```typescript
// Source: backend/src/controllers/stage4.ts, docs/mvp-planning/plans/backend/api/stage-4.md lines 252-356

// GET /sessions/:id/strategies/overlap (after both users rank)
const overlapResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/overlap`);
const overlapData = await overlapResponse.json();

console.log(`Overlap strategies: ${overlapData.data?.overlap?.length}`);
console.log(`Phase: ${overlapData.data?.phase}`); // Should be REVEALING

// POST /sessions/:id/agreements
const agreementResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/agreements`, {
  strategyId: overlapData.data.overlap[0].id,
  description: overlapData.data.overlap[0].description,
  type: 'MICRO_EXPERIMENT',
  duration: '5 days',
  measureOfSuccess: 'Did we do it? How did it feel?',
  followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
});

const agreementData = await agreementResponse.json();
console.log(`Agreement created: ${agreementData.data?.agreement?.id}`);
console.log(`Awaiting partner confirmation: ${agreementData.data?.awaitingPartnerConfirmation}`);

// POST /sessions/:id/agreements/:agreementId/confirm
const confirmResponse = await apiB.post(
  `${API_BASE_URL}/api/sessions/${sessionId}/agreements/${agreementData.data.agreement.id}/confirm`,
  { confirmed: true }
);

const confirmData = await confirmResponse.json();
console.log(`Agreement confirmed by both: ${confirmData.data?.agreement?.agreedByMe && confirmData.data?.agreement?.agreedByPartner}`);
console.log(`Session can resolve: ${confirmData.data?.sessionCanResolve}`);

// POST /sessions/:id/resolve
if (confirmData.data?.sessionCanResolve) {
  const resolveResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/resolve`);
  const resolveData = await resolveResponse.json();
  console.log(`Session resolved: ${resolveData.data?.resolved}`);
}
```

### Verify UI State with Text Selectors
```typescript
// Source: Pattern from e2e/tests/two-browser-stage-3.spec.ts lines 214-352

// After API call to advance phase, reload to see updated UI
await Promise.all([pageA.reload(), pageB.reload()]);
await Promise.all([
  pageA.waitForLoadState('networkidle'),
  pageB.waitForLoadState('networkidle')
]);

// Verify strategy pool phase text
const poolTitleA = pageA.getByText(/Here is what we have come up with/i);
await expect(poolTitleA).toBeVisible({ timeout: 10000 });

// Verify ranking phase text
const rankingInstructionsA = pageA.getByText(/Rank these strategies/i);
await expect(rankingInstructionsA).toBeVisible({ timeout: 10000 });

// Verify overlap reveal text
const overlapHeaderA = pageA.getByText(/You both chose/i);
await expect(overlapHeaderA).toBeVisible({ timeout: 10000 });

// Verify agreement text
const agreementHeaderA = pageA.getByText(/Your Micro-Experiment/i);
await expect(agreementHeaderA).toBeVisible({ timeout: 10000 });

// Screenshot at each phase
await pageA.screenshot({ path: `test-results/stage-4-${phaseName}-user-a.png` });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API-only Stage 4 tests | UI-driven E2E tests with screenshots | Phase 11 (current) | Visual verification of user experience, catches UI bugs |
| UI button clicks for actions | API calls for actions, text selectors for verification | Phase 10 pattern | More reliable tests in React Native Web environment |
| Single-browser Stage 4 tests | Two-browser simultaneous view | Phase 11 (current) | Verifies both users see correct state, catches sync issues |
| Manual session setup | SessionBuilder.startingAt('NEED_MAPPING_COMPLETE') | Phase 8+ | Faster test setup, consistent stage progression state |

**Deprecated/outdated:**
- Testing Stage 4 without completing Stage 3 first (Stage 4 requires common ground context)
- Using testIDs for RN Web components in Playwright (Phase 10 proved these don't work)
- Expecting phase transitions without polling (backend may process async)

**Source:** Mobile implementation in mobile/src/screens/StrategicRepairScreen.tsx (complete UI), backend/src/controllers/stage4.ts (complete API)

## Open Questions

1. **Do strategy suggestions automatically generate on Stage 4 entry?**
   - What we know: StrategicRepairScreen has UserStrategyInput for manual proposals, useRequestStrategySuggestions hook exists for requesting AI ideas, backend doesn't auto-generate on GET /strategies
   - What's unclear: Whether frontend automatically requests AI suggestions on first Stage 4 load, or if user must explicitly click "Generate more ideas"
   - Recommendation: Test should explicitly call request-suggestions API or verify empty state UX if no auto-generation

2. **What testIDs exist for Stage 4 components?**
   - What we know: Phase 10 proved testIDs don't work in RN Web. StrategyCard has one testID (`overlap-badge`) but not for the card itself. No testIDs found in StrategyPool, StrategyRanking, OverlapReveal, AgreementCard grep.
   - What's unclear: Whether adding testIDs would help or if RN Web limitation makes them useless
   - Recommendation: Don't rely on testIDs. Use text-based selectors (component titles, button text) and API verification.

3. **How does no-overlap scenario work?**
   - What we know: StrategicRepairScreen has NoOverlapActions component showing "Generate more ideas" and "Create hybrid" options. Docs mention negotiating phase when overlap is empty.
   - What's unclear: Full UX flow when rankings don't overlap - does test need to verify this edge case?
   - Recommendation: Happy path test (with overlap) first, separate test for no-overlap edge case if time permits.

4. **What is the fixture operation name for strategy generation?**
   - What we know: Stage 3 used `extract-needs` and `common-ground` operations in fixture. Backend likely calls AI service with an operation identifier for strategy generation.
   - What's unclear: Exact operation name to use in fixture - need to check backend code for getCompletion call in strategy service
   - Recommendation: Inspect backend code or use generic AI responses that match any strategy generation call

## Sources

### Primary (HIGH confidence)
- backend/src/controllers/stage4.ts - Stage 4 API endpoints (controller implementation)
- mobile/src/screens/StrategicRepairScreen.tsx - Complete Stage 4 UI with all phases (999 lines)
- mobile/src/components/StrategyPool.tsx - Strategy pool display component (80 lines inspected)
- mobile/src/components/StrategyRanking.tsx - Ranking interface component
- mobile/src/components/OverlapReveal.tsx - Overlap display component
- mobile/src/components/AgreementCard.tsx - Agreement confirmation component
- shared/src/dto/strategy.ts - Strategy and agreement DTOs (148 lines)
- docs/mvp-planning/plans/backend/api/stage-4.md - Complete Stage 4 API specification (451 lines)
- e2e/tests/two-browser-stage-3.spec.ts - Working two-browser test pattern from Phase 10 (401 lines)
- .planning/phases/10-stage-3-needs-verification/10-RESEARCH.md - Phase 10 research with E2E patterns
- .planning/phases/10-stage-3-needs-verification/10-02-SUMMARY.md - React Native Web testID limitations documented

### Secondary (MEDIUM confidence)
- e2e/helpers/session-builder.ts - SessionBuilder with NEED_MAPPING_COMPLETE support (150 lines inspected)
- backend/src/fixtures/stage-3-needs.ts - Example fixture structure (100 lines inspected)
- mobile/src/hooks/useStages.ts - React Query hooks for strategies (useStrategies, useProposeStrategy, useMarkReadyToRank, useSubmitRankings, useStrategiesReveal, useAgreements, useConfirmAgreement, useResolveSession)

### Tertiary (LOW confidence)
- None - all claims verified against implementation or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools in active use, verified in e2e/ and backend/src/, Phase 10 established patterns
- Architecture: HIGH - patterns extracted from working Phase 10 tests and complete Stage 4 implementation
- Pitfalls: MEDIUM-HIGH - sourced from backend implementation analysis and Phase 10 lessons, not all Stage 4-specific pitfalls observed in practice yet

**Research date:** 2026-02-17
**Valid until:** 60 days for stable (Stage 4 API unlikely to change), 30 days for E2E patterns (may evolve with Phase 12-13 completion)
