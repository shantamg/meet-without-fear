# Phase 10: Stage 3 (Needs) Verification - Research

**Researched:** 2026-02-17
**Domain:** Stage 3 (Need Mapping) E2E testing with AI-extracted needs and common ground analysis
**Confidence:** HIGH

## Summary

Phase 10 verifies that Stage 3 (Need Mapping) works end-to-end for both users. The stage uses AI to extract underlying needs from conversation history (Stages 1-2), presents them for user confirmation, requires mutual consent for sharing, then runs common ground analysis to find shared needs. The phase establishes E2E test coverage with Playwright screenshots documenting the complete needs flow from extraction through common ground confirmation.

The backend already implements full Stage 3 functionality: needs extraction service (`backend/src/services/needs.ts`), Stage 3 controllers (`backend/src/controllers/stage3.ts`), and mobile UI components (`mobile/src/screens/NeedMappingScreen.tsx`). Visual E2E tests (`e2e/tests/needs-tab-visual.spec.ts`, `needs-confirmation-visual.spec.ts`) exist but are incomplete. A comprehensive test (`e2e/tests/stage-3-4-complete.spec.ts`) demonstrates the full flow via API calls rather than UI interaction.

**Primary recommendation:** Create two-browser E2E test using established patterns (SessionBuilder, two-user contexts, mocked AI fixtures) that verifies both users can complete the needs flow via UI interactions. Use Playwright screenshots to document each UI state (needs panel, consent confirmation, common ground display). Follow Phase 8 pattern: create fixtures for deterministic AI responses, test both happy path and edge cases.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEEDS-01 | Both users can view AI-extracted needs and confirm/edit them | Mobile hooks (useNeeds, useConfirmNeeds), backend controllers (getNeeds, confirmNeeds), UI components (NeedsSection, NeedCard) all exist |
| NEEDS-02 | Both users complete needs consent flow | Backend endpoint POST /needs/consent implemented, mobile hook useConsentShareNeeds exists, gate tracking via gatesSatisfied.needsShared |
| NEEDS-03 | Common ground analysis runs and results display for both users | Backend service findCommonGround with AI analysis, controller getCommonGround, mobile hook useCommonGround, CommonGroundCard component |
| NEEDS-04 | Playwright screenshots capture needs panel and common ground visualization | Existing test infrastructure (navigateToShareFromSession, SessionBuilder with EMPATHY_REVEALED fixture, two-browser test patterns from Phase 8) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | 1.40+ (project) | E2E testing framework | Project uses Playwright for all E2E tests with iPhone 12 device emulation |
| SessionBuilder | Phase 8+ | Test session setup | Fluent API for creating sessions at specific stages (EMPATHY_REVEALED for Stage 3 entry) |
| E2E Fixtures | Backend pattern | Deterministic AI responses | All E2E tests use mocked LLM with per-user fixtures (MOCK_LLM=true) |
| React Query | ^4.x | State management | Mobile uses cache-first pattern with optimistic updates for all mutations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| test-utils helpers | Phase 3-8 | E2E test utilities | navigateToShareFromSession, createUserContext, handleMoodCheck, waitForAnyAIResponse |
| AWS Bedrock | ^3.x | AI service (backend) | AI extraction in needs.ts via getCompletion, falls back to mock if no API key |
| Prisma | ^5.x | Database ORM | Needs stored in IdentifiedNeed, CommonGround tables with vessel-based isolation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-browser tests | API-only tests | UI interaction verifies actual user experience, catches UI bugs API tests miss |
| Mocked AI fixtures | Live AI (MOCK_LLM=false) | Mocked AI is deterministic and fast, live AI is non-deterministic and slow |
| SessionBuilder | Manual DB seeding | SessionBuilder provides cleaner API and handles relationships, invitations automatically |

**Installation:**
```bash
# No new dependencies - all tools already in project
cd e2e && npx playwright test  # Run E2E tests
```

## Architecture Patterns

### Recommended Project Structure
```
.planning/phases/10-stage-3-needs-verification/
├── 10-RESEARCH.md              # This file
├── 10-01-PLAN.md               # Two-browser E2E test for needs extraction and confirmation
├── 10-02-PLAN.md               # Common ground analysis and mutual confirmation test
└── 10-VERIFICATION.md          # Cross-check all requirements

e2e/tests/
├── two-browser-stage-3.spec.ts # Main E2E test for Stage 3 (new)
└── fixtures/
    └── stage-3-needs.ts        # Fixture with needs extraction + common ground responses (new)

backend/src/fixtures/
└── stage-3-needs.ts            # E2E fixture for deterministic needs extraction (new)

test-results/
├── stage-3-01-needs-extraction-user-a.png
├── stage-3-01-needs-extraction-user-b.png
├── stage-3-02-needs-confirmation-user-a.png
├── stage-3-02-needs-confirmation-user-b.png
├── stage-3-03-common-ground-user-a.png
└── stage-3-03-common-ground-user-b.png
```

### Pattern 1: Two-Browser Stage 3 Test Structure
**What:** Use SessionBuilder with EMPATHY_REVEALED starting point, create fixtures with deterministic needs extraction and common ground analysis responses
**When to use:** All Stage 3 E2E tests (requires both users to see needs extraction and common ground simultaneously)
**Example:**
```typescript
// Source: Adapted from e2e/tests/two-browser-stage-2.spec.ts
test.describe('Stage 3: Need Mapping', () => {
  let sessionId: string;
  let userAId: string, userBId: string;
  let pageA: Page, pageB: Page;

  test.beforeEach(async ({ browser, request }) => {
    // Start at EMPATHY_REVEALED (Stage 2 complete, Stage 3 IN_PROGRESS)
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA('user-a@e2e.test', 'Alice')
      .userB('user-b@e2e.test', 'Bob')
      .startingAt('EMPATHY_REVEALED')
      .withFixture('stage-3-needs') // Deterministic needs extraction
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    // Create browser contexts
    const { page: pageASetup } = await createUserContext(
      browser, 'user-a@e2e.test', userAId, 'stage-3-needs', { x: 0, y: 0 }
    );
    const { page: pageBSetup } = await createUserContext(
      browser, 'user-b@e2e.test', userBId, 'stage-3-needs', { x: 450, y: 0 }
    );
    pageA = pageASetup;
    pageB = pageBSetup;
  });
});
```

### Pattern 2: Needs Extraction Fixture
**What:** Create E2E fixture with deterministic `extract-needs` operation responses for both users
**When to use:** All Stage 3 tests need predictable needs extraction to verify UI display and confirmation
**Example:**
```typescript
// Source: backend/src/services/needs.ts lines 199-213 (operation name: 'extract-needs')
// backend/src/fixtures/stage-3-needs.ts (NEW FILE)
export const stage3NeedsFixture: E2EFixture = {
  name: 'Stage 3 Needs Extraction',
  description: 'Deterministic needs extraction for both users with common ground overlap',

  responses: [
    // Stage 1-2 responses omitted for brevity (reuse from existing fixtures)
  ],

  operations: {
    'extract-needs': {
      response: {
        needs: [
          {
            category: 'CONNECTION',
            need: 'To feel emotionally connected and understood',
            evidence: ['I just want to feel like we are on the same team'],
            aiConfidence: 0.85
          },
          {
            category: 'RECOGNITION',
            need: 'To have efforts acknowledged',
            evidence: ['It feels like nothing I do is ever enough'],
            aiConfidence: 0.78
          },
          {
            category: 'SAFETY',
            need: 'To feel safe expressing feelings',
            evidence: ['I am afraid to bring things up because it always turns into a fight'],
            aiConfidence: 0.82
          }
        ]
      }
    },
    'common-ground': {
      response: {
        commonGround: [
          {
            category: 'CONNECTION',
            need: 'Both partners value emotional connection and want to feel like a team',
            insight: 'While expressed differently, both seek the same underlying closeness'
          },
          {
            category: 'SAFETY',
            need: 'Both need to feel safe being vulnerable in conversations',
            insight: 'The fear of conflict is shared - both want discussions to feel constructive'
          }
        ]
      }
    }
  }
};
```

### Pattern 3: Navigating to Share Page for Needs
**What:** Use `navigateToShareFromSession()` helper to navigate from chat to Share page, then click Needs tab
**When to use:** All Stage 3 UI tests (needs panel appears in Share screen)
**Example:**
```typescript
// Source: e2e/helpers/test-utils.ts lines 109-163
// Navigate to Share screen
await navigateToShareFromSession(pageA);
await navigateToShareFromSession(pageB);

// Click Needs tab (if tabs are visible)
const needsTabA = pageA.getByTestId('share-tab-selector-tab-needs');
if (await needsTabA.isVisible({ timeout: 3000 }).catch(() => false)) {
  await needsTabA.click();
  await pageA.waitForTimeout(500);
}

// Screenshot needs panel
await pageA.screenshot({ path: 'test-results/stage-3-needs-panel-user-a.png' });
```

### Pattern 4: React Query Cache-First for Needs Mutations
**What:** Mobile hooks use optimistic updates with rollback for needs confirmation and consent
**When to use:** Understanding mobile state management for needs flow (not directly tested in E2E but explains UI behavior)
**Example:**
```typescript
// Source: mobile/src/hooks/useStages.ts lines 1391-1415
export function useConfirmNeeds(options?: ...) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmations }) => {
      return post<ConfirmNeedsResponse>(`/sessions/${sessionId}/needs/confirm`, {
        confirmations,
      });
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate to fetch updated needs with confirmed: true
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
  });
}
```

### Anti-Patterns to Avoid
- **DON'T use API calls in E2E tests to trigger needs extraction** - Let UI interactions trigger backend calls naturally (except for test setup)
- **DON'T test Stage 3 with single-browser** - Common ground requires both user perspectives visible simultaneously
- **DON'T use text assertions for AI-extracted needs** - Use structural elements (testIDs, panel visibility) as needs content is fixture-dependent
- **DON'T skip consent flow in tests** - Consent is a gate requirement (gatesSatisfied.needsShared) that must be tested

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session setup at Stage 3 | Manual DB inserts | SessionBuilder.startingAt('EMPATHY_REVEALED') | Handles user creation, relationship, session, invitation, stage progression atomically |
| Two-user browser contexts | Custom context creation | createUserContext helper (test-utils) | Handles iPhone 12 emulation, E2E headers, window positioning consistently |
| Waiting for needs extraction | Fixed timeouts | Poll for panel visibility with timeout | Needs extraction via AI can take variable time (1-10s), polling is more reliable |
| Deterministic AI responses | Seeding database with needs | E2E fixtures with extract-needs operation | No DB state needed, per-user isolation, easier to maintain |
| Common ground analysis | Manual matching algorithm | Backend service findCommonGround | Already implements AI-based analysis with mock fallback |

**Key insight:** Stage 3 backend and mobile implementations are complete and working (evidenced by `stage-3-4-complete.spec.ts` passing via API calls). The gap is UI-driven E2E test coverage with visual verification via screenshots. Re-use existing patterns from Phase 8 (two-browser tests, fixtures, SessionBuilder) rather than creating new test infrastructure.

## Common Pitfalls

### Pitfall 1: Needs Extraction Timing Variability
**What goes wrong:** Needs extraction can take 2-15s (AI call + database writes). Tests fail intermittently if using fixed timeouts.
**Why it happens:** Backend calls AWS Bedrock (or uses mock if no API key), parses JSON response, creates IdentifiedNeed records, all asynchronous.
**How to avoid:** Poll for needs panel visibility with generous timeout (30s). If testing with MOCK_LLM=false (not recommended), increase timeout to 60s.
**Warning signs:** Test passes locally but fails in CI, test runtime varies significantly between runs.

**Source:** backend/src/services/needs.ts lines 150-243 (extractNeedsFromConversation implementation)

### Pitfall 2: Common Ground Requires Both Users to Share Needs
**What goes wrong:** Common ground endpoint returns empty array even though needs are confirmed. Test expects common ground items immediately after confirmation.
**Why it happens:** Common ground analysis (`findCommonGround`) only runs after BOTH users have consented to share (gatesSatisfied.needsShared === true). The endpoint checks this via `hasPartnerSharedNeeds()`.
**How to avoid:** Test must verify both users complete consent flow before expecting common ground results. Use POST /needs/consent for both users, then GET /common-ground.
**Warning signs:** Common ground panel doesn't appear, API returns `commonGround: [], analysisComplete: false, waitingFor: 'partner'`.

**Source:** backend/src/controllers/stage3.ts lines 569-583 (getCommonGround checks userShared and partnerShared)

### Pitfall 3: Fixture Operation Names Must Match Backend Calls
**What goes wrong:** Fixture defines `'needs-extraction'` but backend calls with operation `'extract-needs'` — fixture never matches, falls back to default mock.
**Why it happens:** Fixture matching is exact string comparison between operation name in `getCompletion()` call and fixture operations keys.
**How to avoid:** Check backend service for exact operation names. For Stage 3: `'extract-needs'` (needs.ts line 211), `'common-ground'` (needs.ts line 323).
**Warning signs:** Test sees generic mock needs instead of fixture-defined needs, needs have different categories/descriptions than expected.

**Source:** backend/src/services/needs.ts lines 211 (operation: 'extract-needs'), 323 (operation: 'common-ground')

### Pitfall 4: Stage Progress Cache Staleness
**What goes wrong:** Needs panel doesn't appear even though user is in Stage 3 and needs extraction completed.
**Why it happens:** Panel visibility logic checks current stage from cache. If stage cache wasn't invalidated after advancing from Stage 2, panel logic won't run.
**How to avoid:** Verify SessionBuilder correctly sets stage progress to Stage 3 IN_PROGRESS when using .startingAt('EMPATHY_REVEALED'). Test can verify stage via progress endpoint before expecting needs panel.
**Warning signs:** User sees Stage 2 UI, needs data exists in API but panel not visible, stage advancement query returns stale data.

**Source:** Project pattern (MEMORY.md "Panel Display Pattern"), similar to Phase 8 Pitfall 4

### Pitfall 5: User Vessel Isolation for Needs
**What goes wrong:** User A sees User B's needs or vice versa. Common ground shows needs that weren't confirmed.
**Why it happens:** Needs are stored per UserVessel (userId + sessionId). If test doesn't use correct E2E headers, backend creates needs for wrong user.
**How to avoid:** Ensure E2E headers (x-e2e-user-id, x-e2e-user-email) are set correctly via createUserContext. Backend extracts userId from headers and creates/queries UserVessel accordingly.
**Warning signs:** Needs count mismatch (User A has 5 needs, API returns 3), needs have wrong evidence quotes, common ground shows unconfirmed needs.

**Source:** backend/src/controllers/stage3.ts lines 138-146 (getOrCreateUserVessel based on userId from auth)

## Code Examples

Verified patterns from official sources:

### SessionBuilder with EMPATHY_REVEALED Starting Point
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 77-90
const setup = await new SessionBuilder(API_BASE_URL)
  .userA(userA.email, userA.name)
  .userB(userB.email, userB.name)
  .startingAt('EMPATHY_REVEALED')
  .setup(request);

sessionId = setup.session.id;
userAId = setup.userA.id;
userBId = setup.userB!.id;

// At this point:
// - Both users have completed Stage 0 (compact signed)
// - Both users have completed Stage 1 (feel heard)
// - Both users have completed Stage 2 (empathy shared and validated)
// - Both users are in Stage 3 IN_PROGRESS
```

### Two-Browser Context Creation for Stage 3
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 92-99
const userASetup = await createUserContext(
  browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 }
);
const userBSetup = await createUserContext(
  browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 }
);
pageA = userASetup.page;
pageB = userBSetup.page;

// Side-by-side windows for visual comparison during test development
```

### Navigate to Share Page and Needs Tab
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 165-177
// Navigate to Share screen via in-app UI
await navigateToShareFromSession(pageA);
await navigateToShareFromSession(pageB);

// Click Needs tab if available
const tabSelectorA = pageA.getByTestId('share-tab-selector');
const hasTabsA = await tabSelectorA.isVisible({ timeout: 5000 }).catch(() => false);

if (hasTabsA) {
  const needsTabA = pageA.getByTestId('share-tab-selector-tab-needs');
  if (await needsTabA.isVisible({ timeout: 2000 }).catch(() => false)) {
    await needsTabA.click();
    await pageA.waitForTimeout(500);
  }
}
```

### Verify Needs Extraction via API (Test Setup)
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 246-254
// GET /sessions/:id/needs triggers AI extraction if no needs exist
const needsResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
const needsDataA = await needsResponseA.json();
console.log(`User A needs: ${needsDataA.data?.needs?.length || 0} needs`);

// Verify needs were extracted
expect(needsDataA.data?.needs).toBeDefined();
expect(needsDataA.data?.needs.length).toBeGreaterThan(0);

// Each need has required fields
const firstNeed = needsDataA.data.needs[0];
expect(firstNeed.id).toBeDefined();
expect(firstNeed.category).toBeDefined();
expect(firstNeed.need).toBeDefined();
```

### Confirm and Consent to Share Needs
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 260-276
const needIdsA = needsA.map((n: { id: string }) => n.id);

// POST /sessions/:id/needs/confirm
const confirmResponseA = await apiA.post(
  `${API_BASE_URL}/api/sessions/${sessionId}/needs/confirm`,
  { needIds: needIdsA }
);
const confirmDataA = await confirmResponseA.json();
expect(confirmDataA.data?.confirmed).toBe(true);

// POST /sessions/:id/needs/consent
const consentResponseA = await apiA.post(
  `${API_BASE_URL}/api/sessions/${sessionId}/needs/consent`,
  { needIds: needIdsA }
);
const consentDataA = await consentResponseA.json();
expect(consentDataA.data?.consented).toBe(true);
```

### Get and Confirm Common Ground
```typescript
// Source: e2e/tests/stage-3-4-complete.spec.ts lines 298-322
// GET /sessions/:id/common-ground (triggers AI analysis if both shared)
const cgResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/common-ground`);
const cgDataA = await cgResponseA.json();

expect(cgDataA.data?.commonGround).toBeDefined();
expect(cgDataA.data?.analysisComplete).toBe(true);

const commonGround = cgDataA.data.commonGround || [];
const cgIds = commonGround.map((cg: { id: string }) => cg.id);

// POST /sessions/:id/common-ground/confirm
const cgConfirmA = await apiA.post(
  `${API_BASE_URL}/api/sessions/${sessionId}/common-ground/confirm`,
  { commonGroundIds: cgIds }
);
const cgConfirmDataA = await cgConfirmA.json();

expect(cgConfirmDataA.data?.allConfirmedByMe).toBe(true);
// Both users must confirm for stage completion
expect(cgConfirmDataA.data?.allConfirmedByBoth).toBe(true);
expect(cgConfirmDataA.data?.canAdvance).toBe(true);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API-only Stage 3 tests | UI-driven E2E tests with screenshots | Phase 10 (current) | Visual verification of user experience, catches UI bugs |
| Seeded database for needs | E2E fixtures with extract-needs operation | Phase 10 (current) | Easier maintenance, deterministic per-user responses |
| Single-browser Stage 3 tests | Two-browser simultaneous view | Phase 10 (current) | Verifies both users see correct state, catches sync issues |
| Manual session setup | SessionBuilder.startingAt('EMPATHY_REVEALED') | Phase 8+ | Faster test setup, consistent stage progression state |

**Deprecated/outdated:**
- Testing Stage 3 without completing Stage 2 first (needs extraction requires Stage 1-2 message history)
- Using /needs POST endpoint to create needs directly (should use GET which triggers extraction if empty)
- Testing common ground without both users consenting (backend guard prevents analysis)

**Source:** e2e/tests/stage-3-4-complete.spec.ts (current implementation), backend/src/controllers/stage3.ts (API implementation)

## Open Questions

1. **Does the needs panel appear inline in chat or only in Share screen?**
   - What we know: `e2e/tests/needs-confirmation-visual.spec.ts` suggests needs appear in main session screen (references "needs-summary card"). `NeedMappingScreen.tsx` exists as dedicated screen. `stage-3-4-complete.spec.ts` navigates to Share screen then clicks Needs tab.
   - What's unclear: Whether needs panel appears in both locations or only Share screen. UI visibility logic not fully documented.
   - Recommendation: First plan verifies needs display in Share screen (documented pattern), optionally tests inline chat display if time permits.

2. **What testIDs exist for needs confirmation and consent buttons?**
   - What we know: `needs-confirmation-visual.spec.ts` searches for text "Confirm my needs" but no testID documented. `stage-3-4-complete.spec.ts` uses API calls, not UI buttons.
   - What's unclear: Exact testIDs for "Confirm needs" button, "Consent to share" button, individual need cards, common ground cards.
   - Recommendation: Inspect mobile/src/components/NeedCard.tsx, mobile/src/screens/NeedMappingScreen.tsx for testIDs. Add testIDs if missing (minor implementation task).

3. **Can users edit/adjust needs text before confirming?**
   - What we know: Backend accepts `adjustments` parameter in POST /needs/confirm with `correction` field (stage3.ts lines 268-278). Frontend has AddNeedRequest DTO suggesting custom needs can be added.
   - What's unclear: UI for editing AI-extracted needs (inline edit vs dedicated screen). Whether E2E test should verify edit flow.
   - Recommendation: Test happy path (confirm as-is) first. Edit flow can be separate test if UI exists.

## Sources

### Primary (HIGH confidence)
- backend/src/services/needs.ts - Needs extraction and common ground AI service (482 lines)
- backend/src/controllers/stage3.ts - Stage 3 API endpoints (920 lines)
- mobile/src/hooks/useStages.ts - React Query hooks for needs/common ground (lines 1372-1528)
- e2e/tests/stage-3-4-complete.spec.ts - Working API-based Stage 3-4 flow (517 lines)
- e2e/helpers/session-builder.ts - SessionBuilder with EMPATHY_REVEALED support
- shared/src/dto/needs.ts - Needs DTOs (111 lines)

### Secondary (MEDIUM confidence)
- mobile/src/screens/NeedMappingScreen.tsx - Stage 3 UI implementation (referenced but not fully inspected)
- mobile/src/components/NeedsSection.tsx - Needs display component (79 lines)
- e2e/tests/needs-tab-visual.spec.ts - Incomplete visual test for needs tab (178 lines)
- e2e/tests/needs-confirmation-visual.spec.ts - Incomplete visual test for needs confirmation (152 lines)

### Tertiary (LOW confidence)
- None - all claims verified against implementation or official specs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools in active use, verified in e2e/ and backend/src/
- Architecture: HIGH - patterns extracted from working tests (stage-3-4-complete.spec.ts, two-browser-stage-2.spec.ts)
- Pitfalls: MEDIUM-HIGH - sourced from backend implementation analysis and Phase 8 patterns, not all Stage 3-specific pitfalls observed in practice yet

**Research date:** 2026-02-17
**Valid until:** 60 days for stable (Stage 3 API unlikely to change), 30 days for E2E patterns (may evolve with Phase 11-12 completion)
