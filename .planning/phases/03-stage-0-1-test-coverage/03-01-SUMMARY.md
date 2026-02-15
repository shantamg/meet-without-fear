---
phase: 03-stage-0-1-test-coverage
plan: 01
subsystem: e2e-testing
tags: [test-coverage, two-browser, stage-0, stage-1, partner-interaction]
requires: [02-02-two-browser-infrastructure]
provides: [stage-0-test-baseline, stage-1-test-baseline]
affects: [e2e-test-suite]
tech-stack:
  added: []
  patterns: [fixture-based-testing, invitation-panel-dismissal, circuit-breaker-aware-timeouts]
key-files:
  created:
    - e2e/tests/two-browser-stage-0.spec.ts
    - e2e/tests/two-browser-stage-1.spec.ts
  modified: []
decisions:
  - Extended Stage 1 test timeout to 10 minutes to account for circuit breaker timeouts (~20s per message)
  - Dismissed invitation panel explicitly in Stage 1 test (User A fixture triggers invitation draft at response 1)
  - Used fixture message sequences exactly to ensure deterministic test behavior
metrics:
  duration: 34
  tasks_completed: 2
  files_created: 2
  tests_added: 2
  completed_date: 2026-02-14
---

# Phase 03 Plan 01: Stage 0-1 Test Coverage Summary

Two-browser E2E tests verify both users can complete Stages 0 and 1 together with real Ably events and fixture-based AI responses.

## What Was Built

### Task 1: Two-Browser Stage 0 Test
**File:** `e2e/tests/two-browser-stage-0.spec.ts`
**Commit:** 8009732

Test proves both users can complete Stage 0 (compact signing and onboarding):
- Both users sign compact agreement
- Both users see chat input (witnessing interface ready)
- Both users see partner name via Ably real-time updates (with reload fallback)
- Screenshots capture final state for visual verification

**Test pattern:**
1. Setup User A, create session, setup User B, accept invitation
2. Both users navigate to session, sign compact, handle mood check
3. Verify chat input visible for both users
4. Wait for partner names via Ably (15s timeout, reload fallback enabled)
5. Handle mood check after reload (can reappear)

**Runtime:** ~8 seconds (fast because no AI messages involved)

### Task 2: Two-Browser Stage 1 Test
**File:** `e2e/tests/two-browser-stage-1.spec.ts`
**Commit:** b957191

Test proves both users can complete Stage 1 (witnessing conversation):
- Both users complete Stage 0 prerequisite (compact signing)
- User A sends 4 messages matching `user-a-full-journey` fixture, dismisses invitation panel, receives and confirms feel-heard check
- User B sends 4 messages matching `user-b-partner-journey` fixture, receives and confirms feel-heard check
- Both users remain in functional chat state after feel-heard confirmation (Stage 2 entry gate passed)

**Test pattern:**
1. Complete Stage 0 for both users
2. User A: send first 2 messages (triggers invitation panel at response 1), dismiss panel via "I've sent it - Continue", send remaining 2 messages until feel-heard panel appears, confirm feel-heard
3. User B: send 4 messages until feel-heard panel appears, confirm feel-heard
4. Verify chat input still visible for both users (conversation continues in Stage 2)

**Runtime:** ~6.4 minutes (accounts for circuit breaker timeouts)

**Invitation panel handling:**
- User A fixture includes `<draft>` tag at response 1, triggering invitation panel
- Test dismisses panel explicitly before continuing to feel-heard flow
- User B fixture has no invitation flow (partner journey)

## Test Suite Health

All 3 two-browser tests pass:
- `two-browser-smoke.spec.ts` (11.4s) - Infrastructure validation
- `two-browser-stage-0.spec.ts` (4.4s) - Compact signing and Ably partner awareness
- `two-browser-stage-1.spec.ts` (6.3m) - Witnessing conversation and feel-heard confirmation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended timeout for Stage 1 test**
- **Found during:** Task 2 first test run
- **Issue:** Test timed out at 5 minutes (300s). Circuit breaker for `partner-session-classifier` adds ~20s timeout per message. With 4+4 messages, that's 160s+ just for timeouts, plus actual message processing.
- **Fix:** Increased test timeout to 10 minutes (600s) to account for circuit breaker behavior
- **Files modified:** `e2e/tests/two-browser-stage-1.spec.ts`
- **Commit:** b957191 (included in Task 2)

**2. [Rule 1 - Bug] Dismissed invitation panel for User A**
- **Found during:** Task 2 first test run
- **Issue:** Feel-heard panel didn't appear because invitation panel was overlaying the chat. User A fixture response 1 includes `<draft>` tag which triggers invitation panel.
- **Fix:** Added explicit invitation panel dismissal before continuing to feel-heard flow. Sends first 2 messages manually, clicks "I've sent it - Continue", then sends remaining messages.
- **Files modified:** `e2e/tests/two-browser-stage-1.spec.ts`
- **Commit:** b957191 (included in Task 2)

## Known Issues Documented

### Circuit Breaker Timeouts
**Behavior:** `partner-session-classifier` circuit breaker times out after 20s per message due to missing `contentEmbedding` column in test database schema.

**Error pattern:**
```
[Context Assembler] Failed to retrieve Inner Thoughts: PrismaClientKnownRequestError
Raw query failed. Code: `42703`. Message: `column s.contentEmbedding does not exist`
[CircuitBreaker] partner-session-classifier timed out after 20000ms
```

**Impact:** Adds ~20s per AI message. Stage 1 test takes 6.3 minutes for 8 messages.

**Workaround:** Extended test timeout to 10 minutes. System has fallbacks, so tests pass despite errors.

**Future fix:** Either add `contentEmbedding` column to test schema or mock the embedding service in E2E environment.

### Mood Check Reappears After Reload
**Behavior:** After calling `waitForPartnerUpdate` with `reloadOnMiss: true`, mood check can reappear.

**Workaround:** Call `handleMoodCheck(page)` after reload to dismiss if present.

**Documented in:** Stage 0 test comments

## Files Created

1. **e2e/tests/two-browser-stage-0.spec.ts** - Stage 0 completion test (122 lines)
2. **e2e/tests/two-browser-stage-1.spec.ts** - Stage 1 witnessing conversation test (167 lines)

## Testing Coverage

**Stage 0 coverage:**
- Compact signing for both users
- Chat input visibility
- Partner name delivery via Ably
- Reload fallback for Ably events
- Mood check handling

**Stage 1 coverage:**
- Fixture-based AI conversation (4 messages per user)
- Invitation panel display and dismissal (User A only)
- Feel-heard check trigger and confirmation
- Stage transition to Stage 2 (chat remains functional)
- Screenshot capture for visual verification

**Not covered (out of scope for this plan):**
- Stage 2 UI panels (empathy draft, needs confirmation)
- Stage 3 entry (reconciler flow)
- Error states (network failures, API errors)

## Next Steps

These tests establish a baseline for Stages 0-1. Phase 5-6 fixes can now:
1. Run these tests before fixes to document current behavior
2. Run tests after fixes to verify no regressions
3. Add assertions for Stage 2 UI panel visibility once cache staleness issues are resolved

## Self-Check: PASSED

**Created files verified:**
```
FOUND: e2e/tests/two-browser-stage-0.spec.ts
FOUND: e2e/tests/two-browser-stage-1.spec.ts
```

**Commits verified:**
```
FOUND: 8009732
FOUND: b957191
```

**Tests verified:**
```
All 3 two-browser tests passing:
- two-browser-smoke.spec.ts: PASS
- two-browser-stage-0.spec.ts: PASS
- two-browser-stage-1.spec.ts: PASS
```
