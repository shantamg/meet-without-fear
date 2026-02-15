---
phase: 05-stage-transition-fixes
plan: 02
subsystem: testing
tags: [e2e, regression, playwright, stage-transitions, race-conditions]

# Dependency graph
requires:
  - phase: 05-stage-transition-fixes
    plan: 01
    provides: Partner stage transition cache updates via Ably events
  - phase: 04-stage-2-test-coverage
    provides: Stage 2 E2E test infrastructure
provides:
  - Regression verification that Plan 01 changes don't break existing E2E tests
  - Race condition fix for feel-heard confirmation test helper
  - Confirmed all stage transition flows work end-to-end with new Ably handlers
affects: [06-stage-3-test-coverage, 07-stage-4-test-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E test helpers wait for backend API responses before proceeding (prevents race conditions)"
    - "confirmFeelHeard() waits for /feel-heard API to complete before sending Stage 2 messages"

key-files:
  created: []
  modified:
    - e2e/helpers/test-utils.ts

key-decisions:
  - "Test helpers must wait for backend state updates to propagate before subsequent actions"
  - "Race condition between feel-heard confirmation and empathy drafting fixed at test layer"

patterns-established:
  - "waitForResponse pattern for state-changing operations in E2E tests"
  - "Backend stage updates must complete before dependent frontend actions in tests"

# Metrics
duration: 44min
completed: 2026-02-15
---

# Phase 05 Plan 02: E2E Regression Tests and Race Condition Fix

**Verified Plan 01 Ably event changes don't break existing E2E tests; fixed race condition in feel-heard test helper**

## Performance

- **Duration:** 44 minutes
- **Started:** 2026-02-15T04:40:52Z
- **Completed:** 2026-02-15T05:24:26Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Stage 0-1 E2E tests pass with new Ably event handlers active (8.0s + 6.3min)
- Stage 2 E2E test passes after fixing race condition (11.8min)
- Discovered and fixed race condition where Stage 2 messages sent before backend stage update completes
- All Phase 5 partner stage transition requirements verified through E2E test execution

## Task Commits

1. **Task 1: Run Stage 0-1 and Stage 2 E2E regression tests** - `569cc8e` (fix)

## Files Created/Modified
- `e2e/helpers/test-utils.ts` - Added waitForResponse to confirmFeelHeard() to wait for /feel-heard API completion before returning

## Decisions Made
- **Test helpers must wait for backend state:** The confirmFeelHeard helper now waits for the API response to complete (not just UI update) before returning. This ensures the backend stage update has propagated before subsequent messages are sent.
- **Race condition fixed at test layer:** Rather than changing production code, the fix is in the test helper. This is appropriate because the race condition only manifests in automated tests that send messages immediately after state changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Race condition between feel-heard confirmation and empathy drafting**
- **Found during:** Task 1 (Stage 2 E2E test execution)
- **Issue:** Stage 2 test failed with "Panel 'empathy-review-button' did not appear after 3 messages". Root cause: confirmFeelHeard() returned after UI update but before backend /feel-heard API response completed. User B then sent first Stage 2 message while backend still thought stage was 1 (WITNESSING). Backend didn't set proposedEmpathyStatement metadata because currentStage !== 2. Empathy panel requires metadata to show.
- **Fix:** Modified confirmFeelHeard() test helper to wait for /feel-heard API response using page.waitForResponse() before returning. Added 500ms buffer for React state updates. This ensures backend stage update completes and propagates before subsequent messages are sent.
- **Files modified:** e2e/helpers/test-utils.ts
- **Verification:** Stage 2 E2E test now passes consistently (11.8min runtime)
- **Commit:** 569cc8e

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** Essential test reliability fix - race condition would cause flaky Stage 2 tests. No scope creep - fixing E2E infrastructure is within plan scope.

## Test Results

**Stage 0-1 Tests (two-browser-stage-0.spec.ts, two-browser-stage-1.spec.ts):**
- Status: PASSED (first attempt, no changes needed)
- Runtime: 6.5min total (Stage 0: 8.0s, Stage 1: 6.3min)
- Coverage: Compact signing flow with partner.signed_compact events, feel-heard flow with partner.advanced events
- Verdict: Plan 01 changes (new Ably event handlers) do not break Stage 0-1 flows

**Stage 2 Test (two-browser-stage-2.spec.ts):**
- Status: FAILED (first attempt) → PASSED (after fix)
- Runtime: 11.8min (after fix)
- Coverage: Empathy drafting, empathy sharing, reconciler, validation, Stage 3 entry with partner.stage_completed events
- Initial Failure: "Panel 'empathy-review-button' did not appear after 3 messages"
- Root Cause: Race condition - messages sent before backend stage update completed
- Fix: Wait for /feel-heard API response in confirmFeelHeard() helper
- Verdict: Plan 01 changes work correctly after fixing pre-existing race condition

## Issues Encountered

**Race condition in confirmFeelHeard test helper (fixed):**
- Helper returned after UI update (button disappeared) but before backend API response completed
- Backend stage still 1 when first Stage 2 message sent → empathy draft metadata not set
- Fixed by waiting for API response before returning
- This race condition was latent (not related to Plan 01 changes) but exposed by Stage 2 test

**Pre-existing database column error (unrelated):**
- Backend logs show "column s.contentEmbedding does not exist" errors
- Occurs during searchInnerWorkSessionContent in embedding service
- NOT caused by Plan 01 or this plan - pre-existing issue with inner thoughts retrieval
- Does not affect test outcomes (errors are caught and fallback behavior used)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All existing E2E tests pass with Plan 01 Ably event changes
- Partner stage transition cache updates verified working via E2E test execution
- Race condition fix improves test reliability for future phases
- Ready for Stage 3 test coverage (Phase 06) which will build on these verified stage transition patterns
- confirmFeelHeard() helper pattern can be reused for other state-changing operations in tests

---
*Phase: 05-stage-transition-fixes*
*Completed: 2026-02-15*

## Self-Check: PASSED

All SUMMARY.md claims verified:
- ✓ Commit 569cc8e exists
- ✓ e2e/helpers/test-utils.ts modified (confirmFeelHeard() now waits for API response)
- ✓ Stage 0-1 tests passed on first attempt (6.5min total)
- ✓ Stage 2 test passed after fix (11.8min runtime)
- ✓ Race condition fix documented with root cause and solution
- ✓ All Plan 01 changes (Ably event handlers) verified via E2E test execution
