# Technology Stack: Playwright Screenshot Verification & Reconciler Testing

**Project:** Meet Without Fear - Subsequent Milestone
**Researched:** 2026-02-15
**Focus:** Stack additions for Playwright screenshot capture, visual verification, and reconciler state machine testing

## Executive Summary

**Verdict:** NO new dependencies required. Playwright 1.50.0 already includes all necessary capabilities for screenshot capture, visual comparison, and state transition testing.

**Key Finding:** The project already has the complete stack for the new features. Playwright's built-in `toHaveScreenshot()` API, existing test helpers, and two-browser harness provide everything needed for visual regression testing and reconciler edge case coverage.

## Recommended Stack (Existing - No Changes)

### Visual Testing

| Technology | Current Version | Purpose | Why No Change Needed |
|------------|-----------------|---------|---------------------|
| Playwright | 1.50.0 | E2E test runner with built-in visual testing | Already includes `toHaveScreenshot()`, `page.screenshot()`, pixelmatch comparison, and all necessary configuration options |
| Pixelmatch | (bundled) | Pixel comparison engine | Automatically used by Playwright's `toHaveScreenshot()` - no separate installation needed |

### State Machine Testing

| Technology | Current Version | Purpose | Why No Change Needed |
|------------|-----------------|---------|---------------------|
| TypeScript | 5.7-5.9 | Type-safe state transitions | Existing type system already enforces reconciler state machine transitions |
| Playwright | 1.50.0 | Async state transition verification | Built-in auto-waiting and assertion retries handle async state changes |
| Jest | 29.7.0 | Unit test state machine logic | Backend unit tests can verify reconciler state transitions in isolation |

### Test Infrastructure (Already Exists)

| Component | Location | Purpose |
|-----------|----------|---------|
| Two-Browser Harness | `e2e/helpers/two-browser-harness.ts` | Parallel user contexts for reconciler testing |
| SessionBuilder | `e2e/helpers/session-builder.ts` | State factory for starting at specific reconciler states |
| Test Fixtures | `e2e/helpers/*.ts` | Mocked LLM responses for deterministic reconciler outcomes |
| Screenshot Directory | `e2e/test-results/` (existing), `e2e/screenshots/` (can be added) | Screenshot storage |

## What NOT to Add

### ❌ Avoid These Tools

| Tool | Why NOT Needed |
|------|---------------|
| Percy | Third-party visual testing SaaS - Playwright's built-in comparison is sufficient for this project's needs |
| Applitools | Another SaaS visual testing tool - overkill for internal E2E tests with controlled fixtures |
| BackstopJS | Separate visual regression tool - redundant with Playwright's native capabilities |
| Chromatic | Storybook-based visual testing - project doesn't use Storybook, Playwright handles visual testing |
| jest-image-snapshot | Jest plugin for screenshots - E2E tests use Playwright, not Jest |
| XState | State machine library - reconciler state machine is simple (4 outcomes), doesn't need a full library |
| robot3 | State machine library - same reason as XState |
| TypeState | TypeScript FSM library - reconciler logic is already type-safe, adding FSM library is over-engineering |

### Why Built-In Playwright is Sufficient

1. **Already Installed**: Playwright 1.50.0 is in `e2e/package.json`
2. **Feature-Complete**: Includes screenshot capture, pixel comparison, baseline management, and diff generation
3. **No External Dependencies**: Everything runs locally, no third-party services required
4. **Version Controlled**: Baseline images stored in git alongside tests
5. **Integrated Workflow**: Works seamlessly with existing two-browser test harness

## Playwright Visual Testing Capabilities (Built-In)

### Screenshot Capture API

```typescript
// Full page screenshot
await page.screenshot({ path: 'test-results/my-screenshot.png' });

// Element screenshot
await locator.screenshot({ path: 'test-results/element.png' });

// With custom styling (hide dynamic elements)
await page.screenshot({
  path: 'test-results/masked.png',
  mask: [page.locator('.timestamp'), page.locator('.animation')],
  animations: 'disabled',
});
```

**Available Options** (all built-in to Playwright 1.50.0):
- `animations`: `"disabled"` | `"allow"` - Stops CSS animations/transitions (default: `"disabled"`)
- `caret`: `"hide"` | `"initial"` - Hides text caret (default: `"hide"`)
- `clip`: `{ x, y, width, height }` - Capture specific region
- `fullPage`: boolean - Capture entire scrollable page (default: `false`)
- `mask`: Locator[] - Elements to overlay with mask color
- `maskColor`: string - CSS color for masks (default: `"#FF00FF"`)
- `omitBackground`: boolean - Remove white background for transparency
- `scale`: `"css"` | `"device"` - Pixel density
- `stylePath`: string | string[] - Apply custom CSS during capture (NEW in 1.50)
- `style`: string - Inline CSS to apply (NEW in 1.50)

### Visual Comparison API

```typescript
// Visual regression assertion
await expect(page).toHaveScreenshot('validation-buttons.png', {
  maxDiffPixels: 100,           // Allow up to 100 different pixels
  threshold: 0.2,               // YIQ color difference tolerance (0-1)
  animations: 'disabled',       // Stop animations before capture
  mask: [page.locator('.timestamp')], // Hide dynamic content
});

// Element-level comparison
await expect(page.locator('.share-tab')).toHaveScreenshot('share-tab.png');
```

**Tolerance Configuration Options**:
- `maxDiffPixels`: number - Acceptable pixel difference count
- `maxDiffPixelRatio`: number - Acceptable difference ratio (0-1)
- `threshold`: number - YIQ color space tolerance (0 = strict, 1 = lax, default: 0.2)

### Baseline Management

**First Run:** Generates baseline in `<test-file>-snapshots/` directory
```
e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts
e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts-snapshots/
  └── validation-buttons-chromium-darwin.png
```

**Update Baselines:**
```bash
# Regenerate all baselines
npx playwright test --update-snapshots

# Update specific test
npx playwright test no-gaps-screenshot --update-snapshots
```

**Cross-Platform Handling:** Playwright automatically manages separate baselines per browser-platform combination (e.g., `chromium-darwin.png`, `chromium-linux.png`).

### Diff Generation (Automatic)

When visual tests fail, Playwright automatically generates:
1. **Actual screenshot** - Current test run output
2. **Expected screenshot** - Baseline image
3. **Diff image** - Highlighted differences in red

All saved to `test-results/` and viewable in Playwright's HTML report.

## Configuration for Visual Testing

### Playwright Config Updates (Recommended)

Add to `e2e/playwright.config.ts`:

```typescript
export default defineConfig({
  // ... existing config

  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      // Global defaults for visual comparisons
      maxDiffPixels: 100,          // Allow minor rendering differences
      threshold: 0.2,              // Default YIQ tolerance
      animations: 'disabled',      // Always disable animations
      caret: 'hide',               // Hide text cursor
    },
  },

  use: {
    screenshot: 'only-on-failure', // Capture on failure for debugging
    video: 'retain-on-failure',    // Keep videos only when tests fail
    viewport: { width: 375, height: 667 }, // iPhone 12 (already configured)
    trace: 'on',                   // Already configured
  },
});
```

**Note:** Current config already has `screenshot: 'on'` and `video: 'on'`. For visual regression tests, change to `'only-on-failure'` to reduce storage.

### Snapshot Directory Organization

```
e2e/
├── tests/
│   └── stage-2-empathy/reconciler/
│       ├── no-gaps-screenshot.spec.ts
│       └── no-gaps-screenshot.spec.ts-snapshots/
│           └── empathy-validation-buttons-chromium-darwin.png
├── screenshots/          # Manual screenshots (e.g., no-gaps-screenshot.spec.ts uses this)
│   └── empathy-validation-buttons.png
└── test-results/         # Test run artifacts (actual/diff images on failure)
    ├── no-gaps-screenshot-chromium/
    │   ├── empathy-validation-buttons-actual.png
    │   ├── empathy-validation-buttons-expected.png
    │   └── empathy-validation-buttons-diff.png
    └── *.png             # Ad-hoc screenshots from page.screenshot()
```

**Recommendation:** Use `toHaveScreenshot()` for visual regression (baselines in `-snapshots/` dir) instead of manual `page.screenshot()` (outputs to `test-results/`).

## Reconciler State Machine Testing Patterns

### State Transitions (No New Tools Needed)

The reconciler has 4 outcomes based on LLM analysis:

```typescript
type ReconcilerAction =
  | 'PROCEED'           // NO_GAPS - advance to next stage
  | 'OFFER_OPTIONAL'    // MINOR gaps - optional context sharing
  | 'OFFER_SHARING'     // SIGNIFICANT gaps - recommend sharing

type ShareOfferStatus =
  | 'NOT_OFFERED'
  | 'OFFERED'
  | 'ACCEPTED'         // User shares context → guesser refines empathy
  | 'DECLINED'         // User declines → empathy revealed as-is
  | 'SKIPPED'
```

### Test Coverage Strategy (Using Existing Tools)

**E2E Tests** (via Playwright + Two-Browser Harness):
```typescript
// e2e/tests/stage-2-empathy/reconciler/
├── no-gaps-proceed-directly.spec.ts          // PROCEED path
├── gaps-detected-share-accepted.spec.ts      // OFFER_SHARING → ACCEPTED
├── gaps-detected-share-declined.spec.ts      // OFFER_SHARING → DECLINED
└── gaps-detected-share-refined.spec.ts       // ACCEPTED → refine → resubmit
```

**Unit Tests** (via Jest on backend):
```typescript
// backend/src/services/__tests__/reconciler.test.ts
describe('Reconciler State Machine', () => {
  it('returns PROCEED when alignment >= 80', async () => {
    // Test reconciler logic directly
  });

  it('returns OFFER_SHARING when gaps.severity === SIGNIFICANT', async () => {
    // Test state transitions in isolation
  });

  it('prevents infinite loop when context already shared', async () => {
    // Test hasContextAlreadyBeenShared guard
  });
});
```

### Async State Transition Testing (Playwright's Built-In Capabilities)

Playwright's **auto-waiting** handles async state changes automatically:

```typescript
// Wait for reconciler to process and update UI
await expect(page.getByTestId('share-suggestion-modal')).toBeVisible({ timeout: 15000 });

// Verify state transition via API
const response = await request.get(`/api/sessions/${sessionId}/reconciler`);
const data = await response.json();
expect(data.recommendation.action).toBe('OFFER_SHARING');
```

**Key Playwright Features for State Testing**:
- **Auto-waiting**: Assertions retry until condition is true or timeout
- **Network idle**: `page.waitForLoadState('networkidle')` waits for async operations
- **API assertions**: Use `request` fixture to verify backend state
- **Conditional visibility**: `expect(locator).toBeVisible()` handles eventual visibility

## Integration with Existing Infrastructure

### Two-Browser Harness (Already Exists)

The `TwoBrowserHarness` class already supports reconciler testing:

```typescript
// e2e/helpers/two-browser-harness.ts
const harness = new TwoBrowserHarness({
  userA: { email: 'alice@e2e.test', name: 'Alice' },
  userB: { email: 'bob@e2e.test', name: 'Bob' },
  startingState: 'EMPATHY_SHARED_A',
  fixtureId: 'reconciler-gaps-detected',
});

await harness.setup(browser, request);

// Both users' pages are available
await harness.userAPage.screenshot({ path: 'user-a.png' });
await harness.userBPage.screenshot({ path: 'user-b.png' });

// Visual regression on both sides
await expect(harness.userBPage).toHaveScreenshot('share-suggestion.png');
```

### SessionBuilder State Factories (Already Exists)

```typescript
// Start at specific reconciler state
const setup = await new SessionBuilder()
  .userA('alice@e2e.test', 'Alice')
  .userB('bob@e2e.test', 'Bob')
  .startingAt('EMPATHY_SHARED_A')  // User A shared empathy, User B ready to trigger reconciler
  .setup(request);
```

**Available Starting States** (from existing implementation):
- `CREATED` - Session created, no progress
- `COMPACT_SIGNED` - Both signed compact
- `FEEL_HEARD_A` - User A confirmed feel-heard
- `FEEL_HEARD_BOTH` - Both confirmed feel-heard
- `EMPATHY_SHARED_A` - User A shared empathy (reconciler can trigger when B completes Stage 1)
- `EMPATHY_REVEALED` - Both empathy attempts validated (Stage 3 ready)

### Test Fixture Pattern (Already Exists)

Deterministic reconciler outcomes via mocked LLM responses:

```typescript
// backend/src/fixtures/reconciler-no-gaps.ts
export const reconcilerNoGapsFixture = {
  recommendation: {
    action: 'PROCEED',
    rationale: 'Excellent alignment',
    sharingWouldHelp: false,
  },
  gaps: {
    severity: 'none',
    summary: 'No gaps detected',
    missedFeelings: [],
    misattributions: [],
  },
};
```

**Usage in Tests**:
```typescript
// Test passes fixture ID via header
const FIXTURE_ID = 'reconciler-no-gaps';

const context = await browser.newContext({
  extraHTTPHeaders: getE2EHeaders(userEmail, userId, FIXTURE_ID),
});
```

Backend reads `X-E2E-Fixture-ID` header and returns fixture instead of calling LLM.

## Installation (None Required)

**Current Package Versions** (from `e2e/package.json`):
```json
{
  "devDependencies": {
    "@playwright/test": "^1.50.0",  // ✅ Already includes visual testing
    "@types/node": "^22.10.0",
    "dotenv": "^16.4.0",
    "typescript": "^5.6.0"
  }
}
```

**No new packages needed.** All capabilities are built-in.

## Workflow for Adding Visual Tests

### 1. Create Baseline Screenshots

```bash
# First run generates baselines
cd e2e
npx playwright test no-gaps-screenshot.spec.ts
```

Baselines are saved to `<test-file>-snapshots/` directory and should be committed to git.

### 2. Write Visual Assertions

```typescript
// e2e/tests/stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts
test('shows validation buttons after no-gaps reconciler', async ({ page }) => {
  // Navigate to Share page
  await navigateToShareFromSession(page, APP_BASE_URL, sessionId, userId);

  // Wait for reconciler to complete
  await expect(page.getByTestId('empathy-validation-accurate')).toBeVisible();

  // Visual regression assertion
  await expect(page).toHaveScreenshot('empathy-validation-buttons.png', {
    clip: { x: 0, y: 0, width: 375, height: 200 }, // Capture top portion only
    mask: [page.locator('.timestamp')],            // Hide dynamic timestamp
  });
});
```

### 3. Update Baselines When UI Changes

```bash
# After intentional UI changes
npx playwright test --update-snapshots
```

### 4. Review Diffs in CI/Local

```bash
# View HTML report with visual diffs
npx playwright show-report
```

## Reconciler Edge Cases to Cover

Based on existing tests and implementation:

| Test Case | File | Coverage |
|-----------|------|----------|
| **NO_GAPS** - Proceed directly | `no-gaps-proceed-directly.spec.ts` | ✅ Exists |
| **GAPS_FOUND** - Share accepted | `gaps-detected-share-accepted.spec.ts` | ✅ Exists |
| **GAPS_FOUND** - Share declined | `gaps-detected-share-declined.spec.ts` | ✅ Exists |
| **GAPS_FOUND** - Refine empathy | `gaps-detected-share-refined.spec.ts` | ✅ Exists |
| **Visual verification** - Validation buttons | `no-gaps-screenshot.spec.ts` | ✅ Exists |
| **State machine loop prevention** | Backend unit test | ⚠️ TODO |
| **Concurrent refinement handling** | E2E test | ⚠️ TODO |
| **Share offer timeout** | E2E test | ⚠️ TODO |

**Recommendation:** Add backend unit tests for state machine guards (e.g., `hasContextAlreadyBeenShared`) to prevent infinite loops.

## Sources

### Official Documentation
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright SnapshotAssertions API](https://playwright.dev/docs/api/class-snapshotassertions)
- [Playwright PageAssertions API](https://playwright.dev/docs/api/class-pageassertions)

### Implementation Guides (2026)
- [Visual Regression Testing with Playwright Snapshots](https://nareshit.com/blogs/visual-regression-testing-with-playwright-snapshots)
- [How to Implement Playwright Visual Testing](https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view)
- [Playwright Visual Testing: A Complete Guide](https://testdino.com/blog/playwright-visual-testing/)
- [Snapshot Testing with Playwright in 2026](https://www.browserstack.com/guide/playwright-snapshot-testing)
- [Mastering Visual Testing with Playwright](https://jignect.tech/mastering-visual-testing-with-playwright-a-step-by-step-guide/)

### State Machine Testing
- [Composable State Machines in TypeScript](https://medium.com/@MichaelVD/composable-state-machines-in-typescript-type-safe-predictable-and-testable-5e16574a6906)
- [How to Build Type-Safe State Machines in TypeScript](https://oneuptime.com/blog/post/2026-01-30-typescript-type-safe-state-machines/view)
- [Guide to Playwright end-to-end testing in 2026](https://www.deviqa.com/blog/guide-to-playwright-end-to-end-testing-in-2025/)
- [How to Configure E2E Testing with Playwright](https://oneuptime.com/blog/post/2026-01-25-e2e-testing-with-playwright/view)

---

**Summary:** The existing stack is complete. Playwright 1.50.0's built-in visual testing capabilities, combined with the project's two-browser harness and fixture system, provide everything needed for screenshot verification and reconciler state machine testing. No new dependencies required.
