# Phase 2: Test Infrastructure - Research

**Researched:** 2026-02-14
**Domain:** Two-browser E2E testing with mocked LLM and real Ably WebSocket connections
**Confidence:** HIGH

## Summary

Phase 2 requires building infrastructure to run E2E tests with two simultaneous browser contexts (representing User A and User B) connected to the same session via real Ably, while using mocked LLM responses for deterministic AI behavior. The infrastructure must support navigating the full UI from scratch without database seeding for test setup.

The project already has strong foundation elements: Playwright 1.50.0, an existing fixture system with TypeScript-based mock responses, helpers for single-browser tests, and a SessionBuilder for DB seeding. The research confirms that Playwright's browser context isolation is the standard approach for multi-user testing, and the current fixture architecture (per-request `X-E2E-Fixture-ID` headers) already supports independent mock responses per user.

**Primary recommendation:** Build a `TwoBrowserHarness` class that manages two isolated browser contexts with separate fixture IDs, authentication headers, and lifecycle management. Use real Ably connections in both contexts, with helpers to wait for cross-context event delivery. Continue using the existing fixture system but with per-user fixture assignment.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.50.0 | E2E testing framework | Industry standard for modern browser automation, official Microsoft support, superior to Cypress for multi-browser scenarios |
| Ably | (via mobile app) | Real-time WebSocket messaging | Cannot mock WebSocket state synchronization reliably; real Ably connection is required to test partner interactions |
| TypeScript | 5.6.0 | Fixture definitions | Type-safe mock responses eliminate runtime fixture errors |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.4.0 | Environment variable management | Already in use for E2E config (`.env.test`) |
| devices (from Playwright) | Built-in | Mobile viewport emulation | iPhone 12 device settings for consistent mobile testing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real Ably | Mock WebSocket server | Mocking WebSocket state is complex and error-prone; real Ably proves the integration works |
| Per-request fixture headers | Global fixture via env var | Per-request headers allow different fixtures per user in same test; env var would force same fixture for all |
| Playwright | Cypress | Cypress has known limitations with multiple browser windows; Playwright explicitly designed for multi-context scenarios |

**Installation:**
No new packages required. All dependencies already present in `e2e/package.json`.

## Architecture Patterns

### Recommended Project Structure
```
e2e/
├── helpers/
│   ├── two-browser-harness.ts    # New: manages two contexts
│   ├── test-utils.ts              # Existing: waitForAIResponse, etc.
│   ├── auth.ts                    # Existing: getE2EHeaders
│   ├── session-builder.ts         # Existing: API seeding
│   └── index.ts                   # Re-exports all helpers
├── tests/
│   ├── two-browser-smoke.spec.ts  # New: proves infrastructure works
│   └── [existing tests]
└── playwright.config.ts           # Add 'two-browser-smoke' project
```

### Pattern 1: Two Browser Context Management
**What:** Create two isolated browser contexts in a single test, each with independent cookies/storage/auth
**When to use:** Testing any two-user interaction (invitation, partner messages, empathy exchange, reconciler)
**Example:**
```typescript
// Source: Playwright official docs + existing partner-journey.spec.ts
import { Browser, BrowserContext, devices } from '@playwright/test';

class TwoBrowserHarness {
  private userAContext?: BrowserContext;
  private userBContext?: BrowserContext;

  async setup(browser: Browser, request: APIRequestContext) {
    // Clean previous test data
    await cleanupE2EData();

    // Seed User A
    const userASeed = await request.post('/api/e2e/seed', {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'user-a@e2e.test', name: 'Alice' }
    });
    const userAId = (await userASeed.json()).data.userId;

    // Create isolated context for User A with fixture
    this.userAContext = await browser.newContext({
      ...devices['iPhone 12'],
      extraHTTPHeaders: getE2EHeaders(
        'user-a@e2e.test',
        userAId,
        'user-a-full-journey'  // Fixture for User A
      ),
    });
    const userAPage = await this.userAContext.newPage();

    return { userAPage, userAId };
  }

  async setupUserB(browser: Browser, request: APIRequestContext) {
    // Seed User B (after User A creates session/invitation)
    const userBSeed = await request.post('/api/e2e/seed', {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'user-b@e2e.test', name: 'Bob' }
    });
    const userBId = (await userBSeed.json()).data.userId;

    // Create isolated context for User B with DIFFERENT fixture
    this.userBContext = await browser.newContext({
      ...devices['iPhone 12'],
      extraHTTPHeaders: getE2EHeaders(
        'user-b@e2e.test',
        userBId,
        'user-b-partner-journey'  // Different fixture for User B
      ),
    });
    const userBPage = await this.userBContext.newPage();

    return { userBPage, userBId };
  }

  async teardown() {
    await this.userAContext?.close();
    await this.userBContext?.close();
  }
}
```

### Pattern 2: Per-User Fixture Assignment
**What:** Each browser context gets its own fixture ID via `X-E2E-Fixture-ID` header
**When to use:** When User A and User B need different mock AI conversations
**Example:**
```typescript
// Source: backend/src/lib/request-context.ts + e2e/helpers/auth.ts
// User A gets one fixture
const userAHeaders = getE2EHeaders(
  'user-a@e2e.test',
  userAId,
  'user-a-full-journey'
);

// User B gets a different fixture
const userBHeaders = getE2EHeaders(
  'user-b@e2e.test',
  userBId,
  'user-b-partner-journey'
);

// Backend reads fixture ID from request context
// getE2EFixtureId() returns context.e2eFixtureId ?? process.env.E2E_FIXTURE_ID
```

### Pattern 3: Waiting for Cross-Context Ably Events
**What:** Wait for Ably event to update partner's UI before verifying state
**When to use:** After any action that should trigger partner notification (message send, empathy share, etc.)
**Example:**
```typescript
// Source: e2e/tests/partner-journey.spec.ts (lines 440-477)
// User B shares context
await userBPage.getByTestId('share-button').click();

// Wait for Ably event to reach User A (with reload fallback)
const sharedContextIndicator = userAPage.getByText('Context from Bob');
const indicatorVisible = await sharedContextIndicator
  .isVisible({ timeout: 8000 })
  .catch(() => false);

if (!indicatorVisible) {
  // Ably event didn't arrive - reload to verify persistence
  console.log('Ably update not received, reloading to verify state');
  await userAPage.reload();
  await userAPage.waitForLoadState('networkidle');
}

// Verify indicator now visible (either via Ably or after reload)
await expect(sharedContextIndicator).toBeVisible({ timeout: 10000 });
```

### Pattern 4: Navigate Full UI (No DB Seeding for Test Setup)
**What:** Tests create sessions via API but navigate all UI steps (sign compact, chat, etc.)
**When to use:** Phase 2+ tests (SessionBuilder seeding is allowed only in Phase 1 audit tests)
**Example:**
```typescript
// Source: e2e/tests/live-ai-full-flow.spec.ts (lines 96-108)
// GOOD: Use API to create session, but UI for all interactions
const sessionResponse = await request.post('/api/sessions', {
  headers: userAHeaders,
  data: { inviteName: 'Bob' }
});
const sessionId = (await sessionResponse.json()).data.session.id;

await navigateToSession(userAPage, APP_BASE_URL, sessionId, userAId, userAEmail);
await signCompact(userAPage);  // UI interaction
await handleMoodCheck(userAPage);  // UI interaction
// ... continue with chat via UI

// BAD: Using SessionBuilder.startingAt('EMPATHY_SHARED_A')
// This skips UI navigation and hides bugs in stage transitions
```

### Anti-Patterns to Avoid
- **Global fixture ID:** Setting `E2E_FIXTURE_ID` env var forces all requests to use same fixture; use per-request headers instead
- **Shared browser context:** Creating pages in same context shares cookies/storage, breaking user isolation
- **DB seeding for test setup:** `SessionBuilder.startingAt()` skips UI navigation; only use API to create session, then navigate UI
- **Assuming Ably delivery:** Always have reload fallback when waiting for cross-context updates (Ably can be delayed)
- **Text-based AI response assertions:** Use testIDs and structural checks; mock fixtures can change wording

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser context isolation | Custom session management | `browser.newContext()` | Playwright contexts are fast, isolated, and handle cookies/storage/permissions automatically |
| WebSocket mocking | Mock WebSocket server | Real Ably in E2E tests | WebSocket state synchronization is complex; real Ably proves the integration works |
| Mock response selection | Runtime JSON parsing | TypeScript fixtures with type safety | Compile-time type checking prevents fixture format errors |
| Cross-browser event waiting | Manual polling loops | `waitForSelector` with timeout + reload fallback | Playwright's built-in waiting is more reliable; fallback handles network delays |
| User authentication | Cookie manipulation | `extraHTTPHeaders` with E2E auth bypass | Backend already has `E2E_AUTH_BYPASS` mode; headers are simpler than cookies |

**Key insight:** Two-browser testing is a well-solved problem in Playwright. The infrastructure exists (contexts, device emulation, header injection). The project-specific work is: (1) managing two contexts in a helper class, (2) per-user fixture assignment, (3) Ably event waiting patterns.

## Common Pitfalls

### Pitfall 1: Context Lifecycle Leaks
**What goes wrong:** Forgetting to close browser contexts causes resource leaks and can crash tests
**Why it happens:** Each context consumes memory; Playwright limits concurrent contexts
**How to avoid:** Always close contexts in `test.afterEach` or use try/finally blocks
**Warning signs:** Tests start failing after 5-10 runs, "Too many browser contexts" errors
**Example:**
```typescript
// Source: Playwright best practices
test.afterEach(async () => {
  await userAContext?.close();
  await userBContext?.close();
});
```

### Pitfall 2: Ably Event Timing Assumptions
**What goes wrong:** Tests fail intermittently because Ably events don't arrive before assertions
**Why it happens:** Network latency, Ably message routing, client reconnection
**How to avoid:** Always use timeout-based waiting + reload fallback pattern
**Warning signs:** Test passes locally but fails in CI; "Element not found" errors
**Example:**
```typescript
// BAD: Assumes immediate Ably delivery
await userBPage.click('[data-testid="share-button"]');
await expect(userAPage.getByText('Context from Bob')).toBeVisible();  // Can fail

// GOOD: Wait with timeout + reload fallback
await userBPage.click('[data-testid="share-button"]');
const visible = await userAPage.getByText('Context from Bob')
  .isVisible({ timeout: 8000 })
  .catch(() => false);
if (!visible) {
  await userAPage.reload();
}
await expect(userAPage.getByText('Context from Bob')).toBeVisible();
```

### Pitfall 3: Fixture ID Scope Confusion
**What goes wrong:** Both users get same mock responses because fixture ID is global
**Why it happens:** Setting `E2E_FIXTURE_ID` env var in playwright.config.ts webServer
**How to avoid:** Never set `E2E_FIXTURE_ID` globally; use per-request `X-E2E-Fixture-ID` headers
**Warning signs:** User B receives User A's expected AI responses
**Example:**
```typescript
// BAD: Global fixture in config
webServer: {
  env: { E2E_FIXTURE_ID: 'user-a-full-journey' }  // All requests use this
}

// GOOD: Per-request fixture headers
const userAContext = await browser.newContext({
  extraHTTPHeaders: { 'X-E2E-Fixture-ID': 'user-a-full-journey' }
});
const userBContext = await browser.newContext({
  extraHTTPHeaders: { 'X-E2E-Fixture-ID': 'user-b-partner-journey' }
});
```

### Pitfall 4: DB State Pollution Between Tests
**What goes wrong:** Second test fails because first test's data still exists in DB
**Why it happens:** `cleanupE2EData()` not called or fails silently
**How to avoid:** Call `cleanupE2EData()` in `test.beforeEach`, check for errors
**Warning signs:** First test passes, second test with same emails fails
**Example:**
```typescript
// Source: e2e/tests/partner-journey.spec.ts (line 89)
test.beforeEach(async ({ request }) => {
  await cleanupE2EData().catch(() => {});  // Ignore errors on first run
  // ... seed fresh data
});
```

### Pitfall 5: Race Condition in User B Setup
**What goes wrong:** User B context created before User A creates session/invitation
**Why it happens:** Parallel async calls without proper ordering
**How to avoid:** User B setup must happen AFTER User A creates invitation
**Warning signs:** "Invitation not found" errors for User B
**Example:**
```typescript
// BAD: Parallel setup
const [userAResult, userBResult] = await Promise.all([
  harness.setup(browser, request),
  harness.setupUserB(browser, request)  // Runs too early
]);

// GOOD: Sequential setup
const { userAPage, userAId } = await harness.setup(browser, request);
// User A creates session and invitation via UI
await createSessionAndInvitation(userAPage);
// NOW User B can be set up
const { userBPage, userBId } = await harness.setupUserB(browser, request);
```

## Code Examples

Verified patterns from official sources:

### Creating Isolated Browser Contexts
```typescript
// Source: Playwright official docs + e2e/tests/partner-journey.spec.ts
import { Browser, BrowserContext, devices } from '@playwright/test';

async function createUserContext(
  browser: Browser,
  userEmail: string,
  userId: string,
  fixtureId: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
  });
  const page = await context.newPage();
  return { context, page };
}
```

### Waiting for AI Response with Typing Indicator
```typescript
// Source: e2e/helpers/test-utils.ts (lines 201-221)
async function waitForAnyAIResponse(page: Page, timeout = 60000): Promise<void> {
  // Count current AI messages
  const initialCount = await page.locator('[data-testid^="ai-message-"]').count();

  // Poll until a new AI message appears
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentCount = await page.locator('[data-testid^="ai-message-"]').count();
    if (currentCount > initialCount) break;
    await page.waitForTimeout(500);
  }

  // Ensure typing indicator is gone (streaming complete)
  const typingIndicator = page.getByTestId('typing-indicator');
  await typingIndicator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}
```

### Per-User Fixture Headers
```typescript
// Source: backend/src/lib/request-context.ts (lines 66-72) + e2e/helpers/auth.ts
// Backend reads fixture ID from request context
export function getE2EFixtureId(): string | undefined {
  const context = getRequestContext();
  return context?.e2eFixtureId ?? process.env.E2E_FIXTURE_ID;
}

// E2E helper creates headers with fixture ID
export function getE2EHeaders(
  email: string,
  userId?: string,
  fixtureId?: string
): Record<string, string> {
  const result: Record<string, string> = {
    'x-e2e-user-id': userId ?? email.split('@')[0],
    'x-e2e-user-email': email,
  };
  if (fixtureId) {
    result['x-e2e-fixture-id'] = fixtureId;
  }
  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YAML fixtures | TypeScript fixtures | Jan 2026 (migration completed) | Type safety prevents fixture format errors; better IDE support |
| Global E2E_FIXTURE_ID env var | Per-request X-E2E-Fixture-ID header | Already in place | Allows different fixtures per user in multi-browser tests |
| SessionBuilder for test setup | Navigate full UI from scratch | Phase 2 requirement | Tests prove actual user flows work, not just seeded states |
| Single-browser tests with Ably mocked | Two-browser tests with real Ably | Phase 2 goal | Tests partner interactions that were previously untestable |

**Deprecated/outdated:**
- YAML fixtures: Replaced by TypeScript fixtures in `backend/src/fixtures/*.ts`
- SessionBuilder for test setup: Still exists for convenience but Phase 2+ tests must navigate UI
- Cypress for multi-browser: Never used; Playwright chosen from start for better multi-context support

## Open Questions

1. **Should User B's fixture responses start from index 0 or continue User A's sequence?**
   - What we know: Current fixtures have per-user storylines (user-a-full-journey, user-b-partner-journey)
   - What's unclear: Whether fixture index is global per test or per user
   - Recommendation: Keep per-user fixtures (separate files); each user's responses start at index 0

2. **How to handle mood check randomness in two-browser tests?**
   - What we know: Mood check appears randomly; tests use `handleMoodCheck()` helper
   - What's unclear: If both users get mood check simultaneously, does it block Ably delivery?
   - Recommendation: Call `handleMoodCheck()` before every Ably event wait; existing pattern is safe

3. **Should TwoBrowserHarness support SessionBuilder seeding or only from-scratch?**
   - What we know: Phase 2 requirement is "navigate full UI from scratch"
   - What's unclear: Whether convenience method for seeded state is useful for debugging
   - Recommendation: Provide both `setup()` (from scratch) and `setupBothFromSeed()` (seeded); tests use from-scratch

## Sources

### Primary (HIGH confidence)
- Playwright official docs (https://playwright.dev/docs/browser-contexts) - Browser context isolation
- Playwright API docs (https://playwright.dev/docs/api/class-browsercontext) - BrowserContext API
- Project codebase:
  - `e2e/tests/partner-journey.spec.ts` - Existing two-browser test pattern
  - `e2e/helpers/test-utils.ts` - Existing helper patterns (waitForAIResponse, createUserContext)
  - `backend/src/lib/request-context.ts` - Fixture ID extraction from headers
  - `backend/src/fixtures/types.ts` - Fixture TypeScript types

### Secondary (MEDIUM confidence)
- [Playwright Browser Contexts](https://playwright.dev/docs/browser-contexts) - Isolation guarantees
- [Multi-User Testing with Playwright Fixtures](https://medium.com/@edtang44/isolate-and-conquer-multi-user-testing-with-playwright-fixtures-f211ad438974) - Custom fixture patterns
- [WebSocket Testing Essentials](https://www.thegreenreport.blog/articles/websocket-testing-essentials-strategies-and-code-for-real-time-apps/websocket-testing-essentials-strategies-and-code-for-real-time-apps.html) - Real-time testing strategies

### Tertiary (LOW confidence)
- [Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices) - Test data management (advocates API-driven setup over DB seeding)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright 1.50.0 verified in package.json, fixture system already in use
- Architecture: HIGH - partner-journey.spec.ts demonstrates working two-browser pattern
- Pitfalls: HIGH - Documented from existing test issues (Ably timing from partner-journey.spec.ts lines 440-477)

**Research date:** 2026-02-14
**Valid until:** 60 days (Playwright stable API, no major version changes expected)
