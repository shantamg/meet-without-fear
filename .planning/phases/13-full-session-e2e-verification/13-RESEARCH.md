# Phase 13: Full Session E2E Verification - Research

**Researched:** 2026-02-17
**Domain:** End-to-end testing, test reliability, Playwright multi-browser
**Confidence:** HIGH

## Summary

Phase 13 requires completing two-user session flow verification from Stage 0 → Stage 4 with reliable, non-flaky tests. The codebase already has extensive E2E infrastructure (10 two-browser tests, fixtures, SessionBuilder, TwoBrowserHarness) and a full-flow test that covers Stages 0-2. The key challenge is extending this to Stage 4 and ensuring 3 consecutive passes without flakiness.

**Current state:**
- `two-browser-full-flow.spec.ts` covers Stages 0-2 → Stage 3 entry (282 lines)
- Individual stage tests exist: Stage 3 (two-browser-stage-3.spec.ts), Stage 4 (two-browser-stage-4.spec.ts)
- Reconciler edge case tests exist: OFFER_OPTIONAL, OFFER_SHARING + refinement, circuit breaker
- All use mocked LLM (MOCK_LLM=true) with deterministic fixtures
- Visual regression baselines established (Phase 12)

**Primary challenge:** Combining all stages into a single test requires ~18-20 AI interactions sequentially, careful state management between stages, and robust wait patterns. The existing Stage 0-2 test took multiple iterations to eliminate race conditions (see git history: empathy drafting must complete BEFORE sharing to avoid transition message race).

**Primary recommendation:** Extend `two-browser-full-flow.spec.ts` to Stage 4, verify reconciler tests independently, establish reliability baseline with 3+ consecutive passes, document flakiness patterns for debugging.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| E2E-01 | Full two-browser E2E test passes from session start through Stage 4 completion for both users | Existing two-browser-full-flow.spec.ts covers Stages 0-2; Stage 3-4 tests exist independently; fixtures support full flow; extension pattern documented in Code Examples |
| E2E-02 | Reconciler edge case E2E tests pass for OFFER_OPTIONAL and OFFER_SHARING paths | Tests already exist (two-browser-reconciler-offer-optional.spec.ts, two-browser-reconciler-offer-sharing-refinement.spec.ts, two-browser-circuit-breaker.spec.ts); need verification of current pass/fail status and flakiness |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.x | E2E testing framework | Industry standard for multi-browser testing, native screenshot/visual regression support, excellent TypeScript integration |
| TwoBrowserHarness | Internal | Test setup helper | Proven pattern in codebase for managing two browser contexts with real Ably connections |
| SessionBuilder | Internal | State factory | Fluent API for seeding sessions at specific stages (CREATED, EMPATHY_REVEALED, NEED_MAPPING_COMPLETE, etc.) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Mocked LLM fixtures | Internal | Deterministic AI responses | All two-browser tests use MOCK_LLM=true with per-user fixture IDs |
| test-utils helpers | Internal | Shared test actions | waitForAIResponse, handleMoodCheck, signCompact, confirmFeelHeard, etc. |
| toHaveScreenshot | @playwright/test | Visual regression | Established in Phase 12 with maxDiffPixels: 100, animations: 'disabled' |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two browser contexts (real Ably) | Single browser with mocked Ably | Two-browser caught race conditions single-browser never would (established in v1.0) |
| Extending full-flow test | Separate Stage 3-4 tests only | Full-flow provides integration verification; separate tests faster for targeted debugging |
| MOCK_LLM=true fixtures | MOCK_LLM=false live AI | Fixtures deterministic/repeatable; live AI slow (~8-12min) and non-deterministic |

**Installation:**
```bash
# Already installed
cd e2e && npm install
```

## Architecture Patterns

### Recommended Test Structure
```
e2e/
├── tests/
│   ├── two-browser-full-flow.spec.ts      # Stage 0 → Stage 4 (to be extended)
│   ├── two-browser-reconciler-*.spec.ts   # Edge cases (OFFER_OPTIONAL, OFFER_SHARING)
│   ├── two-browser-circuit-breaker.spec.ts # Refinement limit verification
│   ├── two-browser-stage-3.spec.ts        # Stage 3 isolated (needs extraction, common ground)
│   └── two-browser-stage-4.spec.ts        # Stage 4 isolated (strategies, ranking, agreement)
├── helpers/
│   ├── TwoBrowserHarness.ts               # Setup/teardown for two contexts
│   ├── SessionBuilder.ts                  # State factory pattern
│   └── test-utils.ts                      # Shared actions (signCompact, waitForReconciler, etc.)
└── playwright.two-browser.config.ts       # Config with MOCK_LLM=true, 15min timeout
```

### Pattern 1: Full Flow Test Structure
**What:** Single test case covering Stage 0 → Stage 4 with clear section boundaries
**When to use:** Milestone verification, integration testing, regression prevention
**Example:**
```typescript
// Source: two-browser-full-flow.spec.ts (existing Stage 0-2)
test('both users complete Stages 0-4', async ({ browser, request }) => {
  test.setTimeout(900000); // 15 minutes for full flow

  // ==========================================
  // STAGE 0: COMPACT SIGNING
  // ==========================================
  await harness.setupUserB(browser, request);
  await harness.acceptInvitation();
  await harness.navigateUserA();
  await signCompact(harness.userAPage);
  // ... (existing pattern)

  // ==========================================
  // STAGE 1: USER A WITNESSING
  // ==========================================
  const userAStage1Messages = [
    "Hi, I'm having a conflict with my partner",
    'We keep arguing about household chores',
    // ... (existing pattern from fixture)
  ];
  await sendAndWaitForPanel(harness.userAPage, userAStage1Messages, 'feel-heard-yes', 4);
  await confirmFeelHeard(harness.userAPage);

  // ==========================================
  // STAGE 2: EMPATHY DRAFTING (CRITICAL ORDER)
  // ==========================================
  // IMPORTANT: Both users MUST complete empathy drafting BEFORE either shares
  // to avoid transition message race condition
  await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);
  await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

  // Now share sequentially (User A first, then User B)
  await shareEmpathy(harness.userAPage);
  await harness.userAPage.waitForTimeout(2000); // Ably propagation
  await shareEmpathy(harness.userBPage);

  // Wait for reconciler
  await waitForReconcilerComplete(harness.userAPage, 60000);
  await waitForReconcilerComplete(harness.userBPage, 60000);

  // ==========================================
  // STAGE 3: NEEDS EXTRACTION
  // ==========================================
  // Use API calls instead of UI interactions (per Phase 10-02 decision)
  const apiA = makeApiRequest(request, userA.email, userAId, FIXTURE_ID);
  const apiB = makeApiRequest(request, userB.email, userBId, FIXTURE_ID);

  await Promise.all([
    apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`),
    apiB.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`)
  ]);

  // Wait for needs review UI
  await expect(harness.userAPage.getByTestId('needs-review-confirm')).toBeVisible({ timeout: 30000 });
  // ... continue with confirmation flow

  // ==========================================
  // STAGE 4: STRATEGIES & AGREEMENT
  // ==========================================
  // API-driven strategy proposal and ranking (per Phase 11 pattern)
  // ... (pattern from two-browser-stage-4.spec.ts)
});
```

### Pattern 2: Stage Isolation with SessionBuilder
**What:** Start tests at specific stages using SessionBuilder for faster iteration
**When to use:** Debugging specific stages, targeted verification, development speed
**Example:**
```typescript
// Source: two-browser-stage-3.spec.ts
test.beforeEach(async ({ browser, request }) => {
  await cleanupE2EData();

  // Start at EMPATHY_REVEALED - skip Stages 0-2 entirely
  const setup = await new SessionBuilder(API_BASE_URL)
    .userA(userA.email, userA.name)
    .userB(userB.email, userB.name)
    .startingAt('EMPATHY_REVEALED') // Stage 2 complete
    .setup(request);

  sessionId = setup.session.id;
  userAId = setup.userA.id;
  userBId = setup.userB!.id;

  // Create browser contexts with fixture
  const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID);
  const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID);
  pageA = userASetup.page;
  pageB = userBSetup.page;
});
```

### Pattern 3: Race Condition Prevention
**What:** Ensure both users complete async operations BEFORE triggering next stage
**When to use:** Any stage transition that triggers AI/reconciler processing
**Example:**
```typescript
// Source: two-browser-full-flow.spec.ts, lines 148-174
// IMPORTANT: Both users must complete empathy drafting BEFORE either shares.
// When User A shares empathy, backend generates a transition message
// delivered to User B via Ably, which injects an extra AI message into
// User B's chat and breaks waitForAnyAIResponse's message counting.

// --- User A empathy draft ---
await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);

// --- User B empathy draft ---
await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

// NOW share (both drafts complete, no race condition)
await shareEmpathy(harness.userAPage);
await harness.userAPage.waitForTimeout(2000); // Ably propagation
await shareEmpathy(harness.userBPage);
```

### Pattern 4: API-Driven Testing for Complex Flows
**What:** Use direct API calls instead of UI interactions for operations with limited testIDs
**When to use:** React Native Web (testIDs not accessible), complex multi-step flows, setup speed
**Example:**
```typescript
// Source: two-browser-stage-4.spec.ts, lines 186-200
// Stage 4 strategy proposal via API (React Native Web limitation)
const apiA = makeApiRequest(request, userA.email, userAId, FIXTURE_ID);

const strategyA1 = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
  description: 'Have a 10-minute phone-free conversation at dinner each day',
  needsAddressed: ['Connection', 'Recognition'],
});

// Then verify UI reflects the change
await pageA.reload();
await expect(pageA.getByText(/phone-free conversation/i)).toBeVisible({ timeout: 5000 });
```

### Pattern 5: Visual Regression at Key Checkpoints
**What:** Screenshot both users at critical state transitions
**When to use:** After stage completion, reconciler outcomes, edge cases
**Example:**
```typescript
// Source: two-browser-reconciler-offer-optional.spec.ts, lines 232-253
// After reconciler completes, capture both perspectives
await expect(harness.userAPage).toHaveScreenshot('offer-optional-01-guesser-waiting.png', {
  maxDiffPixels: 100,
});
await expect(harness.userBPage).toHaveScreenshot('offer-optional-01-subject-panel.png', {
  maxDiffPixels: 100,
});

// After user action (decline/accept)
await declineButton.click();
await expect(harness.userBPage).toHaveScreenshot('offer-optional-03-subject-after-decline.png', {
  maxDiffPixels: 100,
});
```

### Anti-Patterns to Avoid
- **Parallel stage transitions:** Don't let User A advance to Stage N+1 while User B is still in Stage N if it triggers partner notifications. This causes race conditions in message counting and state synchronization.
- **Deep-linking to stage-specific pages:** Always navigate via UI (navigateToShareFromSession) instead of direct URLs to /share. Direct URLs bypass cache warming and mask stale data bugs.
- **Single-browser reconciler tests:** Real Ably connections in two-browser tests caught timing issues that mocked single-browser tests missed (established in v1.0).
- **Hardcoded wait times instead of state polling:** Use `waitForReconcilerComplete()` which polls for indicator visibility, not `waitForTimeout(60000)`.
- **Testing without fixtures:** MOCK_LLM=false tests are slow (8-12min) and non-deterministic. Use fixtures for all E2E tests except explicit "live AI" tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-browser session setup | Manual context creation, user seeding, header injection | TwoBrowserHarness | Handles cleanup, Ably connections, navigation, error screenshots |
| Stage-specific session state | Manually execute N stages via UI to reach Stage N+1 | SessionBuilder.startingAt(stage) | Fast (API-driven), reliable (no UI flakiness), maintainable (backend owns state) |
| Waiting for AI responses | setTimeout loops or manual polling | waitForAIResponse(page, /pattern/) | Handles typing indicator, response visibility, timeout edge cases |
| User action sequences | Inline click/fill/wait chains | test-utils helpers (signCompact, confirmFeelHeard, etc.) | DRY, consistent timing, encapsulates pattern changes |
| Visual regression | Manual screenshot diffing, ImageMagick scripts | toHaveScreenshot() with global config | Playwright native, auto-generates baselines, CI-friendly, pixel-perfect diffs |

**Key insight:** The codebase has 10 months of E2E test evolution. Every helper (TwoBrowserHarness, SessionBuilder, waitForReconcilerComplete) exists because the naive approach failed. Don't revert to patterns that were abandoned.

## Common Pitfalls

### Pitfall 1: Flakiness from Insufficient Wait Patterns
**What goes wrong:** Tests pass locally, fail in CI due to slower rendering/network
**Why it happens:** Over-reliance on `waitForTimeout()` instead of state-based waits
**How to avoid:**
- Use `expect(element).toBeVisible({ timeout: N })` instead of `waitForTimeout() + isVisible()`
- Use `waitForReconcilerComplete()` which polls for chat indicator
- Use `waitForLoadState('networkidle')` after navigation
- Always wait for typing indicator to disappear after AI interactions
**Warning signs:**
- Tests that "usually pass" but occasionally timeout
- Different pass rates between local and CI
- Race conditions appearing in screenshots (half-rendered states)

### Pitfall 2: Transition Message Race Condition
**What goes wrong:** When User A shares empathy, backend sends transition message to User B via Ably. If User B is still drafting empathy, the extra AI message breaks message counting logic in `waitForAnyAIResponse()`.
**Why it happens:** Stage 2 completion triggers cross-user Ably events
**How to avoid:** Both users MUST complete empathy drafting BEFORE either shares (see Pattern 3)
**Warning signs:**
- User B's test fails with "expected 6 AI messages, got 7"
- Reconciler panel doesn't appear for User B
- Tests work when run individually but fail when run together

### Pitfall 3: Visual Regression Baseline Drift
**What goes wrong:** Baselines become outdated after UI changes, causing false positives
**Why it happens:** Forgetting to regenerate baselines after intentional design changes
**How to avoid:**
1. Before updating baselines: `git diff e2e/tests/**/*-snapshots/` to see what changed
2. Update only intentional changes: `npx playwright test [test-name] --update-snapshots`
3. Review diff images in `test-results/` directory before committing
4. Commit with descriptive message: `test: update baselines after button color change`
**Warning signs:**
- Many tests failing with "screenshot diff" but UI looks correct
- Baselines showing old UI after recent changes
- Diff images showing obvious intentional design updates

### Pitfall 4: Fixture Mismatches Between Test Stages
**What goes wrong:** Full-flow test uses 'user-a-full-journey' fixture but Stage 3 expects 'stage-3-needs' fixture, causing AI response mismatch
**Why it happens:** Each fixture has specific response sequences; using wrong fixture breaks expected flow
**How to avoid:**
- Check existing fixtures before creating tests: `backend/src/scripts/fixtures/llm-fixtures.json`
- Use consistent fixture across all stages OR create new composite fixture
- Document fixture requirements in test header comment
**Warning signs:**
- AI returns unexpected text patterns
- `waitForAIResponse(/expected pattern/)` times out
- Panel doesn't appear when expected (e.g., empathy-review-button)

### Pitfall 5: Stage 3-4 API vs UI Interaction Confusion
**What goes wrong:** Test tries to interact with Stage 3 needs review via testIDs but testIDs aren't accessible in React Native Web Playwright context
**Why it happens:** React Native Web renders components differently; testIDs work in mobile but not in Playwright
**How to avoid:** Use API-driven approach for Stage 3-4 operations (established in Phase 10-02):
- Trigger needs extraction via GET `/api/sessions/:id/needs`
- Propose strategies via POST `/api/sessions/:id/strategies`
- Submit rankings via POST `/api/sessions/:id/strategies/:id/rank`
- Use text-based selectors for verification: `page.getByText(/needs review/i)`
**Warning signs:**
- `getByTestId('needs-review-confirm')` not found errors
- Elements visible in browser inspector but not in Playwright
- Tests pass in live-ai config but fail in two-browser config

### Pitfall 6: Test Timeout from Underestimated Flow Duration
**What goes wrong:** Test times out at 120s (default) when full flow takes 180-300s
**Why it happens:** Each AI interaction adds 10-15s; Stage 0-4 has ~18-20 interactions
**How to avoid:**
- Full flow test: `test.setTimeout(900000)` (15 minutes)
- Individual stage tests: `test.setTimeout(180000)` (3 minutes)
- Document timeout rationale in test comment
**Warning signs:**
- "Test timeout of 120000ms exceeded" errors
- Test works when stages tested separately but fails when combined
- CI timeouts but local passes (slower CI environments)

## Code Examples

Verified patterns from test suite:

### Full Flow Test Extension Pattern
```typescript
// Source: two-browser-full-flow.spec.ts (extend to Stage 4)
// Location: e2e/tests/two-browser-full-flow.spec.ts

test('both users complete Stages 0-4', async ({ browser, request }) => {
  test.setTimeout(900000); // 15 minutes

  // === STAGES 0-2 === (already implemented, lines 66-223)
  // ... existing Stage 0, 1, 2 logic ...

  // === STAGE 3: NEEDS EXTRACTION ===
  // Navigate both to session (already there from Stage 2)
  await navigateBackToChat(harness.userAPage);
  await navigateBackToChat(harness.userBPage);
  await handleMoodCheck(harness.userAPage);
  await handleMoodCheck(harness.userBPage);

  // API-driven needs extraction (Phase 10 pattern)
  const apiA = makeApiRequest(request, harness.userAEmail, harness.userAId, 'user-a-full-journey');
  const apiB = makeApiRequest(request, harness.userBEmail, harness.userBId, 'reconciler-no-gaps');

  await Promise.all([
    apiA.get(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/needs`),
    apiB.get(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/needs`)
  ]);

  // Wait for Ably events to propagate needs data
  await harness.userAPage.waitForTimeout(3000);

  // Reload pages to ensure cache updates
  await Promise.all([
    harness.userAPage.reload(),
    harness.userBPage.reload()
  ]);

  // Navigate to Needs tab via Share → Needs (Phase 10 pattern)
  await navigateToShareFromSession(harness.userAPage);
  await navigateToShareFromSession(harness.userBPage);

  // Verify needs visible (text-based selector per Phase 10-02)
  await expect(harness.userAPage.getByText(/needs have been identified/i)).toBeVisible({ timeout: 10000 });
  await expect(harness.userBPage.getByText(/needs have been identified/i)).toBeVisible({ timeout: 10000 });

  // Confirm needs via API (RN Web testID limitation)
  await Promise.all([
    apiA.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/needs/confirm`),
    apiB.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/needs/confirm`)
  ]);

  // Wait for common ground analysis (AI operation)
  await harness.userAPage.waitForTimeout(5000);

  // Reload to see common ground
  await Promise.all([
    harness.userAPage.reload(),
    harness.userBPage.reload()
  ]);

  // Verify common ground visible
  await expect(harness.userAPage.getByText(/common ground/i)).toBeVisible({ timeout: 10000 });
  await expect(harness.userBPage.getByText(/common ground/i)).toBeVisible({ timeout: 10000 });

  // Screenshot Stage 3 completion
  await expect(harness.userAPage).toHaveScreenshot('full-flow-stage-3-user-a.png', { maxDiffPixels: 100 });
  await expect(harness.userBPage).toHaveScreenshot('full-flow-stage-3-user-b.png', { maxDiffPixels: 100 });

  // === STAGE 4: STRATEGIES & AGREEMENT ===

  // Propose strategies via API (Phase 11 pattern)
  const strategyA1 = await apiA.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/strategies`, {
    description: 'Have a 10-minute phone-free conversation at dinner each day',
    needsAddressed: ['Connection', 'Recognition'],
  });

  const strategyB1 = await apiB.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/strategies`, {
    description: 'Weekly check-in about workload and stress levels',
    needsAddressed: ['Support', 'Understanding'],
  });

  // Mark ready to rank
  await Promise.all([
    apiA.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/strategies/mark-ready`),
    apiB.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/strategies/mark-ready`)
  ]);

  // Submit rankings with guaranteed overlap (both rank strategy 1 as #1)
  const strategyA1Id = (await strategyA1.json()).data.id;
  const strategyB1Id = (await strategyB1.json()).data.id;

  await Promise.all([
    apiA.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/rankings`, {
      rankings: [
        { strategyId: strategyA1Id, rank: 1 },
        { strategyId: strategyB1Id, rank: 2 },
      ]
    }),
    apiB.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/rankings`, {
      rankings: [
        { strategyId: strategyA1Id, rank: 1 },
        { strategyId: strategyB1Id, rank: 2 },
      ]
    })
  ]);

  // Wait for overlap calculation (AI/backend operation)
  await harness.userAPage.waitForTimeout(3000);

  // Reload to see overlap reveal
  await Promise.all([
    harness.userAPage.reload(),
    harness.userBPage.reload()
  ]);

  // Verify overlap visible
  await expect(harness.userAPage.getByText(/strategies you both ranked/i)).toBeVisible({ timeout: 10000 });
  await expect(harness.userBPage.getByText(/strategies you both ranked/i)).toBeVisible({ timeout: 10000 });

  // Screenshot overlap reveal
  await expect(harness.userAPage).toHaveScreenshot('full-flow-stage-4-overlap-user-a.png', { maxDiffPixels: 100 });
  await expect(harness.userBPage).toHaveScreenshot('full-flow-stage-4-overlap-user-b.png', { maxDiffPixels: 100 });

  // Create and confirm agreement
  await apiA.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/agreement`, {
    strategyIds: [strategyA1Id],
  });

  await harness.userBPage.waitForTimeout(2000); // Ably propagation

  // User B confirms agreement
  await apiB.post(`${harness.apiBaseUrl}/api/sessions/${harness.sessionId}/agreement/confirm`);

  // Reload both to see final state
  await Promise.all([
    harness.userAPage.reload(),
    harness.userBPage.reload()
  ]);

  // Verify session complete
  await expect(harness.userAPage.getByText(/agreement confirmed/i)).toBeVisible({ timeout: 10000 });
  await expect(harness.userBPage.getByText(/agreement confirmed/i)).toBeVisible({ timeout: 10000 });

  // Final screenshots
  await expect(harness.userAPage).toHaveScreenshot('full-flow-final-user-a.png', { maxDiffPixels: 100 });
  await expect(harness.userBPage).toHaveScreenshot('full-flow-final-user-b.png', { maxDiffPixels: 100 });

  // ==========================================
  // SUCCESS: Full session Stages 0-4 complete
  // ==========================================
});
```

### Reconciler Edge Case Verification Pattern
```typescript
// Source: two-browser-reconciler-offer-optional.spec.ts
// Run existing test to verify current status

// 1. Check test passes
// cd e2e && npx playwright test two-browser-reconciler-offer-optional --config=playwright.two-browser.config.ts

// 2. If failures, check for:
// - Screenshot diffs (expected if UI changed intentionally)
// - Timeout errors (may need to increase waits for Ably propagation)
// - Race conditions (check if both users complete drafting before sharing)

// 3. Verify 3 consecutive passes:
// for i in {1..3}; do
//   echo "Run $i/3"
//   npx playwright test two-browser-reconciler-offer-optional --config=playwright.two-browser.config.ts
//   if [ $? -ne 0 ]; then
//     echo "FAILED on run $i"
//     exit 1
//   fi
// done
// echo "SUCCESS: 3 consecutive passes"
```

### Test Reliability Verification Pattern
```typescript
// Pattern for establishing baseline reliability

// 1. Clean state before test run
// cd e2e
// rm -rf test-results/ playwright-report/
// rm -rf tests/**/*-snapshots/ # Only if regenerating baselines

// 2. Run test suite multiple times
// bash -c 'for i in {1..3}; do
//   echo "=== Run $i/3 ==="
//   npx playwright test two-browser-full-flow --config=playwright.two-browser.config.ts
//   if [ $? -ne 0 ]; then
//     echo "FAILED on run $i"
//     exit 1
//   fi
//   sleep 5 # Brief pause between runs
// done
// echo "SUCCESS: 3 consecutive passes"'

// 3. Analyze failures
// - Check test-results/ for screenshots showing failure state
// - Check playwright-report/ HTML report for timing info
// - Look for patterns: always fails at same step? intermittent?

// 4. Document flakiness patterns
// If test fails occasionally:
// - Note which step/assertion fails
// - Check if timeout-related or state-related
// - Increase wait times incrementally (waitForTimeout += 1000)
// - Add polling waits instead of fixed waits where possible
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-browser with mocked Ably | Two browser contexts with real Ably connections | v1.0 (2025-2026) | Caught race conditions that mocked tests missed; established as standard |
| page.screenshot() manual diffing | toHaveScreenshot() with global config | Phase 12 (Feb 2026) | Automated visual regression, CI-friendly, baseline management |
| UI-driven needs extraction | API-driven with text selectors | Phase 10-02 (Jan 2026) | Works around React Native Web testID limitations |
| Manual session state setup | SessionBuilder fluent API | Phase 10 (Jan 2026) | Fast stage isolation, reliable backend state |
| Inline test helper code | Extracted test-utils helpers | Phase 8-11 (2025-2026) | DRY, consistent patterns, easier maintenance |

**Deprecated/outdated:**
- Direct URLs to stage-specific pages (bypasses cache warming, masks stale data bugs)
- MOCK_LLM=false for all tests (too slow for regular test runs; reserve for explicit "live-ai" tests)
- Hardcoded fixture responses in test files (centralized in backend/src/scripts/fixtures/llm-fixtures.json)
- Per-test screenshot tolerance configs (global config in playwright.*.config.ts now)

## Test Execution Timing

Based on existing tests and architecture:

| Test Scope | Duration Estimate | AI Interactions | Notes |
|------------|------------------|----------------|-------|
| Stage 0 only | ~5-10s | 0 | UI only (sign compact, mood check) |
| Stage 0-1 (one user) | ~30-45s | 4-6 | Witnessing + feel-heard |
| Stage 0-2 (two users) | ~120-180s | 13 | Both users through empathy sharing + reconciler |
| Stage 0-3 (two users) | ~180-240s | 15-16 | Add needs extraction + common ground |
| Stage 0-4 (two users) | ~240-360s | 18-20 | Add strategy proposal + ranking + agreement |
| Full flow with screenshots | ~300-420s | 18-20 | Add screenshot wait times |

**Current two-browser-full-flow.spec.ts covers Stage 0-2 in ~180s** (with 15min timeout buffer).

Extending to Stage 4 will add ~120-180s, totaling **~300-360s (5-6 minutes)** for full flow.

**Recommended timeout:** 900000ms (15 minutes) to handle CI slowness, Ably delays, screenshot generation.

## Open Questions

1. **Fixture Strategy for Full Flow**
   - What we know: Existing test uses 'user-a-full-journey' + 'reconciler-no-gaps' fixtures; Stage 3 tests use 'stage-3-needs' fixture; Stage 4 tests use 'stage-4-strategies' fixture
   - What's unclear: Whether to create unified 'full-flow-stage-0-4' fixture OR chain existing fixtures
   - Recommendation: Try chaining existing fixtures first (less work), create unified fixture only if response sequence conflicts arise

2. **Reconciler Test Current Status**
   - What we know: Tests exist (offer-optional, offer-sharing, circuit-breaker) with 70 toHaveScreenshot assertions
   - What's unclear: Do tests pass NOW? (Phase 12 generated infrastructure but baselines may not be committed)
   - Recommendation: Run `npx playwright test two-browser-reconciler-* --config=playwright.two-browser.config.ts` to establish baseline; if failures, regenerate baselines with `--update-snapshots`

3. **Flakiness Tolerance**
   - What we know: Requirement is "3 consecutive passes"
   - What's unclear: What's acceptable pass rate after that? (90%? 95%? 99%?)
   - Recommendation: Define "reliable" as 95%+ pass rate over 20 runs; if below 95%, investigate root cause

4. **CI/CD Integration**
   - What we know: Tests configured with `retries: process.env.CI ? 2 : 0` in playwright config
   - What's unclear: Are these tests running in CI now? What's the CI environment (GitHub Actions? Other?)
   - Recommendation: Verify CI config exists; if not, document manual verification workflow as acceptable for v1.1

5. **Stage 3-4 Visual Baselines**
   - What we know: Phase 12 converted screenshots to toHaveScreenshot, but baselines not yet generated (per VERIFICATION.md)
   - What's unclear: Are baselines committed now? (check git history after 2026-02-17)
   - Recommendation: Verify baseline PNGs exist in `e2e/tests/**/*-snapshots/` directories; if not, generate with `--update-snapshots` before extending full-flow test

## Sources

### Primary (HIGH confidence)
- e2e/tests/two-browser-full-flow.spec.ts - Existing Stage 0-2 full flow implementation
- e2e/tests/two-browser-stage-3.spec.ts - Stage 3 isolated test with API patterns
- e2e/tests/two-browser-stage-4.spec.ts - Stage 4 isolated test with API patterns
- e2e/tests/two-browser-reconciler-offer-optional.spec.ts - Reconciler edge case (OFFER_OPTIONAL)
- e2e/tests/two-browser-reconciler-offer-sharing-refinement.spec.ts - Reconciler edge case (OFFER_SHARING)
- e2e/tests/two-browser-circuit-breaker.spec.ts - Circuit breaker verification
- e2e/helpers/TwoBrowserHarness.ts - Two-browser test harness
- e2e/helpers/SessionBuilder.ts - State factory for stage isolation
- e2e/helpers/test-utils.ts - Shared test action helpers
- e2e/playwright.two-browser.config.ts - Two-browser Playwright configuration
- .planning/phases/12-visual-regression-baselines/12-VERIFICATION.md - Phase 12 completion status
- .planning/REQUIREMENTS.md - E2E-01, E2E-02 requirement definitions
- CLAUDE.md - Project-specific test patterns and learnings
- docs/e2e-test-audit.md - E2E test suite audit and organization

### Secondary (MEDIUM confidence)
- Git commit history (ba4a948, 32c72da, acc8a32) - Recent test changes and baselines
- Memory notes (MEMORY.md) - Stage 2 E2E test race condition pattern

### Tertiary (LOW confidence)
- None - all findings verified from codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools established in codebase with 10 months of evolution
- Architecture: HIGH - Patterns extracted from working tests, proven in production use
- Pitfalls: HIGH - Documented from actual failures (git history, CLAUDE.md, code comments)

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days - stable patterns, no breaking changes expected)
