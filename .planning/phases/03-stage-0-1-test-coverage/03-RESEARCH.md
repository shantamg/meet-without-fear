# Phase 03: Stage 0-1 Test Coverage - Research

**Researched:** 2026-02-14
**Domain:** Two-browser E2E testing with Playwright for partner interaction flows
**Confidence:** HIGH

## Summary

Phase 3 requires writing two-browser E2E tests that verify both users can complete Stages 0-1 together. The codebase already has validated two-browser infrastructure (TwoBrowserHarness) from Phase 2, proving that independent contexts, per-user fixtures, real Ably connections, and full UI navigation work together.

The primary challenge is **documenting actual behavior, not ideal behavior**. The additional context identifies critical issues (infinite share loop, ReconcilerResult visibility race, missing refinement UI) that need to be worked around, not fixed, in these tests. The goal is comprehensive test coverage that captures the system's current state, creating a baseline for future improvements.

**Primary recommendation:** Use TwoBrowserHarness pattern with per-user fixtures, extend existing test utilities (signCompact, confirmFeelHeard), and create new Stage 0-1 specific fixtures. Tests should be sequential (not parallel) to avoid database conflicts, use structural assertions (testIDs not text), and include reload fallbacks for Ably event delivery issues.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | Current (via @playwright/test) | E2E testing framework | Industry standard for modern E2E testing, excellent multi-context support |
| @tanstack/react-query | v5 | Cache management | Already in use, tests verify cache-first architecture |
| Ably | Current | Real-time messaging | Already in use for partner events, tests verify event delivery |
| Prisma | Current | Database state seeding | Already in use via StateFactory/SessionBuilder |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TwoBrowserHarness | Custom (e2e/helpers) | Two-user test orchestration | All two-browser tests (validated in Phase 2) |
| SessionBuilder | Custom (e2e/helpers) | Database state seeding | When seeding advanced stages (Stage 2+) |
| E2E Fixtures | Custom (backend/src/fixtures) | Deterministic AI responses | All tests requiring AI interactions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TwoBrowserHarness | Manual context setup per test | Harness eliminates boilerplate, tested pattern |
| Per-user fixtures | Global fixture via env var | Per-user enables independent AI responses for each user |
| Sequential tests | Parallel with DB isolation | Sequential simpler, avoids race conditions (current approach) |

**Installation:**
```bash
# Already installed - no new dependencies needed
cd e2e
npm install # Existing dependencies sufficient
```

## Architecture Patterns

### Recommended Project Structure
```
e2e/
├── tests/
│   ├── two-browser-smoke.spec.ts           # Infrastructure validation (Phase 2)
│   ├── two-browser-stage-0.spec.ts         # NEW: Stage 0 compact signing
│   └── two-browser-stage-1.spec.ts         # NEW: Stage 1 feel-heard flow
├── helpers/
│   ├── two-browser-harness.ts              # Orchestration (tested)
│   ├── test-utils.ts                       # Shared utilities (signCompact, confirmFeelHeard)
│   └── index.ts                            # Exports
└── playwright.two-browser.config.ts        # MOCK_LLM=true, no global fixture
```

### Pattern 1: Two-Browser Test with TwoBrowserHarness
**What:** Orchestrates two isolated browser contexts with per-user fixtures for deterministic AI responses
**When to use:** All tests requiring partner interactions (Stages 0-4)
**Example:**
```typescript
// Source: e2e/tests/two-browser-smoke.spec.ts (validated in Phase 2)
test.describe('Stage 0: Compact Signing', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    harness = new TwoBrowserHarness({
      userA: { email: 'stage0-a@e2e.test', name: 'Alice', fixtureId: 'stage-0-fixture' },
      userB: { email: 'stage0-b@e2e.test', name: 'Bob', fixtureId: 'stage-0-fixture' },
    });
    await harness.cleanup();
    await harness.setupUserA(browser, request);
    await harness.createSession();
  });

  test.afterEach(async () => {
    await harness.teardown();
  });

  test('both users sign compact and enter witnessing', async ({ browser, request }) => {
    // User A signs first
    await harness.navigateUserA();
    await signCompact(harness.userAPage);

    // User B accepts invitation and signs
    await harness.setupUserB(browser, request);
    await harness.acceptInvitation();
    await harness.navigateUserB();
    await signCompact(harness.userBPage);

    // Verify both in Stage 1 (WITNESS)
    // ... assertions
  });
});
```

### Pattern 2: Structural Assertions (not text matching)
**What:** Use testIDs and element counts, avoid regex text matching for non-deterministic AI responses
**When to use:** All assertions in tests with real or mock AI
**Example:**
```typescript
// BAD: Text matching breaks on AI response changes
await expect(page.getByText(/glad you reached out/i)).toBeVisible();

// GOOD: Structural assertions
await expect(page.getByTestId('compact-sign-button')).toBeVisible();
const aiMessageCount = await page.locator('[data-testid^="ai-message-"]').count();
expect(aiMessageCount).toBeGreaterThan(0);
```

### Pattern 3: Reload Fallback for Ably Events
**What:** Wait for partner updates with reload fallback when Ably delivery is slow
**When to use:** Assertions that depend on partner state changes delivered via Ably
**Example:**
```typescript
// Source: e2e/helpers/two-browser-harness.ts
const partnerName = harness.userAPage.getByTestId('session-chat-header-partner-name');
const hasPartnerName = await waitForPartnerUpdate(harness.userAPage, partnerName, {
  timeout: 15000,
  reloadOnMiss: true, // Reload if Ably event doesn't arrive
});
expect(hasPartnerName).toBe(true);
await expect(partnerName).toHaveText('Bob');
```

### Pattern 4: Per-User Fixture Architecture
**What:** Each user context sets X-E2E-Fixture-ID header for independent AI responses
**When to use:** All two-browser tests requiring different AI responses per user
**Example:**
```typescript
// TwoBrowserHarness sets per-user fixture IDs via extraHTTPHeaders
const context = await browser.newContext({
  ...devices['iPhone 12'],
  extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
});
// Backend routes use fixtureId from header to select AI responses
```

### Anti-Patterns to Avoid
- **Parallel test execution with shared DB:** Current config uses `workers: 1` to avoid race conditions. Don't parallelize without proper session ID isolation.
- **Global E2E_FIXTURE_ID:** Two-browser config intentionally omits this env var. Each user MUST set fixture via header.
- **Fixing bugs during test writing:** Tests document current behavior. Don't fix infinite loops or race conditions—work around them or mark as known failures.
- **Text-based assertions on AI responses:** Even with fixtures, use structural assertions to avoid brittleness.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Two-browser orchestration | Manual context creation per test | TwoBrowserHarness | Validated in Phase 2, handles cleanup, positioning, fixture IDs |
| Database state seeding | SQL scripts or manual API calls | SessionBuilder + StateFactory (backend) | Type-safe, supports all stages (CREATED → STRATEGIC_REPAIR_COMPLETE) |
| Ably event waiting | Fixed setTimeout() delays | waitForPartnerUpdate() with reload fallback | Handles slow event delivery, already proven necessary |
| Per-user fixture headers | Manual header construction | getE2EHeaders() helper | Centralized, consistent, handles optional fixtureId |
| AI response assertions | Regex text matching | Structural testIDs or waitForAnyAIResponse() | Fixtures change, structure is stable |

**Key insight:** The codebase has battle-tested helpers from Phases 1-2. Don't rebuild them—extend existing patterns.

## Common Pitfalls

### Pitfall 1: Assuming Ably Events Arrive Immediately
**What goes wrong:** Tests fail intermittently because partner name/status updates don't appear within 5s timeout
**Why it happens:** Ably has variable latency, especially in test environments. Sometimes reload is needed to fetch fresh state.
**How to avoid:** Always use `waitForPartnerUpdate()` with `reloadOnMiss: true` for partner state changes
**Warning signs:** Tests pass locally, fail in CI; tests fail with "element not visible" on partner-related assertions

### Pitfall 2: Using Global E2E_FIXTURE_ID in Two-Browser Tests
**What goes wrong:** Both users get the same AI responses, breaking fixtures designed for different user journeys
**Why it happens:** Copying from single-user config without understanding per-user header requirement
**How to avoid:** Two-browser config MUST NOT set E2E_FIXTURE_ID env var. TwoBrowserHarness sets X-E2E-Fixture-ID per context.
**Warning signs:** User B gets User A's fixture responses; reconciler tests fail because both users have identical storylines

### Pitfall 3: Testing Ideal Behavior Instead of Actual Behavior
**What goes wrong:** Tests fail because they assert what SHOULD happen, not what DOES happen
**Why it happens:** Additional context lists critical issues (infinite share loop, visibility race, missing UI). Goal is documentation, not verification of ideal state.
**How to avoid:** Read audit docs, work around known issues with timeouts/retries, comment liberally about workarounds
**Warning signs:** "This test would pass if we fixed X" — that's Phase 4's job, not Phase 3's

### Pitfall 4: Mood Check Interference
**What goes wrong:** Tests can't find session UI because mood check modal blocks interactions
**Why it happens:** Mood check appears on session entry even when lastMoodIntensity is set in StateFactory
**How to avoid:** Always call `handleMoodCheck(page)` after navigation/reload. Test utilities already handle this.
**Warning signs:** "Compact not visible" when navigating to session; tests fail after reload steps

### Pitfall 5: Cache Staleness After Stage Transitions
**What goes wrong:** UI doesn't update after compact signing or feel-heard confirmation
**Why it happens:** sessionKeys.state cache intentionally NOT invalidated after mutations (avoid race conditions). Manual updates required.
**How to avoid:** Verify mutations update cache via onMutate (useConfirmInvitationMessage, useConfirmFeelHeard). Tests can reload to force cache refresh.
**Warning signs:** User sees old stage after completing action; partner sees stale state

### Pitfall 6: Sequential Test Execution Required
**What goes wrong:** Database conflicts when tests run in parallel (session ID collisions, orphaned records)
**Why it happens:** Tests share single database, no session ID sharding implemented
**How to avoid:** Keep `workers: 1` in playwright.two-browser.config.ts. Accept slower runtime.
**Warning signs:** Tests pass individually, fail in suite; "unique constraint violation" errors

## Code Examples

Verified patterns from existing codebase:

### Complete Stage 0 Flow (Both Users)
```typescript
// Source: Adapted from e2e/tests/two-browser-smoke.spec.ts
test('both users sign compact and enter witnessing (Stage 0 → Stage 1)', async ({ browser, request }) => {
  test.setTimeout(180000); // 3 minutes

  // User A setup and navigation
  await harness.navigateUserA();
  await signCompact(harness.userAPage); // From test-utils
  await handleMoodCheck(harness.userAPage);

  // User B setup (after User A creates session)
  await harness.setupUserB(browser, request);
  await harness.acceptInvitation();
  await harness.navigateUserB();
  await signCompact(harness.userBPage);
  await handleMoodCheck(harness.userBPage);

  // Verify both see chat input (Stage 1 entry)
  await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
  await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

  // Verify partner names via Ably (with reload fallback)
  const userAPartnerName = harness.userAPage.getByTestId('session-chat-header-partner-name');
  const userAHasPartnerName = await waitForPartnerUpdate(harness.userAPage, userAPartnerName, {
    timeout: 15000,
    reloadOnMiss: true,
  });
  expect(userAHasPartnerName).toBe(true);
  await expect(userAPartnerName).toHaveText('Bob');

  // Screenshot final state
  await harness.userAPage.screenshot({ path: 'test-results/stage0-user-a-final.png' });
  await harness.userBPage.screenshot({ path: 'test-results/stage0-user-b-final.png' });
});
```

### Complete Stage 1 Flow (Both Users)
```typescript
// Source: Adapted from e2e/helpers/test-utils.ts and two-browser-smoke.spec.ts
test('both users complete feel-heard and enter Stage 2', async ({ browser, request }) => {
  test.setTimeout(300000); // 5 minutes

  // Assume Stage 0 already complete (use StateFactory or run Stage 0 flow)

  // User A conversation
  const userAChatInput = harness.userAPage.getByTestId('chat-input');
  const userASendButton = harness.userAPage.getByTestId('send-button');

  await userAChatInput.fill("I'm struggling with this conflict");
  await userASendButton.click();
  await waitForAIResponse(harness.userAPage, /understand.*difficult/i); // Or use waitForAnyAIResponse

  // Continue conversation until feel-heard panel appears
  // (Multiple exchanges, fixture-dependent)

  // User A confirms feel-heard
  await confirmFeelHeard(harness.userAPage); // From test-utils
  await expect(harness.userAPage.getByTestId('invitation-panel')).toBeVisible();

  // User B conversation (parallel or sequential)
  const userBChatInput = harness.userBPage.getByTestId('chat-input');
  const userBSendButton = harness.userBPage.getByTestId('send-button');

  await userBChatInput.fill("Things have been tense lately");
  await userBSendButton.click();
  await waitForAnyAIResponse(harness.userBPage); // Non-deterministic AI, use structural wait

  // User B confirms feel-heard
  await confirmFeelHeard(harness.userBPage);

  // Verify both advanced to Stage 2
  // (Check via API or UI indicators)
});
```

### Fixture Creation for Stage 0-1
```typescript
// Source: backend/src/fixtures/user-a-full-journey.ts (pattern)
// File: backend/src/fixtures/stage-0-1-user-a.ts
import { E2EFixture } from './types';

export const stage01UserA: E2EFixture = {
  responses: [
    {
      user: "I'm having trouble with my partner",
      ai: "I'm glad you reached out. It takes courage to seek help when things feel difficult. Can you tell me more about what's been happening?",
    },
    {
      user: "We keep arguing about the same things",
      ai: "Repeating the same arguments can be really exhausting and frustrating. What tends to trigger these cycles?",
    },
    {
      user: "Household responsibilities mostly",
      ai: "Household responsibilities are a common source of tension. It sounds like there might be some different expectations or perceptions about fairness. What feels most unbalanced to you?",
    },
    {
      user: "I feel like I do everything and they don't notice",
      ai: "Feeling unseen in your contributions can be really painful, especially when you're putting in a lot of effort. Do you feel like I understand what you're going through?",
    },
  ],
};
```

### Per-User Header Setup
```typescript
// Source: e2e/helpers/auth.ts
export function getE2EHeaders(
  email: string,
  userId: string,
  fixtureId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-E2E-Auth-Bypass': 'true',
    'X-E2E-User-Email': email,
    'X-E2E-User-ID': userId,
  };

  if (fixtureId) {
    headers['X-E2E-Fixture-ID'] = fixtureId; // Per-user fixture
  }

  return headers;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SessionBuilder for all tests | TwoBrowserHarness for partner tests | Phase 2 (Feb 2026) | Eliminates boilerplate, validates infrastructure |
| Global E2E_FIXTURE_ID env var | Per-user X-E2E-Fixture-ID header | Phase 2 (Feb 2026) | Enables different AI responses per user |
| Text-based AI assertions | Structural assertions (testIDs) | Phase 2 (Feb 2026) | More resilient to fixture changes |
| Fixed timeouts for Ably | waitForPartnerUpdate with reload | Phase 2 (Feb 2026) | Handles variable event delivery latency |

**Deprecated/outdated:**
- **SessionBuilder for two-user tests**: TwoBrowserHarness is now standard. SessionBuilder still valid for single-user or advanced stage seeding.
- **MOCK_LLM=false in two-browser tests**: Smoke test uses real AI, but Stage 0-1 tests should use MOCK_LLM=true for speed and determinism.

## Open Questions

1. **Should Stage 0-1 tests use real AI or fixtures?**
   - What we know: Smoke test (Phase 2) uses real AI to validate end-to-end. Stage 3-4 tests (future) will use fixtures for speed.
   - What's unclear: Phase 3 tests are documentation of actual behavior. Real AI provides authentic flow, fixtures provide speed.
   - Recommendation: **Use fixtures (MOCK_LLM=true)**. Stage 0-1 flows are well-understood; fixtures are faster, more deterministic. Real AI already validated in smoke test.

2. **How should tests handle known bugs (infinite share loop, visibility race)?**
   - What we know: Additional context lists critical issues. Success criteria says "tests pass with current implementation (documenting actual behavior)."
   - What's unclear: Should tests include workarounds (extended timeouts, retries) or mark as known failures?
   - Recommendation: **Include workarounds with comments**. Tests should pass, documenting "this timeout is needed because of X bug." Creates baseline for Phase 4 fixes.

3. **Should each stage have its own test file or combined?**
   - What we know: Existing tests split by feature (reconciler paths) not by stage. Audit suggests organization by stage could be clearer.
   - What's unclear: two-browser-stage-0.spec.ts + two-browser-stage-1.spec.ts (separate) vs two-browser-stage-0-1.spec.ts (combined)?
   - Recommendation: **Separate files**. Stages 0 and 1 have distinct flows (compact signing vs. conversation). Easier to find, extend, debug.

4. **How should Ably event reliability be improved?**
   - What we know: waitForPartnerUpdate uses reload fallback. Audit Q6.2 asks "Is this a test problem or app problem?"
   - What's unclear: Should tests continue using reload workaround or should app guarantee event delivery?
   - Recommendation: **Keep reload workaround for Phase 3**. If Ably events are genuinely unreliable in production, that's a separate fix. Tests document current reality.

## Sources

### Primary (HIGH confidence)
- Codebase files:
  - `/Users/shantam/Software/meet-without-fear/e2e/tests/two-browser-smoke.spec.ts` - Validated infrastructure pattern
  - `/Users/shantam/Software/meet-without-fear/e2e/helpers/two-browser-harness.ts` - Orchestration pattern
  - `/Users/shantam/Software/meet-without-fear/e2e/helpers/test-utils.ts` - Shared utilities
  - `/Users/shantam/Software/meet-without-fear/docs/e2e-test-audit.md` - Test suite analysis
  - `/Users/shantam/Software/meet-without-fear/shared/src/enums.ts` - Stage definitions
  - `/Users/shantam/Software/meet-without-fear/shared/src/dto/stage.ts` - Stage DTOs and gates
- [Playwright Browser Contexts Documentation](https://playwright.dev/docs/browser-contexts) - Isolation patterns
- [Playwright Test Fixtures Documentation](https://playwright.dev/docs/test-fixtures) - Fixture architecture

### Secondary (MEDIUM confidence)
- [15 Best Practices for Playwright testing in 2026 | BrowserStack](https://www.browserstack.com/guide/playwright-best-practices) - Modern patterns
- [Differentiating Browser and Context in Playwright | BrowserStack](https://www.browserstack.com/guide/playwright-browser-context) - Multi-context testing
- [Fixtures in Playwright [2026] | BrowserStack](https://www.browserstack.com/guide/fixtures-in-playwright) - Custom fixtures
- [Understanding Playwright BeforeAll, BeforeEach | BrowserStack](https://www.browserstack.com/guide/playwright-before-all) - Hook patterns
- [How to Run Playwright Tests in Parallel | BrowserStack](https://www.browserstack.com/guide/playwright-parallel-test) - Parallelization strategies
- [WebSocket Testing Essentials | The Green Report](https://www.thegreenreport.blog/articles/websocket-testing-essentials-strategies-and-code-for-real-time-apps/websocket-testing-essentials-strategies-and-code-for-real-time-apps.html) - Real-time event testing

### Tertiary (LOW confidence)
- [Playwright Parallel Execution and WebSocket Architecture | Medium](https://medium.com/@chandrakalabara/playwright-series-playwright-architecture-the-power-of-websocket-for-modern-web-automation-282caee49636) - WebSocket patterns (no Ably specifics)
- [How to Run Playwright Test Sequentially | DZone](https://dzone.com/articles/execute-playwright-test-sequentially-same-browser-context) - Sequential execution (older article)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, validated in Phase 2
- Architecture: HIGH - TwoBrowserHarness, test utilities proven in smoke test
- Pitfalls: HIGH - Documented from audit, smoke test experience, CLAUDE.md guidance

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - Playwright stable, patterns validated)

**Notes:**
- No new dependencies required
- Infrastructure validated in Phase 2
- Critical: Tests document ACTUAL behavior (with bugs), not ideal behavior
- Success depends on working around known issues, not fixing them
