---
phase: 02-test-infrastructure
plan: 01
subsystem: e2e-testing
tags: [infrastructure, two-browser, ably, fixtures]
dependency_graph:
  requires: [e2e/helpers/auth.ts, e2e/helpers/cleanup.ts, e2e/helpers/test-utils.ts]
  provides: [e2e/helpers/two-browser-harness.ts]
  affects: [e2e-test-infrastructure]
tech_stack:
  added: []
  patterns: [two-browser-harness, per-user-fixtures, ably-event-synchronization]
key_files:
  created:
    - e2e/helpers/two-browser-harness.ts
  modified:
    - e2e/helpers/index.ts
decisions: []
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  completed_at: "2026-02-14T23:59:44Z"
---

# Phase 02 Plan 01: Two Browser Harness Summary

**One-liner:** TwoBrowserHarness class with per-user fixture IDs and waitForPartnerUpdate helper for Ably event synchronization.

## What Was Built

Created the foundational two-browser testing infrastructure that will be used by all Phase 3-4 E2E tests:

1. **TwoBrowserHarness class** - Manages two isolated browser contexts with per-user fixture IDs
   - `setupUserA(browser, request)` - Seeds User A and creates context at position (0, 0)
   - `setupUserB(browser, request)` - Seeds User B and creates context at position (450, 0) for side-by-side viewing
   - `createSession()` - Creates session as User A, extracts sessionId and invitationId via `responseData.data.session.id` and `responseData.data.invitation.id`
   - `acceptInvitation()` - Accepts invitation as User B using stored invitationId
   - `navigateUserA()` / `navigateUserB()` - Navigate to session page with E2E params
   - `cleanup()` - Cleans E2E database via cleanupE2EData()
   - `teardown()` - Safely closes both browser contexts

2. **waitForPartnerUpdate helper** - Handles Ably event timing with reload fallback
   - Waits for locator visibility with configurable timeout (default 8000ms)
   - On miss, optionally reloads page, handles mood check, and retries
   - Returns boolean indicating whether element became visible

3. **Exported from helpers index** - TwoBrowserHarness, waitForPartnerUpdate, and TwoBrowserConfig type

## Implementation Details

**Per-user fixture IDs:**
- Each user gets their own fixture ID (passed in config)
- Fixture IDs are included in E2E headers via `getE2EHeaders(email, userId, fixtureId)`
- Enables deterministic AI responses per user in two-browser tests

**Session ID extraction:**
Uses exact property paths (not destructuring) for unambiguous extraction:
```typescript
const responseData = await response.json();
this.sessionId = responseData.data.session.id;
this.invitationId = responseData.data.invitation.id;
```

**Reuses existing infrastructure:**
- `createUserContext()` from test-utils.ts for context creation
- `getE2EHeaders()` from auth.ts for API headers
- `navigateToSession()` from test-utils.ts for navigation
- `cleanupE2EData()` from cleanup.ts for database cleanup
- `handleMoodCheck()` from test-utils.ts in reload fallback

**Browser positioning:**
- User A at (0, 0) and User B at (450, 0) for headed mode side-by-side viewing
- Both use iPhone 12 viewport via createUserContext

## Verification Results

All verification checks passed:

- [x] `e2e/helpers/two-browser-harness.ts` exists and exports TwoBrowserHarness class + waitForPartnerUpdate function
- [x] `e2e/helpers/index.ts` re-exports both
- [x] TypeScript compiles without errors
- [x] TwoBrowserHarness uses createUserContext() from test-utils (not reimplementing)
- [x] TwoBrowserHarness uses getE2EHeaders() from auth.ts (not reimplementing)
- [x] waitForPartnerUpdate includes reload fallback + handleMoodCheck pattern
- [x] No SessionBuilder usage in TwoBrowserHarness
- [x] createSession extracts IDs via `responseData.data.session.id` and `responseData.data.invitation.id`
- [x] acceptInvitation uses stored invitationId and User B's headers

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Created files exist:**
- FOUND: e2e/helpers/two-browser-harness.ts

**Modified files exist:**
- FOUND: e2e/helpers/index.ts

**Commits exist:**
- FOUND: 34ec7b5 (Task 1: Create TwoBrowserHarness class and waitForPartnerUpdate helper)
- FOUND: 43c9ef0 (Task 2: Update helpers index to re-export new harness)

**Code patterns verified:**
- FOUND: `responseData.data.session.id` extraction pattern
- FOUND: `responseData.data.invitation.id` extraction pattern
- FOUND: `createUserContext()` usage (lines 100, 138)
- FOUND: `getE2EHeaders()` usage (lines 9, 163, 196)
- FOUND: `handleMoodCheck()` usage in reload fallback (line 293)

All verification criteria met.

## What's Next

This harness will be used in Phase 3-4 E2E tests to:
- Test partner invitation flows with real Ably events
- Verify compact signing synchronization across contexts
- Test reconciler share suggestions with cross-context updates
- Validate empathy exchange Ably event delivery
- Test full two-browser partner journeys end-to-end

The waitForPartnerUpdate pattern enables tests to validate Ably event delivery while gracefully falling back to reload verification if events are delayed.
