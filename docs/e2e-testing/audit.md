---
title: E2E Test Suite Audit
sidebar_position: 3
description: This document provides an audit of the current E2E test suite for expert review.
created: 2026-03-11
updated: 2026-03-11
status: living
---
# E2E Test Suite Audit

This document provides an audit of the current E2E test suite for expert review.

## Executive Summary

The test suite has **35 tests** across **25 spec files**. The tests exercise the complete user journey from session creation through empathy sharing, reconciliation, need mapping, and strategic repair. There is significant overlap in test setup, with many tests repeating the same multi-step flows to reach the specific moment being tested.

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
| `Share tab loads correctly when opened from chat header` | Direct URL load test | ~1s |

**Setup Method:** `SessionBuilder.startingAt('CONTEXT_SHARED_B')` - starts at end state, **no chat UI interactions**

### 5. stage-2-empathy/reconciler/gaps-detected-share-accepted.spec.ts (2 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `User B shares context after feeling heard → User A receives it and can continue` | Full accept flow: User B shares, User A receives context and chat unlocks | ~5min |
| `User A receives "Context from Partner" indicator via Ably without page reload` | Real-time Ably event verification | ~5min |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_SHARED_A')` then **repeats 4 chat exchanges + feel-heard flow** in each test

### 6. stage-2-empathy/reconciler/no-gaps-proceed-directly.spec.ts (3 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `No share suggestion shown → Both users proceed to empathy reveal` | Full no-gaps path: Stage 1 + Stage 2 empathy draft + share + mutual reveal + Share tab verification | ~5min |
| `User A does not see "partner considering sharing" message` | Negative UI test | ~5min |
| `User B can view partner empathy in Share tab after proceeding` | Share tab verification | ~5min |

**Setup Method:** Seeds at `EMPATHY_SHARED_A`, then **repeats 4 chat exchanges + feel-heard in every test**

### 7. stage-2-empathy/reconciler/gaps-detected-share-declined.spec.ts (2 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `User B declines to share → User A does not receive context, both can continue` | Full decline path: User B declines, User A has no shared context, User B continues chatting | ~5min |
| `Empathy can still be revealed after User B declines to share` | API state verification: empathy not stuck in AWAITING_SHARING | ~5min |

**Setup Method:** Uses helper function but still **repeats 4 chat exchanges + feel-heard in every test**

### 8. stage-2-empathy/reconciler/gaps-detected-share-refined.spec.ts (3 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `User B can enter edit mode, see refinement input, and cancel` | Edit mode UI: enter, verify placeholder, cancel | ~5min |
| `User B refines suggestion then shares → User A receives refined context` | End-to-end refine+share flow | ~5min |
| `Shared context appears in User A Share tab after User B refines and shares` | Share tab verification after sharing | ~5min |

**Setup Method:** Same pattern - **repeats 4 chat exchanges + feel-heard in every test**

### 9. stage-2-empathy/reconciler/no-gaps-screenshot.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Capture screenshot of validation buttons on Share screen` | Screenshot test: captures "Accurate"/"Partially"/"Off" validation buttons after no-gaps reconciler flow | ~5min |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_SHARED_A')` then repeats Stage 1 + Stage 2 chat flows

### 10. font-debug.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `inspects text element styles and font metrics` | Debug test: verifies text visibility, computed styles, and font rendering on homepage | ~15s |

**Setup Method:** Seeds user via API, direct page load

### 11. live-ai-full-flow.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `User A completes Stages 0→2 with real AI` | Full pipeline with real LLM: prompt → streaming → micro-tag parsing → SSE → frontend panels | ~15min |

**Setup Method:** `SessionBuilder.startingAt('CREATED')`, uses structural assertions (testIDs) instead of text matching

### 12. needs-confirmation-visual.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Needs confirmation in main session screen` | Visual test: screenshots of inline needs-summary card during Stage 3 | ~60s |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_REVEALED')`, triggers needs extraction via API

### 13. needs-tab-visual.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Needs tab displays needs with proper styling` | Visual test: screenshots of Needs tab with API-created needs for both users | ~60s |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_REVEALED')`, creates needs via API, navigates to Share tab

### 14. stage-3-4-complete.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Complete Stage 3-4 flow from empathy revealed state` | Full Stage 3-4: needs creation + confirmation + consent + common ground + strategies + ranking + agreement | ~3min |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_REVEALED')`, API-driven Stage 3-4 operations

### 15. transition-message-display.spec.ts (2 tests)
| Test | Purpose | Duration |
|------|---------|----------|
| `feel-heard confirmation shows transition message without additional user input` | Regression test: verifies transition message appears immediately after feel-heard (cache invalidation fix) | ~3min |
| `invitation confirmation shows transition message without additional user input` | Regression test: verifies transition message appears immediately after invitation confirmation | ~2min |

**Setup Method:** Seeds user via API, creates session via API, full UI walkthrough

### 16. two-browser-smoke.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users can connect and navigate UI` | Infrastructure validation: two browser contexts, real Ably, per-user fixtures, partner name visibility | ~5min |

**Setup Method:** `TwoBrowserHarness` with per-user fixtures, no `SessionBuilder`

### 17. two-browser-stage-0.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users sign compact and enter witnessing` | Both users complete Stage 0: compact signing, chat input visible, partner names via Ably | ~3min |

**Setup Method:** `TwoBrowserHarness`, invitation accept, compact signing

### 18. two-browser-stage-1.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users converse with AI, confirm feel-heard, and advance to Stage 2` | Both users complete Stage 1: fixture-based AI conversation, feel-heard confirmation | ~10min |

**Setup Method:** `TwoBrowserHarness`, includes Stage 0 prerequisite

### 19. two-browser-stage-2.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users share empathy, reconciler finds no gaps, both validate and enter Stage 3` | Full Stage 2: empathy drafting, sharing (A first, B triggers reconciler), no-gaps reconciler, Share tab validation | ~15min |

**Setup Method:** `TwoBrowserHarness` with `reconciler-no-gaps` fixture for User B

### 20. two-browser-stage-3.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Complete Stage 3 flow for both users` | Stage 3: needs extraction, review, confirmation, consent, common ground analysis and display | ~3min |

**Setup Method:** `SessionBuilder.startingAt('EMPATHY_REVEALED')` with `stage-3-needs` fixture

### 21. two-browser-stage-4.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `Both users complete Stage 4: strategies, ranking, overlap, and agreement` | Stage 4: strategy proposal, ready-to-rank, ranking, overlap reveal, agreement creation + confirmation | ~3min |

**Setup Method:** `SessionBuilder.startingAt('NEED_MAPPING_COMPLETE')` with `stage-4-strategies` fixture

### 22. two-browser-full-flow.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users complete full session: Stages 0-4` | Complete end-to-end: compact → feel-heard → empathy → reconciler → validation → needs → common ground → strategies → agreement | ~15min |

**Setup Method:** `TwoBrowserHarness` with `user-a-full-journey` and `reconciler-no-gaps` fixtures

### 23. two-browser-reconciler-offer-optional.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `both users decline OFFER_OPTIONAL suggestions, empathy reveals for both` | OFFER_OPTIONAL path: both users see and decline share suggestions, empathy revealed, no duplicate panels | ~15min |

**Setup Method:** `TwoBrowserHarness` with `reconciler-offer-optional` fixture for User B

### 24. two-browser-reconciler-offer-sharing-refinement.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `subject accepts sharing, context delivered to guesser, reconciler re-runs with PROCEED, accuracy feedback tested` | OFFER_SHARING path: subject accepts share suggestion, context delivered, reconciler re-runs, accuracy feedback | ~15min |

**Setup Method:** `TwoBrowserHarness` with `reconciler-refinement` fixture for User B

### 25. two-browser-circuit-breaker.spec.ts (1 test)
| Test | Purpose | Duration |
|------|---------|----------|
| `circuit breaker trips after 3 attempts, guesser sees transition message, both see empathy revealed` | Circuit breaker verification: fixture always returns OFFER_SHARING, verifies ShareTopicPanel appears | ~15min |

**Setup Method:** `TwoBrowserHarness` with `reconciler-circuit-breaker` fixture for User B

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
│   - ALL 11 reconciler tests repeat this stage as setup              │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 2: Empathy/Reconciler                                         │
│   - gaps-detected-share-accepted.spec.ts (2 tests)                  │
│   - no-gaps-proceed-directly.spec.ts (3 tests)                      │
│   - gaps-detected-share-declined.spec.ts (2 tests)                  │
│   - gaps-detected-share-refined.spec.ts (3 tests)                   │
│   - no-gaps-screenshot.spec.ts (1 test)                             │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 2: Share Tab Rendering                                        │
│   - share-tab-rendering.spec.ts (3 tests, uses CONTEXT_SHARED_B)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Overlap Identified

**The 4-message chat flow (Stage 1) is repeated in 11 of 35 tests:**

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

The `SessionBuilder` supports 8 stages:

| Stage | Description | Usage |
|-------|-------------|-------|
| `CREATED` | Session created, compact not signed | Not used in tests |
| `EMPATHY_SHARED_A` | User A done with Stage 1, User B at Stage 0 | Used by partner-journey, all reconciler tests |
| `FEEL_HEARD_B` | User B completed feel-heard | **Not used** |
| `RECONCILER_SHOWN_B` | User B felt heard, reconciler ran with significant gaps, share offer is OFFERED | **Not used** |
| `CONTEXT_SHARED_B` | User B has shared context | Used by share-tab-rendering |
| `EMPATHY_REVEALED` | Both users shared empathy and validated each other | Used by needs-confirmation-visual, needs-tab-visual, stage-3-4-complete, two-browser-stage-3 |
| `NEED_MAPPING_COMPLETE` | Stage 3: Both users identified needs and confirmed common ground | Used by two-browser-stage-4 |
| `STRATEGIC_REPAIR_COMPLETE` | Stage 4: Strategies collected, ranked, and agreement created | Not used in tests |

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

**Q4.1:** Should we add more granular stages to the StateFactory? Note that `FEEL_HEARD_B` and `RECONCILER_SHOWN_B` already exist in state-factory.ts (see table above) but are not yet used by any tests. `RECONCILER_SHOWN_B` serves the same purpose as the proposed `SHARE_SUGGESTION_SHOWN_B` below. Remaining candidates:

| Proposed Stage | Description | Would Skip | Status |
|----------------|-------------|------------|--------|
| `INVITATION_SENT_A` | User A sent invitation | Compact signing | Not yet implemented |
| `COMPACT_SIGNED_B` | User B signed compact | Compact flow | Not yet implemented |
| `FEEL_HEARD_B` | User B completed feel-heard | 4 chat exchanges | **Already exists** (unused by tests) |
| `RECONCILER_SHOWN_B` | Reconciler ran, share offer shown | Reconciler wait | **Already exists** (unused by tests) |
| `SHARE_DECLINED_B` | User B declined | Decision flow | Not yet implemented |

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
1. **Use `FEEL_HEARD_B` stage** for reconciler tests to eliminate 11 instances of repeated chat flows (stage already exists in state-factory.ts, just not used by tests)
2. **Use `RECONCILER_SHOWN_B` stage** to start tests right at the share offer decision point (stage already exists in state-factory.ts as `RECONCILER_SHOWN_B`, just not used by tests)

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
| gaps-detected-share-accepted.spec.ts | 2 | ~10min | 5min | ~70% |
| no-gaps-proceed-directly.spec.ts | 3 | ~15min | 5min | ~70% |
| gaps-detected-share-declined.spec.ts | 2 | ~10min | 5min | ~70% |
| gaps-detected-share-refined.spec.ts | 3 | ~15min | 5min | ~70% |
| no-gaps-screenshot.spec.ts | 1 | ~5min | 5min | ~70% |
| font-debug.spec.ts | 1 | ~15s | 15s | 0% |
| live-ai-full-flow.spec.ts | 1 | ~15min | 15min | ~20% |
| needs-confirmation-visual.spec.ts | 1 | ~60s | 60s | ~50% |
| needs-tab-visual.spec.ts | 1 | ~60s | 60s | ~50% |
| stage-3-4-complete.spec.ts | 1 | ~3min | 3min | ~30% |
| transition-message-display.spec.ts | 2 | ~5min | 2.5min | ~60% |
| two-browser-smoke.spec.ts | 1 | ~5min | 5min | ~50% |
| two-browser-stage-0.spec.ts | 1 | ~3min | 3min | ~30% |
| two-browser-stage-1.spec.ts | 1 | ~10min | 10min | ~60% |
| two-browser-stage-2.spec.ts | 1 | ~15min | 15min | ~40% |
| two-browser-stage-3.spec.ts | 1 | ~3min | 3min | ~30% |
| two-browser-stage-4.spec.ts | 1 | ~3min | 3min | ~30% |
| two-browser-full-flow.spec.ts | 1 | ~15min | 15min | ~20% |
| two-browser-reconciler-offer-optional.spec.ts | 1 | ~15min | 15min | ~40% |
| two-browser-reconciler-offer-sharing-refinement.spec.ts | 1 | ~15min | 15min | ~40% |
| two-browser-circuit-breaker.spec.ts | 1 | ~15min | 15min | ~40% |
| **Total** | **35** | — | — | — |

**Key Insight:** Approximately 65% of total test time is spent on setup that could potentially be skipped with more targeted state seeding.

---

## Two-Browser Testing Pattern

Two-browser tests simulate both users simultaneously in separate browser contexts:

**Configuration:** `e2e/playwright.two-browser.config.ts`
- Timeout: 900 seconds (vs 120s for single-browser)
- Uses real Ably for real-time event verification between browsers
- `TwoBrowserHarness` manages two browser contexts with separate auth headers

**Key files:**
- `e2e/playwright.two-browser.config.ts` — Configuration
- `e2e/helpers/two-browser-harness.ts` — Test harness
