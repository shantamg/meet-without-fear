# Phase 7: End-to-End Verification - Research

**Researched:** 2026-02-14
**Domain:** E2E test reliability, full-flow validation, test repeatability
**Confidence:** HIGH

## Summary

Phase 7 validates that all prior fixes (Phases 1-6) work together by proving both users can reliably complete Stages 0-2 and enter Stage 3 in a single test run. The core challenge is **test repeatability** — not just passing once, but passing 3 consecutive times without flakiness.

The project already has comprehensive two-browser E2E infrastructure (TwoBrowserHarness), mocked LLM fixtures for determinism, and real Ably for partner interactions. Individual stage tests (Stage 0, Stage 1, Stage 2) pass independently. The final step is composing these into one full-flow test and proving reliability through consecutive runs.

**Primary recommendation:** Create a single full-flow test that exercises the complete partner journey (both users through Stages 0→3 entry), then validate repeatability using Playwright's `--repeat-each` flag. Focus on test isolation, deterministic waits, and fixture coordination between users.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | Latest (2026) | Browser automation and E2E testing | Industry standard for modern E2E testing, excellent auto-waiting, multi-browser support |
| TwoBrowserHarness | Custom | Manages two isolated browser contexts with per-user fixtures | Already built in Phase 2, handles User A/B setup, session creation, invitation flow |
| Ably Realtime | Current | Real-time partner event delivery | Production dependency — tests must use real Ably to catch partner interaction bugs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| E2E Fixture System | Custom (TypeScript) | Deterministic AI responses per user | Already implemented, provides mocked LLM responses indexed by user and turn |
| SessionBuilder | Custom | Database seeding for test scenarios | Alternative to TwoBrowserHarness for state-seeded tests, not needed for full-flow |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real Ably | Mock Ably | Mocking would miss real partner interaction bugs (project explicitly chose real Ably in Phase 2) |
| Full UI flow | Database seeding | Seeding skips UI validation — full-flow test must navigate real UI to catch all bugs |
| Single long test | Multiple smaller tests | Phase 7 needs ONE end-to-end proof; individual stage tests already exist from Phases 3-4 |

**Installation:**
Already installed. No new dependencies required.

## Architecture Patterns

### Recommended Test Structure
```
e2e/tests/
├── two-browser-stage-0.spec.ts       # Stage 0 test (exists)
├── two-browser-stage-1.spec.ts       # Stage 1 test (exists)
├── two-browser-stage-2.spec.ts       # Stage 2 test (exists)
└── two-browser-full-flow.spec.ts     # NEW: Full Stages 0→3 entry test
```

### Pattern 1: Full-Flow Test Composition

**What:** A single test case that exercises both users from session creation through Stage 3 entry, using the same helpers/patterns as individual stage tests.

**When to use:** Phase 7 verification — proving the complete partner journey works end-to-end.

**Example structure:**
```typescript
test('both users complete Stages 0-2 and enter Stage 3', async ({ browser, request }) => {
  test.setTimeout(900000); // 15 minutes (same as Stage 2 test)

  // Setup: Create harness with asymmetric fixtures
  const harness = new TwoBrowserHarness({
    userA: { email: 'full-a@e2e.test', name: 'Shantam', fixtureId: 'user-a-full-journey' },
    userB: { email: 'full-b@e2e.test', name: 'Darryl', fixtureId: 'reconciler-no-gaps' },
  });

  await harness.cleanup();
  await harness.setupUserA(browser, request);
  await harness.createSession();
  await harness.setupUserB(browser, request);
  await harness.acceptInvitation();

  // Stage 0: Compact signing (both users)
  await harness.navigateUserA();
  await signCompact(harness.userAPage);
  await handleMoodCheck(harness.userAPage);

  await harness.navigateUserB();
  await signCompact(harness.userBPage);
  await handleMoodCheck(harness.userBPage);

  // Stage 1: User A witnessing + feel-heard
  // (send messages, dismiss invitation panel, confirm feel-heard)

  // Stage 1: User B witnessing + feel-heard
  // (send messages, confirm feel-heard)

  // Stage 2: Both users draft empathy (BEFORE sharing)
  // (User A drafts, User B drafts, then User A shares, then User B shares)

  // Wait for reconciler completion

  // Verify Stage 3 entry: chat input visible for both users
  await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
  await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();
});
```

**Source:** Based on existing two-browser-stage-2.spec.ts pattern (lines 81-332).

### Pattern 2: Test Repeatability Validation

**What:** Run the full-flow test multiple consecutive times to prove it's not flaky.

**When to use:** After full-flow test passes once, before considering Phase 7 complete.

**Command:**
```bash
cd e2e && npx playwright test --config=playwright.two-browser.config.ts \
  two-browser-full-flow.spec.ts --repeat-each=3
```

**Why 3 runs:** VERIF-02 requirement specifies "passes 3 consecutive runs without flakiness". Playwright's `--repeat-each` flag runs each test N times in a row, detecting flakiness.

**Source:** [Playwright Solutions - Loop tests to check flakiness](https://playwrightsolutions.com/in-playwright-test-is-there-an-easy-way-to-loop-the-test-multiple-times-to-check-for-flakiness/)

### Pattern 3: Asymmetric Fixture Coordination

**What:** User A and User B use different fixtures to create deterministic but realistic partner interactions.

**Why:** User A's fixture has NO reconciler operations (shares empathy first). User B's fixture has reconciler operation responses (shares second, triggers reconciler). This ensures deterministic ordering and reconciler behavior.

**Current implementation:**
- User A: `user-a-full-journey` (6 streaming responses, no operations)
- User B: `reconciler-no-gaps` (7 streaming responses + 2 operations: reconciler-analysis, reconciler-share-suggestion)

**Example from two-browser-stage-2.spec.ts (lines 56-67):**
```typescript
harness = new TwoBrowserHarness({
  userA: {
    email: 'stage2-a@e2e.test',
    name: 'Shantam',
    fixtureId: 'user-a-full-journey', // No reconciler ops
  },
  userB: {
    email: 'stage2-b@e2e.test',
    name: 'Darryl',
    fixtureId: 'reconciler-no-gaps', // Has reconciler ops
  },
});
```

**Source:** backend/src/fixtures/index.ts exports fixtureRegistry mapping fixture IDs to E2EFixture objects.

### Anti-Patterns to Avoid

- **Database seeding for full-flow test:** The goal is to validate the COMPLETE user journey through the UI. Database seeding skips critical UI paths (compact signing, invitation panel dismissal, feel-heard confirmation flows). Use TwoBrowserHarness with `startingAt('CREATED')` (or no startingAt — defaults to session creation).

- **Separate tests for each stage:** Phase 7 needs ONE full-flow test proving the complete journey. Individual stage tests (Phases 3-4) already exist for isolated validation.

- **Hard-coded timeouts with `waitForTimeout()`:** Playwright's auto-waiting is more reliable. Use `expect(locator).toBeVisible({ timeout })` and `waitForAnyAIResponse()` helper instead of arbitrary delays.

- **Retries to hide flakiness:** Disable retries (`retries: 0` in playwright.two-browser.config.ts) during flakiness investigation. Retries mask instability that should be fixed at the source.

**Source:** [Better Stack - Avoiding Flaky Tests in Playwright](https://betterstack.com/community/guides/testing/avoid-flaky-playwright-tests/)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Two-browser session setup | Manual API calls for user seeding, session creation, invitation | `TwoBrowserHarness` | Already built in Phase 2, handles cleanup, user setup, session creation, invitation acceptance, navigation |
| AI response waiting | Custom polling loops checking for message elements | `waitForAnyAIResponse()` | Existing helper (e2e/helpers/test-utils.ts:216) counts AI messages and waits for typing indicator to disappear |
| Panel waiting | Polling for panel visibility | `sendAndWaitForPanel()` | Existing helper (test-utils.ts:250) sends messages one-by-one and checks for panel after each response |
| Reconciler completion | Polling backend API | `waitForReconcilerComplete()` | Existing helper (test-utils.ts:281) polls for empathy-shared indicator on frontend |
| Fixture management | YAML parsing, file loading | E2E Fixture System | TypeScript fixtures imported as modules (backend/src/fixtures/), type-safe, no parsing overhead |

**Key insight:** Phase 2 built comprehensive test infrastructure. Phase 7 is about **composing existing pieces**, not building new test helpers.

## Common Pitfalls

### Pitfall 1: Stage 2 Message Counting Race

**What goes wrong:** When User A shares empathy, the backend generates a **transition message** delivered to User B via Ably. This extra AI message appears in User B's chat, breaking `waitForAnyAIResponse()` message counting in subsequent sends.

**Why it happens:** `waitForAnyAIResponse()` counts `[data-testid^="ai-message-"]` elements. If User A shares while User B is still sending messages, User B's AI message count increases unexpectedly (user message → AI response + transition message = off-by-one error).

**How to avoid:** Both users must **complete empathy drafting BEFORE either shares**. This ensures all AI responses are from user interactions, not partner events.

**Warning signs:** Test fails with "Panel did not appear after N messages" even though correct number of messages were sent. User B's chat shows extra AI message about "Your partner has shared their understanding of your perspective."

**Source:** CLAUDE.md lines 159-164, two-browser-stage-2.spec.ts comment lines 25-29 and 172-176.

### Pitfall 2: Playwright Config Timeout vs Test Timeout

**What goes wrong:** Test times out even though individual operations complete successfully.

**Why it happens:** Playwright has two timeout settings:
- `timeout` in playwright.config.ts (applies to ALL tests, default 30s)
- `test.setTimeout()` in individual tests (overrides config for that test)

The full-flow test requires ~15 minutes (Stage 0: ~30s, Stage 1 User A: ~2min, Stage 1 User B: ~2min, Stage 2: ~10min for 13 AI interactions + reconciler + circuit breaker delays).

**How to avoid:** Set `test.setTimeout(900000)` in the full-flow test (same as two-browser-stage-2.spec.ts line 85). Playwright config already sets `timeout: 900000` for two-browser tests (playwright.two-browser.config.ts line 22).

**Warning signs:** Test fails with "Test timeout of 30000ms exceeded" even though config shows 900000ms timeout.

**Source:** playwright.two-browser.config.ts, two-browser-stage-2.spec.ts:85.

### Pitfall 3: Fixture Response Index Misalignment

**What goes wrong:** Test expects invitation panel after 2 messages, but it appears after 1 (or 3, or never).

**Why it happens:** Fixture `responses` array is 0-indexed. If test sends 2 messages, it triggers responses[0] and responses[1]. The invitation panel appears when AI response contains `<draft>` tag. If `<draft>` is in responses[1], panel appears after the 2nd message. But if fixture was edited and `<draft>` moved to responses[2], panel won't appear until the 3rd message.

**How to avoid:**
1. Document expected panel-triggering response indices in test comments
2. Use `sendAndWaitForPanel()` with `maxAttempts` equal to total messages in fixture
3. Verify fixture structure before adding new test cases

**Warning signs:** Test fails with "Panel 'invitation-draft-panel' did not appear after N messages". Check fixture structure: `grep -A 3 "<draft>" backend/src/fixtures/user-a-full-journey.ts`.

**Source:** user-a-full-journey.ts shows `<draft>` in responses[1] (line 49), two-browser-stage-2.spec.ts sends exactly 2 messages before expecting invitation panel (lines 122-130).

### Pitfall 4: Ably Event Delivery Timing

**What goes wrong:** User B doesn't see User A's empathy-shared indicator even though User A shared successfully.

**Why it happens:** Ably events are asynchronous. When User A clicks "Share empathy", the backend updates the database, publishes an Ably event, and returns success. But User B's browser receives the Ably event after a network delay (typically 100-500ms, can be longer under load).

**How to avoid:**
1. Use `waitForReconcilerComplete()` which polls for indicator visibility (handles delay)
2. Add 2-3 second wait after User A shares before checking User B's UI (two-browser-stage-2.spec.ts line 218: `await harness.userAPage.waitForTimeout(3000)`)
3. Accept that validation UI depends on Ably timing (documented as Pitfall 5 in Phase 1 audit)

**Warning signs:** Test fails with "Reconciler did not complete within 60s" but backend logs show reconciler finished successfully. Reload fixes it (proves data is in DB, just didn't arrive via Ably).

**Source:** two-browser-stage-2.spec.ts lines 218, 235-250, Phase 1 audit Stage 2 Pitfall 5.

### Pitfall 5: Test Isolation Failures

**What goes wrong:** Test passes when run alone, fails when run after other tests.

**Why it happens:** Database state from previous test leaks into current test. E2E tests use `cleanupE2EData()` in `beforeEach`, but if previous test crashed or timed out, cleanup might not run.

**How to avoid:**
1. Always call `harness.cleanup()` in `beforeEach` (two-browser-stage-2.spec.ts line 70)
2. Use unique email addresses per test file to avoid collisions (`full-a@e2e.test`, `full-b@e2e.test` vs `stage2-a@e2e.test`)
3. Run tests with `workers: 1` to prevent parallel database conflicts (playwright.two-browser.config.ts line 29)

**Warning signs:** Test fails with "Email already exists" or "Session not found". Running test in isolation succeeds.

**Source:** [Playwright Best Practices - Test Isolation](https://playwright.dev/docs/best-practices), playwright.two-browser.config.ts.

## Code Examples

Verified patterns from official sources and existing codebase:

### Full-Flow Test Structure (Composing Existing Patterns)

```typescript
/**
 * Full two-browser E2E test: both users complete Stages 0-2 and enter Stage 3.
 *
 * This test composes patterns from individual stage tests (Phases 3-4) into
 * one end-to-end proof that the complete partner journey works reliably.
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness } from '../helpers';
import {
  signCompact,
  handleMoodCheck,
  sendAndWaitForPanel,
  confirmFeelHeard,
  waitForReconcilerComplete,
} from '../helpers/test-utils';

test.use(devices['iPhone 12']);

test.describe('Full Partner Journey: Stages 0-3', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    harness = new TwoBrowserHarness({
      userA: {
        email: 'full-flow-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'full-flow-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-no-gaps',
      },
    });

    await harness.cleanup();
    await harness.setupUserA(browser, request);
    await harness.createSession();
  });

  test.afterEach(async () => {
    await harness.teardown();
  });

  test('both users complete Stages 0-2 and enter Stage 3', async ({ browser, request }) => {
    test.setTimeout(900000); // 15 minutes

    // === STAGE 0: Both users accept invitation and sign compact ===

    await harness.setupUserB(browser, request);
    await harness.acceptInvitation();

    await harness.navigateUserA();
    await signCompact(harness.userAPage);
    await handleMoodCheck(harness.userAPage);

    await harness.navigateUserB();
    await signCompact(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // Verify both see chat input
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

    // === STAGE 1: User A witnessing and feel-heard ===

    // User A sends messages (fixture responses 0-1 trigger invitation panel)
    const userAStage1Messages = [
      "Hi, I'm having a conflict with my partner",
      'We keep arguing about household chores',
    ];

    for (let i = 0; i < userAStage1Messages.length; i++) {
      const chatInput = harness.userAPage.getByTestId('chat-input');
      await chatInput.fill(userAStage1Messages[i]);
      await harness.userAPage.getByTestId('send-button').click();
      await expect(harness.userAPage.getByTestId('typing-indicator')).not.toBeVisible({ timeout: 60000 });
      await harness.userAPage.waitForTimeout(500);
    }

    // Dismiss invitation panel
    const dismissInvitation = harness.userAPage.getByText("I've sent it - Continue");
    if (await dismissInvitation.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dismissInvitation.click();
    }

    // Continue to feel-heard (fixture response 3 has FeelHeardCheck: Y)
    const remainingMessagesA = [
      'Thanks, I sent the invitation',
      "I feel like I do most of the work and they don't notice or appreciate it",
    ];
    await sendAndWaitForPanel(harness.userAPage, remainingMessagesA, 'feel-heard-yes', 2);
    await confirmFeelHeard(harness.userAPage);

    // === STAGE 1: User B witnessing and feel-heard ===

    const userBStage1Messages = [
      'Things have been tense lately',
      "I feel like we've just been miscommunicating",
      "I want them to know I still care, even when I'm stressed",
      'Exactly. I just want us to be on the same page again',
    ];
    await sendAndWaitForPanel(harness.userBPage, userBStage1Messages, 'feel-heard-yes', 4);
    await confirmFeelHeard(harness.userBPage);

    // === STAGE 2: Both users draft empathy (BEFORE sharing) ===

    // User A empathy draft
    const userAStage2Messages = [
      'Yes, I feel heard now',
      'I guess they might be stressed from work too',
    ];
    await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);

    // User B empathy draft
    const userBStage2Messages = [
      'Yes, I feel understood',
      'I think they might be feeling frustrated too',
      'Maybe they feel like I pull away when stressed and they want to connect',
    ];
    await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

    // === STAGE 2: Both users share empathy (User A first, User B second) ===

    // User A shares
    await harness.userAPage.getByTestId('empathy-review-button').click();
    await harness.userAPage.getByTestId('share-empathy-button').click();

    // Wait for Ably event delivery
    await harness.userAPage.waitForTimeout(3000);

    // User B shares (triggers reconciler)
    await harness.userBPage.getByTestId('empathy-review-button').click();
    await harness.userBPage.getByTestId('share-empathy-button').click();

    // === Wait for reconciler completion ===

    await harness.userAPage.waitForTimeout(2000);
    const userAComplete = await waitForReconcilerComplete(harness.userAPage, 60000);
    const userBComplete = await waitForReconcilerComplete(harness.userBPage, 60000);

    if (!userAComplete || !userBComplete) {
      await harness.userAPage.screenshot({ path: 'test-results/full-flow-reconciler-timeout.png' });
      throw new Error('Reconciler did not complete within 60s');
    }

    // === VERIFY: Both users entered Stage 3 ===

    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });

    // Take final screenshots
    await harness.userAPage.screenshot({ path: 'test-results/full-flow-final-a.png' });
    await harness.userBPage.screenshot({ path: 'test-results/full-flow-final-b.png' });
  });
});
```

**Source:** Composed from two-browser-stage-0.spec.ts, two-browser-stage-1.spec.ts, two-browser-stage-2.spec.ts patterns.

### Repeatability Test Command

```bash
# Run full-flow test 3 consecutive times
cd e2e && npx playwright test --config=playwright.two-browser.config.ts \
  two-browser-full-flow.spec.ts --repeat-each=3

# Output shows each run:
# [1/3] two-browser-full-flow.spec.ts:N:M both users complete Stages 0-2 and enter Stage 3
# [2/3] two-browser-full-flow.spec.ts:N:M both users complete Stages 0-2 and enter Stage 3
# [3/3] two-browser-full-flow.spec.ts:N:M both users complete Stages 0-2 and enter Stage 3
#
# Expected: 3 passed (3) in ~45 minutes
```

**Source:** [Playwright Solutions - repeat-each flag](https://playwrightsolutions.com/in-playwright-test-is-there-an-easy-way-to-loop-the-test-multiple-times-to-check-for-flakiness/)

### Requirements Verification Checklist

```typescript
/**
 * After full-flow test passes 3 consecutive runs, verify all 18 v1 requirements.
 *
 * Run this script to cross-reference test coverage with requirements:
 */

// Pseudo-code for verification (manual checklist, not executable)
const v1Requirements = {
  // Phase 1: Audit
  'AUDIT-01': 'Documented in .planning/phases/01-audit/01-01-AUDIT-STAGE-0-1.md and 01-03-AUDIT-STAGE-2.md',
  'AUDIT-02': 'Documented in .planning/phases/01-audit/01-01-AUDIT-STAGE-0-1.md and 01-03-AUDIT-STAGE-2.md',
  'AUDIT-03': 'Documented in .planning/phases/01-audit/01-02-AUDIT-RECONCILER.md',
  'AUDIT-04': 'Documented in .planning/phases/01-audit/01-04-AUDIT-CACHE-UPDATES.md',

  // Phase 2: Test Infrastructure
  'TEST-05': 'Verified: TwoBrowserHarness uses mocked LLM (fixtures) + real Ably, navigates full UI',

  // Phase 3-4: E2E Test Coverage
  'TEST-01': 'Verified: two-browser-stage-0.spec.ts passes',
  'TEST-02': 'Verified: two-browser-stage-1.spec.ts passes',
  'TEST-03': 'Verified: two-browser-stage-2.spec.ts passes',
  'TEST-04': 'Verified: two-browser-stage-2.spec.ts verifies Stage 3 entry (chat input visible)',

  // Phase 5: Stage Transition Fixes
  'TRANS-01': 'Verified: useConfirmInvitationMessage updates sessionKeys.state cache with advancedToStage',
  'TRANS-02': 'Verified: Stage 0-1 Ably events added, E2E tests pass',
  'TRANS-03': 'Verified: useConfirmFeelHeard updates stage to PERSPECTIVE_STRETCH, E2E tests pass',
  'TRANS-04': 'Verified: Stage 2 E2E test confirms reconciler triggers and both see post-reconciliation UI',

  // Phase 6: Reconciler Fixes
  'RECON-01': 'Verified: hasContextAlreadyBeenShared guard prevents infinite loop, E2E tests pass',
  'RECON-02': 'Verified: ReconcilerResult stored in DB and queried in empathy-status.ts',
  'RECON-03': 'Verified: Stage 2 E2E test confirms both users enter Stage 3',

  // Phase 7: Verification
  'VERIF-01': 'Full two-browser E2E test passes: both users complete Stages 0-2 and enter Stage 3',
  'VERIF-02': 'Test passes 3 consecutive runs (--repeat-each=3) without flakiness',
};

// All 18 requirements satisfied when full-flow test passes 3 times
```

**Source:** .planning/REQUIREMENTS.md lines 12-41 and 78-97.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-user E2E tests | Two-browser E2E with real Ably | Phase 2 (Feb 2026) | Partner interactions now tested, catches Ably timing bugs |
| Database seeding for test setup | Full UI navigation from scratch | Phase 2 (Feb 2026) | Tests validate complete user journey, not just isolated states |
| YAML fixtures parsed at runtime | TypeScript fixtures as imported modules | Phase 2 (Feb 2026) | Type-safe, faster (no parsing), better IDE support |
| Ad-hoc test helpers in each file | Centralized test-utils.ts | Phase 2 (Feb 2026) | DRY, consistent patterns across tests |
| `waitForTimeout()` for AI responses | `waitForAnyAIResponse()` helper | Phase 2 (Feb 2026) | More reliable (counts actual messages, not arbitrary delays) |
| Post-hoc guard in triggerReconcilerForUser | Pre-execution guard in runReconcilerForDirection | Phase 6 (Feb 2026) | Prevents infinite share loop at source, simpler control flow |

**Deprecated/outdated:**
- **SessionBuilder.startingAt()** for full-flow tests: Use TwoBrowserHarness with complete UI flow instead. SessionBuilder is still valid for targeted state-seeded tests (e.g., share-tab-rendering.spec.ts testing Share tab in isolation).
- **Retries during flakiness investigation**: Set `retries: 0` when diagnosing test instability. Retries mask root causes.
- **Hard-coded 100ms retry loops**: Phase 6 eliminated ReconcilerResult visibility race by passing DB record by reference. Don't add similar retry patterns.

## Open Questions

1. **Should Phase 7 include a "stress test" run?**
   - What we know: `--repeat-each=3` proves repeatability (VERIF-02). Playwright supports `--workers=N` for parallel execution and CPU throttling for stress testing.
   - What's unclear: Is 3 consecutive runs sufficient, or should we run 10-20 times to catch rare race conditions?
   - Recommendation: Start with 3 runs (requirement baseline). If tests pass, consider 10-run validation as bonus confidence (not required for phase completion).

2. **What if full-flow test reveals new bugs?**
   - What we know: Phases 1-6 fixed known issues. Individual stage tests pass. But composing stages might expose new edge cases (e.g., state leakage between stages).
   - What's unclear: Should Phase 7 include fix tasks, or just document bugs for future phases?
   - Recommendation: If bugs are found, create minimal fix (if quick) or document as Phase 7.1 insertion. Phase 7 goal is **verification**, not extensive debugging.

3. **Should we verify all 18 requirements programmatically?**
   - What we know: Some requirements are code artifacts (TRANS-01: cache updates), some are test coverage (TEST-01: Stage 0 test exists), some are documentation (AUDIT-01: paths documented).
   - What's unclear: Manual checklist vs automated verification script.
   - Recommendation: Manual checklist referencing git commits and file paths. Most requirements already verified in prior phase VERIFICATION.md files.

## Sources

### Primary (HIGH confidence)
- **Existing codebase artifacts:**
  - e2e/tests/two-browser-stage-2.spec.ts — Full Stage 2 test pattern (lines 81-332)
  - e2e/helpers/two-browser-harness.ts — TwoBrowserHarness class (lines 1-301)
  - e2e/helpers/test-utils.ts — Test helper functions (lines 1-324)
  - backend/src/fixtures/index.ts — E2E fixture registry (lines 1-57)
  - playwright.two-browser.config.ts — Playwright config for two-browser tests (lines 1-73)
  - CLAUDE.md — Stage 2 race condition documentation (lines 159-164)

- **.planning artifacts:**
  - .planning/REQUIREMENTS.md — All 18 v1 requirements (lines 12-97)
  - .planning/ROADMAP.md — Phase 7 goals (lines 115-126)
  - .planning/phases/06-reconciler-fixes/06-VERIFICATION.md — Phase 6 verification results (lines 1-95)

### Secondary (MEDIUM confidence)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) — Official Playwright best practices documentation
- [Playwright Test Retries](https://playwright.dev/docs/test-retries) — Official retry and flakiness documentation
- [Playwright Isolation](https://playwright.dev/docs/browser-contexts) — Browser context isolation patterns
- [BrowserStack - Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices) — 15 best practices for Playwright testing
- [BrowserStack - Playwright Flaky Tests](https://www.browserstack.com/guide/playwright-flaky-tests) — How to detect and avoid flaky tests
- [Better Stack - Avoiding Flaky Tests](https://betterstack.com/community/guides/testing/avoid-flaky-playwright-tests/) — Community guide to flaky test prevention
- [Playwright Solutions - Repeat Each](https://playwrightsolutions.com/in-playwright-test-is-there-an-easy-way-to-loop-the-test-multiple-times-to-check-for-flakiness/) — Using --repeat-each flag to test for flakiness

### Tertiary (LOW confidence)
- [Testing Strategies 2026](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies) — Full-stack testing composition (unit/integration/E2E balance)
- [Integration vs E2E Testing](https://www.getautonoma.com/blog/integration-vs-e2e-testing) — When to use each test type
- [Playwright WebSocket Testing](https://dzone.com/articles/playwright-for-real-time-applications-testing-webs) — Real-time application testing patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure already built and verified in Phases 2-6
- Architecture: HIGH - Patterns extracted from existing passing tests
- Pitfalls: HIGH - Documented from actual Phase 1-6 debugging experience
- Repeatability patterns: MEDIUM - --repeat-each flag documented by Playwright community, not official docs

**Research date:** 2026-02-14
**Valid until:** 60 days (April 2026) — Phase 7 is final verification phase, no fast-moving dependencies
