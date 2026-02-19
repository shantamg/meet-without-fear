# E2E Test Suite Audit

This document provides an audit of the current E2E test suite for expert review.

## Executive Summary

The test suite has **27 tests** across **8 spec files**. The tests exercise the complete user journey from session creation through empathy sharing and reconciliation. There is significant overlap in test setup, with many tests repeating the same multi-step flows to reach the specific moment being tested.

## Test Inventory

### 1. homepage.spec.ts (2 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `loads and shows actual app content` | Smoke test - verifies app loads | ~1s |
| `loads within 10 seconds` | Performance baseline | ~0.5s |

**Setup Method:** None - direct page load

### 2. single-user-journey.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `new session to empathy draft` | **Full happy path** for single user: create session → sign compact → 6 chat exchanges → invitation panel → feel-heard check → empathy draft → share | ~26s |

**Setup Method:** Seeds user via API, creates session via API, then UI walkthrough

### 3. partner-journey.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `partner feels heard and sees reconciler share suggestion` | Two-user flow: User A waiting, User B accepts invitation → signs compact → 4 chat exchanges → feel-heard → reconciler → share suggestion | ~21s |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_SHARED_A')` - skips User A's entire journey

### 4. share-tab-rendering.spec.ts (3 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `User B sees shared context correctly without duplicates` | Verifies no duplicate cards in Share tab | ~1.6s |
| `User A sees received context correctly` | Verifies User A's view of shared content | ~1.5s |
| `Share tab loads correctly after page refresh` | Direct URL load test | ~1s |

**Setup Method:** `SessionBuilder.startingAt('CONTEXT_SHARED_B')` - starts at end state, **no chat UI interactions**

### 5. stage-2-empathy/reconciler/gaps-accept-share.spec.ts (3 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `sees share suggestion modal after feeling heard` | Verifies modal appears when gaps detected | ~19s |
| `can share context via the suggestion card` | Tests the share button flow | ~30s |
| `receives shared context from User B` | Tests User A sees the shared content | ~25s |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_SHARED_A')` but then **repeats 4 chat exchanges + feel-heard flow** in each test

### 6. stage-2-empathy/reconciler/no-gaps-detected.spec.ts (5 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `empathy transitions to REVEALED status after User B feels heard` | API state verification | ~23s |
| `does NOT see "partner is considering sharing" message` | Negative UI test | ~20s |
| `does NOT see share suggestion modal after feeling heard` | Negative UI test | ~19s |
| `continues to empathy building normally` | Verifies flow continues | ~24s |
| `sees partner empathy revealed in Share tab` | Share tab verification | ~23s |

**Setup Method:** Same as gaps-accept - seeds at `EMPATHY_SHARED_A`, then **repeats 4 chat exchanges + feel-heard in every test**

### 7. stage-2-empathy/reconciler/gaps-decline-share.spec.ts (5 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `sees share suggestion after feeling heard (gaps detected)` | Same as gaps-accept test 1 | ~18s |
| `can tap "No thanks" to decline sharing` | Tests decline button | ~24s |
| `can continue conversation after declining` | Flow continuation | ~28s |
| `does NOT see shared context when User B declines` | User A negative test | ~23s |
| `empathy can still be revealed after User B declines` | API state verification | ~23s |

**Setup Method:** Uses helper function but still **repeats 4 chat exchanges + feel-heard in every test**

### 8. stage-2-empathy/reconciler/gaps-refine-share.spec.ts (7 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `can tap "Edit" to enter refinement mode` | UI state test | ~19s |
| `sees refinement input with placeholder text` | UI verification | ~19s |
| `can type refinement request and send it` | Edit flow test | ~20s |
| `can cancel edit mode and return to default view` | Cancel flow | ~19s |
| `can share after refining content` | End-to-end refine+share | ~22s |
| `receives shared context after User B refines and shares` | User A verification | ~27s |
| `shared context is visible in Share tab` | Share tab verification | ~23s |

**Setup Method:** Same pattern - **repeats 4 chat exchanges + feel-heard in every test**

---

## Analysis

### Test Coverage by Stage

```
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 0: Session Creation                                           │
│   - homepage.spec.ts (smoke tests)                                  │
│   - single-user-journey.spec.ts (full flow)                         │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 1: Witnessing (Chat + Feel Heard)                             │
│   - single-user-journey.spec.ts (User A flow)                       │
│   - partner-journey.spec.ts (User B flow)                           │
│   - ALL 20 reconciler tests repeat this stage as setup              │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 2: Empathy/Reconciler                                         │
│   - gaps-accept-share.spec.ts (3 tests)                             │
│   - no-gaps-detected.spec.ts (5 tests)                              │
│   - gaps-decline-share.spec.ts (5 tests)                            │
│   - gaps-refine-share.spec.ts (7 tests)                             │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 2: Share Tab Rendering                                        │
│   - share-tab-rendering.spec.ts (3 tests, uses CONTEXT_SHARED_B)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Overlap Identified

**The 4-message chat flow (Stage 1) is repeated in 20 of 27 tests:**

```typescript
// This exact sequence appears in every reconciler test:
await chatInput.fill('Things have been tense lately');
await sendButton.click();
await waitForAIResponse(userBPage, /tension can be really draining/i);

await chatInput.fill("I feel like they don't see how much I'm dealing with");
await sendButton.click();
await waitForAIResponse(userBPage, /feeling unseen while carrying a lot/i);

await chatInput.fill("I work so hard and come home exhausted...");
await sendButton.click();
await waitForAIResponse(userBPage, /exhaustion you're describing/i);

await chatInput.fill("Months now. I don't know how to get through to them");
await sendButton.click();
await waitForAIResponse(userBPage, /Do you feel like I understand/i);

const feelHeardYes = userBPage.getByTestId('feel-heard-yes');
await feelHeardYes.click();
```

**Time cost:** ~15-18 seconds per test, ~6 minutes total for redundant chat flows.

### Current State Factory Stages

The `SessionBuilder` supports 4 stages:

| Stage | Description | Usage |
|-------|-------------|-------|
| `CREATED` | Session created, compact not signed | Not used in tests |
| `EMPATHY_SHARED_A` | User A done with Stage 1, User B at Stage 0 | Used by partner-journey, all reconciler tests |
| `FEEL_HEARD_B` | User B completed feel-heard | **Not used** |
| `CONTEXT_SHARED_B` | User B has shared context | Used by share-tab-rendering |

---

## Questions for Expert Review

### 1. Test Organization

**Q1.1:** Is the current organization (by feature/flow) optimal, or should tests be organized differently (e.g., by user perspective, by stage)?

**Q1.2:** The reconciler tests are split into 4 files (accept/decline/refine/no-gaps). Should these be:
- Combined into one file with describe blocks?
- Further split by user perspective?
- Left as-is for isolation?

### 2. Reducing Redundancy

**Q2.1:** The `FEEL_HEARD_B` stage exists in the StateFactory but isn't used. If we seeded at this stage instead of `EMPATHY_SHARED_A`, we could eliminate the repeated 4-message chat flow from 20 tests. What's the trade-off here?

**Q2.2:** Is there value in having one "full journey" test (like `single-user-journey`) alongside many "targeted" tests that seed at specific stages? Or does this create false confidence?

**Q2.3:** The current pattern has each test do its own setup via `test.beforeEach`. Would a shared setup with different assertions per test be better? For example:

```typescript
// Current: Each test sets up independently
test('sees share suggestion', async () => {
  await completeUserBStage1(); // 15 seconds
  // assert modal visible
});
test('can share', async () => {
  await completeUserBStage1(); // 15 seconds
  // assert share works
});

// Alternative: Shared setup, sequential assertions
test.describe('after User B feels heard', () => {
  test.beforeAll(async () => {
    await completeUserBStage1(); // Once
  });
  test('sees share suggestion', async () => { /* just assertions */ });
  test('can share', async () => { /* continue from previous state */ });
});
```

### 3. Missing Stages

**Q3.1:** We have Stage 0 → Stage 1 → Stage 2 coverage. What about:
- Error states (API failures, network issues)?
- Edge cases within each stage (e.g., user navigates away mid-chat)?
- Timeout scenarios?

**Q3.2:** The reconciler has 3 paths (accept/decline/refine) tested thoroughly, but what about:
- User B closes the app before responding?
- User A's session expires while waiting?
- Concurrent operations from both users?

### 4. State Factory Improvements

**Q4.1:** Should we add more granular stages to the StateFactory? For example:

| Proposed Stage | Description | Would Skip |
|----------------|-------------|------------|
| `INVITATION_SENT_A` | User A sent invitation | Compact signing |
| `COMPACT_SIGNED_B` | User B signed compact | Compact flow |
| `FEEL_HEARD_B` | Already exists | 4 chat exchanges |
| `SHARE_SUGGESTION_SHOWN_B` | Reconciler ran, modal visible | Reconciler wait |
| `SHARE_DECLINED_B` | User B declined | Decision flow |

**Q4.2:** The StateFactory creates all data in the database. Should we also seed specific UI state (e.g., "modal is already dismissed")?

### 5. Test Independence vs. Efficiency

**Q5.1:** Currently tests are fully isolated (each starts from scratch). This is safe but slow. Is there a hybrid approach that maintains isolation for critical flows but shares setup for edge case tests?

**Q5.2:** The tests run sequentially (1 worker) to avoid DB conflicts. Would sharding by session ID allow parallelization?

### 6. Test Reliability

**Q6.1:** Many tests include `waitForTimeout()` calls for Ably events. Is there a more deterministic way to wait for real-time events?

**Q6.2:** Tests occasionally reload pages when Ably updates don't arrive. Is this a test problem or an app problem that should be fixed at the source?

### 7. Fixture Strategy

**Q7.1:** We have 2 fixtures for reconciler tests (`user-b-partner-journey` for gaps, `reconciler-no-gaps` for no gaps). Should each test scenario have its own fixture, or is sharing fixtures acceptable?

**Q7.2:** Fixtures are currently identified by string IDs. Would a more typed approach (enum or const object) prevent typos and improve discoverability?

---

## Recommendations Summary

Based on this audit, here are potential improvements ranked by impact:

### High Impact
1. **Use `FEEL_HEARD_B` stage** for reconciler tests to eliminate 20 instances of repeated chat flows (~6 minutes saved)
2. **Add `SHARE_SUGGESTION_SHOWN_B` stage** to start tests right at the modal decision point

### Medium Impact
3. **Extract common helper** for the share suggestion flow (navigate to share screen, find buttons, etc.)
4. **Consolidate some reconciler tests** that test very similar things (e.g., 3 tests all verify modal appears)

### Low Impact / Further Discussion Needed
5. **Parallel test execution** with session isolation
6. **More granular StateFactory stages** for micro-scenarios
7. **Deterministic Ably event waiting** instead of timeouts

---

## Appendix: Test Timing Breakdown

| File | Tests | Total Time | Avg per Test | Setup Time % |
|------|-------|------------|--------------|--------------|
| homepage.spec.ts | 2 | ~1.5s | 0.75s | 0% |
| single-user-journey.spec.ts | 1 | ~26s | 26s | N/A (is setup) |
| partner-journey.spec.ts | 1 | ~21s | 21s | ~80% |
| share-tab-rendering.spec.ts | 3 | ~4s | 1.3s | ~10% |
| gaps-accept-share.spec.ts | 3 | ~75s | 25s | ~70% |
| no-gaps-detected.spec.ts | 5 | ~109s | 22s | ~70% |
| gaps-decline-share.spec.ts | 5 | ~116s | 23s | ~70% |
| gaps-refine-share.spec.ts | 7 | ~149s | 21s | ~70% |
| **Total** | **27** | **~8.5 min** | **19s** | **~65%** |

**Key Insight:** Approximately 65% of total test time is spent on setup that could potentially be skipped with more targeted state seeding.
