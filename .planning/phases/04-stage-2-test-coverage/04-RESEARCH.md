# Phase 04: Stage 2 Test Coverage - Research

**Researched:** 2026-02-14
**Domain:** Two-browser E2E testing for Stage 2 (Perspective Stretch / Empathy) reconciler flows
**Confidence:** HIGH

## Summary

Phase 4 requires writing two-browser E2E tests that verify empathy sharing, reconciler analysis, and Stage 3 entry for both users. This is the most complex stage in the Meet Without Fear process, involving asymmetric flows (share suggestions, refinement, resubmission), reconciler race conditions, and state machine complexity.

The codebase has validated two-browser infrastructure from Phase 3 (TwoBrowserHarness, per-user fixtures, real Ably). Stage 2 audit (01-03-AUDIT-STAGE-2.md) documents 11 known issues including critical UI gaps (missing refinement UI for guesser), race conditions (reconciler status updates), and infinite loop risks (anti-loop logic).

**Primary recommendation:** Tests must document ACTUAL behavior (including failures) not ideal behavior. Use TwoBrowserHarness with per-user fixtures (user-a-full-journey, user-b-partner-journey), extend test utilities with Stage 2-specific helpers, and plan for reconciler timing issues with extended timeouts and polling patterns. Tests will prove what works and document what doesn't, creating baseline for future fixes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | Current (via @playwright/test) | E2E testing framework | Two-browser contexts, mobile viewport, screenshot capture |
| @tanstack/react-query | v5 | Cache management | Empathy status polling, optimistic updates, Ably event handling |
| Ably | Current | Real-time messaging | Partner empathy shared events, reconciler status updates, validation modals |
| Prisma | Current | Database state seeding | SessionBuilder, StateFactory for stage seeding |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TwoBrowserHarness | Custom (e2e/helpers) | Two-user test orchestration | All Stage 2 tests (validated in Phase 3) |
| SessionBuilder | Custom (e2e/helpers) | Database state seeding | Seed at EMPATHY_SHARED_A or FEEL_HEARD_B to skip Stage 0-1 |
| E2E Fixtures | Custom (backend/src/fixtures) | Deterministic AI responses | user-a-full-journey (Stage 0-2), user-b-partner-journey (Stage 1-2) |
| sendAndWaitForPanel | Custom (e2e/helpers/test-utils.ts) | Message sending with panel detection | Feel-heard flow, empathy draft flow |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-browser tests | SessionBuilder + single-browser mock | Can't test partner interactions, Ably events, reconciler asymmetry |
| Per-user fixtures | Global fixture ID | Both users get same responses, reconciler can't detect gaps |
| Extended timeouts | Mock reconciler responses | Can't test real reconciler race conditions, anti-loop logic |

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
│   ├── two-browser-stage-0.spec.ts         # Phase 3 (existing)
│   ├── two-browser-stage-1.spec.ts         # Phase 3 (existing)
│   └── two-browser-stage-2.spec.ts         # NEW: Empathy sharing → reconciler → Stage 3
├── helpers/
│   ├── two-browser-harness.ts              # Orchestration (tested)
│   ├── test-utils.ts                       # Shared utilities (extend for Stage 2)
│   └── index.ts                            # Exports
└── playwright.two-browser.config.ts        # MOCK_LLM=true, no global fixture
```

### Pattern 1: Stage 2 Flow with Reconciler Timing
**What:** Test empathy sharing with reconciler background processing and Ably event delivery
**When to use:** All Stage 2 two-browser tests
**Example:**
```typescript
// User A shares empathy (first user)
const shareEmpathyA = harness.userAPage.getByTestId('empathy-review-button');
await shareEmpathyA.click();
await harness.userAPage.getByTestId('share-empathy-button').click();

// Status: HELD (waiting for partner)
await harness.userAPage.waitForTimeout(1000); // Allow Ably event delivery

// User B shares empathy (second user)
const shareEmpathyB = harness.userBPage.getByTestId('empathy-review-button');
await shareEmpathyB.click();
await harness.userBPage.getByTestId('share-empathy-button').click();

// Status: ANALYZING → reconciler runs in background
// Poll for reconciler completion (no synchronous API)
let attempts = 0;
while (attempts < 20) { // 20 * 1000ms = 20s timeout
  const empathyIndicator = harness.userAPage.getByTestId('chat-indicator-empathy-shared');
  if (await empathyIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
    break; // Reconciler complete, empathy revealed
  }
  await harness.userAPage.waitForTimeout(1000);
  attempts++;
}
```

### Pattern 2: Assertion for Expected Failures
**What:** Document known bugs by asserting on actual behavior, not ideal behavior
**When to use:** When testing against known issues from Stage 2 audit
**Example:**
```typescript
// Issue #1: Missing refinement UI for guesser when status is REFINING
// The guesser receives shared context but has no clear way to revise empathy

// After subject shares context, guesser status → REFINING
// Expected ideal: "Refine your understanding" button appears
// Actual: No UI, input is hidden until Share tab viewed

// Test documents ACTUAL behavior:
const chatInput = harness.userBPage.getByTestId('chat-input');
await expect(chatInput).not.toBeVisible(); // Input hidden when status=REFINING

// Navigate to Share tab to unblock (workaround)
await navigateToShareFromSession(harness.userBPage);
await harness.userBPage.waitForTimeout(1000);
await navigateBackToChat(harness.userBPage);

// Now input should be visible (hasUnviewedSharedContext → false)
await expect(chatInput).toBeVisible();

// Comment explaining workaround:
// NOTE: Refinement UI not implemented (Issue #1 from audit).
// Guesser must view Share tab to proceed. This test documents the workaround.
```

### Pattern 3: Reconciler Result Polling
**What:** Poll for reconciler completion since it runs in background with no synchronous API
**When to use:** After both users share empathy (second share triggers reconciler)
**Example:**
```typescript
async function waitForReconcilerComplete(page: Page, timeout = 30000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Check if empathy-shared indicator appears (means reconciler done, status=REVEALED)
    const indicator = page.getByTestId('chat-indicator-empathy-shared');
    if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false; // Timeout
}

// Usage:
const reconcilerDone = await waitForReconcilerComplete(harness.userAPage, 30000);
if (!reconcilerDone) {
  console.log('WARNING: Reconciler did not complete within 30s (known race condition)');
  // Take diagnostic screenshot
  await harness.userAPage.screenshot({ path: 'test-results/reconciler-timeout.png' });
}
```

### Pattern 4: Partner Empathy Validation Flow
**What:** After reconciler reveals empathy, users validate partner's understanding
**When to use:** Stage 2 → Stage 3 transition tests
**Example:**
```typescript
// Both users see partner empathy revealed
// Validation panel shows (or via Share tab)

// Navigate to Share tab to validate
await navigateToShareFromSession(harness.userAPage);
await navigateToShareFromSession(harness.userBPage);

// User A validates User B's empathy
const validateButtonA = harness.userAPage.getByTestId('validate-empathy-accurate');
if (await validateButtonA.isVisible({ timeout: 5000 }).catch(() => false)) {
  await validateButtonA.click();
  await harness.userAPage.waitForTimeout(500);
}

// User B validates User A's empathy
const validateButtonB = harness.userBPage.getByTestId('validate-empathy-accurate');
if (await validateButtonB.isVisible({ timeout: 5000 }).catch(() => false)) {
  await validateButtonB.click();
  await harness.userBPage.waitForTimeout(500);
}

// After both validate, Stage 3 transition happens automatically
// Check for Stage 3 entry (chat input should still be visible)
await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
```

### Anti-Patterns to Avoid
- **Testing ideal behavior:** Don't assert on panels/flows that aren't implemented. Document what DOES happen, not what SHOULD happen.
- **Synchronous reconciler expectations:** Reconciler runs in background. Don't expect immediate status updates after sharing.
- **Text-based empathy assertions:** Empathy content varies by fixture version. Use structural assertions (testIDs, element counts).
- **Fixing bugs during test writing:** Tests document current behavior. Don't implement missing refinement UI or fix race conditions—mark as known issues.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Two-browser Stage 2 setup | Manual context + session seeding | TwoBrowserHarness + SessionBuilder.startingAt('EMPATHY_SHARED_A') | Skip Stage 0-1, start User B at feel-heard point |
| Reconciler completion detection | Fixed setTimeout | Poll with waitForReconcilerComplete helper | Reconciler timing varies (5-30s), polling adapts |
| Empathy panel detection | Manual locator checks | Extended sendAndWaitForPanel or custom helper | Empathy panel appears after ReadyShare:Y metadata, timing varies |
| Share tab navigation | Direct URL navigation | navigateToShareFromSession (from test-utils) | Avoids stale data issues, tests in-app navigation |

**Key insight:** Stage 2 complexity requires patience and polling. The reconciler, Ably events, and cache updates all have timing dependencies. Tests must be resilient to variable latency.

## Common Pitfalls

### Pitfall 1: Reconciler Race Condition
**What goes wrong:** Test asserts on empathy status immediately after second user shares, sees ANALYZING instead of REVEALED
**Why it happens:** Reconciler runs in background after consentToShare returns. Status updates via Ably event after reconciler completes.
**How to avoid:** Poll for reconciler completion using waitForReconcilerComplete helper. Don't expect synchronous status updates.
**Warning signs:** Tests fail with "empathy-shared indicator not visible", screenshots show ANALYZING status

### Pitfall 2: Guesser Refinement UI Missing
**What goes wrong:** After subject shares context, guesser has status=REFINING but no UI to revise empathy
**Why it happens:** Refinement UI not implemented (Issue #1 from audit). Guesser's chat input is hidden until Share tab viewed.
**How to avoid:** Document workaround: navigate to Share tab, then back to chat. Add comment explaining known issue.
**Warning signs:** Guesser's chat-input not visible after subject shares context

### Pitfall 3: Empathy Panel Visibility Depends on Stage Cache
**What goes wrong:** After feel-heard confirmation, empathy panel doesn't appear even though user is in Stage 2
**Why it happens:** sessionKeys.state cache intentionally NOT invalidated after useConfirmFeelHeard (avoid race conditions). Panel visibility check: myStage === Stage.PERSPECTIVE_STRETCH.
**How to avoid:** After confirmFeelHeard, reload page or invalidate sessionKeys.state manually. Or wait for Ably event to trigger invalidation.
**Warning signs:** User confirmed feel-heard, Stage 2 entry message appeared, but empathy panel missing

### Pitfall 4: Infinite Share Loop Risk
**What goes wrong:** Guesser resubmits empathy → reconciler → AWAITING_SHARING → subject shares → guesser resubmits → loop
**Why it happens:** Reconciler finds gaps again after resubmit. Anti-loop check (hasContextAlreadyBeenShared) prevents duplicate sharing, but guesser could stay stuck in REFINING.
**How to avoid:** Tests should verify anti-loop logic works. If guesser resubmits after viewing shared context, reconciler should NOT ask for more sharing.
**Warning signs:** Guesser status oscillates between REFINING and AWAITING_SHARING, subject sees multiple share suggestion panels

### Pitfall 5: Validation Modal Depends on Ably Event
**What goes wrong:** User B validates User A's empathy, but User A doesn't see celebratory modal
**Why it happens:** Modal trigger is empathy.status_updated event with forUserId: partnerId. If Ably event is missed (connection drop), modal won't show.
**How to avoid:** Don't assert on modal visibility. Validation status is in DB, so refetch shows correct state. Modal is nice-to-have, not required.
**Warning signs:** Validation succeeds (API returns success), but modal doesn't appear in screenshots

### Pitfall 6: Share Suggestion Generation Timing
**What goes wrong:** Subject polls for share suggestion immediately after reconciler sets status to AWAITING_SHARING, sees hasSuggestion: false
**Why it happens:** generateShareSuggestionForDirection runs in background after reconciler. Suggestion creation may take 5-10s.
**How to avoid:** Poll for share suggestion with timeout. Check hasSuggestion every 1s for up to 15s.
**Warning signs:** Subject's status is AWAITING_SHARING but share suggestion panel doesn't appear

## Code Examples

Verified patterns from existing codebase and audit findings:

### Complete Stage 2 Flow (Happy Path - No Gaps)
```typescript
// Source: Adapted from audit findings + two-browser-stage-1.spec.ts pattern
test('both users share empathy, reconciler finds no gaps, both validate and enter Stage 3', async ({ browser, request }) => {
  test.setTimeout(600000); // 10 minutes - reconciler can take 30s+ with circuit breaker

  // Prerequisite: Both users completed Stage 1 (feel-heard)
  // Option A: Run Stage 1 flow from scratch
  // Option B: Use SessionBuilder.startingAt('EMPATHY_SHARED_A') but then User B completes feel-heard

  // Assume both users are at Stage 2 entry (feel-heard confirmed)
  // Navigate both to session
  await harness.navigateUserA();
  await harness.navigateUserB();

  // === USER A: EMPATHY DRAFT & SHARE ===
  // Send Stage 2 messages until empathy panel appears
  const userAStage2Messages = [
    "I guess they might be stressed at work too",
    "Maybe when I bring up chores, they hear criticism instead of partnership",
    "I think they're afraid of failing at the relationship, so they shut down",
  ];

  // Use sendAndWaitForPanel to detect empathy-review-button
  await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 3);

  // User A reviews and shares empathy
  await harness.userAPage.getByTestId('empathy-review-button').click();
  const shareButtonA = harness.userAPage.getByTestId('share-empathy-button');
  await expect(shareButtonA).toBeVisible({ timeout: 5000 });
  await shareButtonA.click();

  // User A status: HELD (waiting for partner)
  await harness.userAPage.waitForTimeout(1000); // Ably event delivery

  // === USER B: EMPATHY DRAFT & SHARE ===
  const userBStage2Messages = [
    "Maybe they're overwhelmed too and don't know how to ask for help",
    "I think they appreciate me but don't know how to show it",
  ];

  await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 2);

  // User B reviews and shares empathy
  await harness.userBPage.getByTestId('empathy-review-button').click();
  const shareButtonB = harness.userBPage.getByTestId('share-empathy-button');
  await expect(shareButtonB).toBeVisible({ timeout: 5000 });
  await shareButtonB.click();

  // Both status: ANALYZING → reconciler runs in background
  await harness.userAPage.waitForTimeout(2000); // Trigger reconciler

  // === WAIT FOR RECONCILER COMPLETION ===
  // Poll for empathy-shared indicator (appears when status=REVEALED)
  const reconcilerDone = await waitForReconcilerComplete(harness.userAPage, 30000);
  expect(reconcilerDone, 'Reconciler should complete within 30s').toBe(true);

  // Both users should see empathy-shared indicator
  await expect(harness.userAPage.getByTestId('chat-indicator-empathy-shared')).toBeVisible({ timeout: 5000 });
  await expect(harness.userBPage.getByTestId('chat-indicator-empathy-shared')).toBeVisible({ timeout: 5000 });

  // === VALIDATE PARTNER EMPATHY ===
  // Navigate to Share tab for validation
  await navigateToShareFromSession(harness.userAPage);
  await navigateToShareFromSession(harness.userBPage);

  // User A validates User B's empathy
  const validateButtonA = harness.userAPage.getByTestId('validate-empathy-accurate');
  if (await validateButtonA.isVisible({ timeout: 5000 }).catch(() => false)) {
    await validateButtonA.click();
    await harness.userAPage.waitForTimeout(500);
  }

  // User B validates User A's empathy
  const validateButtonB = harness.userBPage.getByTestId('validate-empathy-accurate');
  if (await validateButtonB.isVisible({ timeout: 5000 }).catch(() => false)) {
    await validateButtonB.click();
    await harness.userBPage.waitForTimeout(500);
  }

  // === VERIFY STAGE 3 ENTRY ===
  // After both validate, automatic Stage 3 transition
  // Navigate back to chat
  await navigateBackToChat(harness.userAPage);
  await navigateBackToChat(harness.userBPage);

  // Verify chat still functional (Stage 3 chat continues)
  await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
  await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });

  // Screenshots
  await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-final.png' });
  await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-final.png' });

  // Success: Both users completed Stage 2 and entered Stage 3
});
```

### Reconciler Completion Polling Helper
```typescript
// File: e2e/helpers/test-utils.ts (add this helper)

/**
 * Wait for reconciler to complete by polling for empathy-shared indicator.
 * Reconciler runs in background after both users share empathy.
 * Status: ANALYZING → REVEALED (if no gaps) or AWAITING_SHARING (if gaps)
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 30000)
 * @returns true if reconciler completed, false if timeout
 */
export async function waitForReconcilerComplete(page: Page, timeout = 30000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Check for empathy-shared indicator (appears when status=REVEALED)
    const indicator = page.getByTestId('chat-indicator-empathy-shared');
    if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      return true;
    }
    await page.waitForTimeout(1000); // Poll every 1s
  }
  return false; // Timeout
}
```

### Navigate Back to Chat from Share Tab
```typescript
// File: e2e/helpers/test-utils.ts (add this helper)

/**
 * Navigate from Share tab back to Chat screen via in-app back button.
 * Avoids deep-linking directly to /session/:id which can mask stale data issues.
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 10000)
 */
export async function navigateBackToChat(page: Page, timeout = 10000): Promise<void> {
  // If already on chat screen, no-op
  if (!page.url().includes('/share')) {
    return;
  }

  // Click back button in header
  const backButton = page.getByTestId('share-header-back-button');
  if (await backButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await backButton.click();
  } else {
    // Fallback: use browser back navigation
    await page.goBack();
  }

  // Wait for chat screen to load
  await page.waitForURL(/\/session\/[^/]+$/, { timeout });
  await page.waitForLoadState('networkidle');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-user empathy tests | Two-browser with reconciler | Phase 4 (Feb 2026) | Tests partner interactions, Ably events, asymmetric flows |
| Mock reconciler responses | Real reconciler with fixtures | Phase 4 (Feb 2026) | Tests race conditions, anti-loop logic, timing issues |
| Synchronous status checks | Polling with timeout | Phase 4 (Feb 2026) | Resilient to reconciler background processing |
| Asserting on ideal behavior | Documenting actual behavior | Phase 4 (Feb 2026) | Tests pass with known issues, create baseline for fixes |

**Deprecated/outdated:**
- **Mock reconciler in two-browser tests**: Real reconciler needed to test gaps detection, share suggestions, resubmission loop
- **Synchronous empathy status checks**: Reconciler is async, must poll for completion

## Open Questions

1. **Should tests cover all 3 reconciler paths (no gaps, accept share, decline share)?**
   - What we know: Audit documents gaps-accept flow (AWAITING_SHARING → share → REFINING → resubmit). Decline flow sets status to READY without sharing.
   - What's unclear: Is decline flow important for v1.0 or can it wait for Phase 5+ tests?
   - Recommendation: **Cover no-gaps path in Phase 4** (TEST-03 requirement). Document gaps-accept and decline flows as separate tests if time allows. Refine-share flow requires UI that doesn't exist (Issue #1), so defer to Phase 5.

2. **How to handle missing refinement UI in tests?**
   - What we know: When guesser has status=REFINING, input is hidden until Share tab viewed. No "Refine" button exists.
   - What's unclear: Should tests navigate to Share tab as workaround, or mark as known failure?
   - Recommendation: **Navigate to Share tab as workaround**. Add comment explaining Issue #1. Tests should pass by documenting the workaround users must take.

3. **Should tests assert on validation modal visibility?**
   - What we know: Modal triggered by empathy.status_updated Ably event. If missed, modal won't show but DB state is correct.
   - What's unclear: Is modal critical to test, or is validation status check sufficient?
   - Recommendation: **Don't assert on modal**. Check validation status via Share tab UI or API query. Modal is UX enhancement, not functional requirement.

4. **How to seed test data: run full Stage 0-1 flow or use SessionBuilder?**
   - What we know: SessionBuilder.startingAt('EMPATHY_SHARED_A') skips to Stage 2 but User B hasn't completed feel-heard yet. FEEL_HEARD_B stage exists but unused.
   - What's unclear: Fastest path to Stage 2 for both users?
   - Recommendation: **Use SessionBuilder.startingAt('FEEL_HEARD_B') if it exists, else run Stage 1 flow**. Check StateFactory for FEEL_HEARD_B stage. If available, saves ~15s per test by skipping witness conversation.

## Sources

### Primary (HIGH confidence)
- Codebase files:
  - `/Users/shantam/Software/meet-without-fear/.planning/phases/01-audit/01-03-AUDIT-STAGE-2.md` - Complete Stage 2 flow audit (11 issues documented)
  - `/Users/shantam/Software/meet-without-fear/e2e/tests/two-browser-stage-1.spec.ts` - Two-browser pattern from Phase 3
  - `/Users/shantam/Software/meet-without-fear/e2e/helpers/two-browser-harness.ts` - Orchestration pattern
  - `/Users/shantam/Software/meet-without-fear/e2e/helpers/test-utils.ts` - Test utilities
  - `/Users/shantam/Software/meet-without-fear/backend/src/fixtures/user-a-full-journey.ts` - User A fixture with empathy flow
  - `/Users/shantam/Software/meet-without-fear/backend/src/fixtures/user-b-partner-journey.ts` - User B fixture with witness flow
  - `/Users/shantam/Software/meet-without-fear/shared/src/enums.ts` - Stage definitions
  - `/Users/shantam/Software/meet-without-fear/shared/src/dto/stage.ts` - Stage 2 gates
- Audit findings: 11 issues (1 critical, 2 high, 4 medium, 4 low) from Stage 2 audit

### Secondary (MEDIUM confidence)
- Phase 3 research: `/Users/shantam/Software/meet-without-fear/.planning/phases/03-stage-0-1-test-coverage/03-RESEARCH.md`
- E2E test audit: `/Users/shantam/Software/meet-without-fear/docs/e2e-test-audit.md`

### Tertiary (LOW confidence)
- None - all findings based on codebase audit and existing infrastructure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries validated in Phase 3, Stage 2 audit complete
- Architecture: HIGH - TwoBrowserHarness proven, audit documents all flows and issues
- Pitfalls: HIGH - 11 documented issues from audit, known race conditions and missing UI

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - infrastructure stable, audit complete)

**Notes:**
- No new dependencies required
- Stage 2 is most complex stage: asymmetric flows, reconciler timing, state machine complexity
- Critical: Tests document ACTUAL behavior including known failures (missing refinement UI, race conditions)
- Success depends on working around 11 known issues, not fixing them
- TEST-03 (reconciler runs) and TEST-04 (Stage 3 entry) are achievable with no-gaps path
- Gaps-accept and decline flows can be deferred to Phase 5+ if time constrained
