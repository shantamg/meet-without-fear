---
phase: 02-test-infrastructure
plan: 02
subsystem: testing
tags: [playwright, e2e, two-browser, ably, mock-llm, fixtures]

# Dependency graph
requires:
  - phase: 02-01
    provides: TwoBrowserHarness class, waitForPartnerUpdate helper, per-user fixture infrastructure
provides:
  - Playwright config for two-browser tests with MOCK_LLM=true and per-user fixtures
  - Smoke test proving full two-browser infrastructure end-to-end
  - Template for Phase 3-4 test authors
affects: [03-stage-0-tests, 04-stage-1-2-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-browser Playwright config, full UI navigation testing, per-user fixture verification]

key-files:
  created:
    - e2e/playwright.two-browser.config.ts
    - e2e/tests/two-browser-smoke.spec.ts
  modified:
    - e2e/helpers/two-browser-harness.ts (fix: invitationId property path)

key-decisions:
  - "No global E2E_FIXTURE_ID in two-browser config - per-request headers via TwoBrowserHarness handle fixture selection"
  - "Smoke test verifies different AI responses from per-user fixtures"
  - "Full UI navigation (compact + mood check) without SessionBuilder seeding"

patterns-established:
  - "Two-browser config pattern: MOCK_LLM=true, no global fixture ID, testMatch for two-browser-*.spec.ts"
  - "Smoke test pattern: sequential setup (User A → create session → User B → accept invitation), full UI navigation"

# Metrics
duration: 11min
completed: 2026-02-14
---

# Phase 02 Plan 02: Two Browser Smoke Test Summary

**Two-browser E2E infrastructure validated end-to-end with smoke test proving independent contexts, per-user fixtures, real Ably, and full UI navigation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-14T16:02:00Z (approximately)
- **Completed:** 2026-02-14T16:13:46Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created Playwright config for two-browser tests with MOCK_LLM=true and no global fixture ID
- Implemented smoke test proving two browser contexts connect to same session via real Ably
- Verified per-user fixtures deliver different AI responses to each user
- Confirmed full UI navigation (compact, mood check, chat) works for both users independently

## Task Commits

Each task was committed atomically:

1. **Task 1: Create two-browser Playwright config** - `9706c73` (feat)
2. **Task 2: Create two-browser smoke test** - `2c1bcde` (feat)
3. **Task 3: Verify two-browser infrastructure works end-to-end** - User approved (checkpoint)

**Bug fix during Task 2:** `b06e6bb` (fix: correct invitationId property path in TwoBrowserHarness)

## Files Created/Modified
- `e2e/playwright.two-browser.config.ts` - Playwright config for two-browser tests with MOCK_LLM=true, no global E2E_FIXTURE_ID, testMatch for two-browser-*.spec.ts files
- `e2e/tests/two-browser-smoke.spec.ts` - Smoke test using TwoBrowserHarness to verify two users connect, navigate full UI, see partner names, receive different fixture-based AI responses
- `e2e/helpers/two-browser-harness.ts` - Fixed invitationId property path (was `data.invitationId`, now `data.invitation.id`)

## Decisions Made
- No global E2E_FIXTURE_ID in webServer env - per-request X-E2E-Fixture-ID headers (set by TwoBrowserHarness) handle fixture selection per user to avoid "all users get same fixture" pitfall
- Smoke test verifies both users receive different AI responses from per-user fixtures (User A gets "glad you reached out", User B gets "tension can be really draining")
- Full UI navigation pattern: no SessionBuilder stage-skipping, both users sign compact and handle mood check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invitationId property path in TwoBrowserHarness**
- **Found during:** Task 2 (Creating smoke test)
- **Issue:** `harness.acceptInvitation()` was accessing `data.invitationId` but API response structure is `data.invitation.id`
- **Fix:** Changed property access from `data.invitationId` to `data.invitation.id` in `two-browser-harness.ts`
- **Files modified:** `e2e/helpers/two-browser-harness.ts`
- **Verification:** Smoke test passed with both users connecting successfully
- **Committed in:** `b06e6bb`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix necessary for smoke test to run. No scope creep.

## Issues Encountered
None - smoke test passed on first run after fixing invitationId property path.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Two-browser test infrastructure ready for Phase 3-4 test authoring
- Template pattern established: TwoBrowserHarness + per-user fixtures + full UI navigation
- No blockers for writing Stage 0-2 partner interaction tests

## Self-Check

**Files:**
- FOUND: e2e/playwright.two-browser.config.ts
- FOUND: e2e/tests/two-browser-smoke.spec.ts

**Commits:**
- FOUND: 9706c73 (Task 1 - Create two-browser Playwright config)
- FOUND: 2c1bcde (Task 2 - Create two-browser smoke test)
- FOUND: b06e6bb (Bug fix - Correct invitationId property path)

**Result: PASSED** - All files and commits verified.
