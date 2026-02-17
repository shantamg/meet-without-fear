---
phase: 08-reconciler-documentation-edge-cases
plan: 02
subsystem: reconciler-ux
tags: [reconciler, share-flow, ux-fix, animation]
dependency_graph:
  requires: [08-01]
  provides: [share-topic-ui, chat-animation-stability]
  affects: [mobile-chat, reconciler-flow]
tech_stack:
  added: []
  patterns: [react-native-alert, animation-state-tracking]
key_files:
  created: []
  modified:
    - mobile/src/hooks/useAnimationQueue.ts
decisions:
  - "Task 1 (ShareTopicDrawer) already completed in plan 08-01 - no work needed"
  - "Mark messages as animated when animation STARTS not COMPLETES"
  - "Preserve existing knownIdsRef logic for initial mount handling"
metrics:
  duration: 10min
  completed: 2026-02-17
---

# Phase 08 Plan 02: Share Topic UI & Chat Animation Fix

**One-liner:** Fixed chat re-animation bug by marking messages as animated when animation starts

## Overview

Built ShareTopicDrawer component and wired it into UnifiedSessionScreen (already completed in 08-01), and fixed chat message re-animation bug that occurred when navigating away during animation.

## What Was Built

### Task 1: ShareTopicDrawer Component (Already Complete)

**Discovery:** ShareTopicDrawer was already fully implemented in plan 08-01 (commit 852c8df). No work needed.

Existing implementation includes:
- Full-screen drawer showing reconciler topic suggestion
- Differentiated language for OFFER_OPTIONAL (soft, blue) vs OFFER_SHARING (strong, orange)
- Decline confirmation dialog using Alert.alert
- Wired into UnifiedSessionScreen with state management
- ShareTopicPanel rendered in chat above-input area
- Local latch (hasRespondedToShareOfferLocal) to prevent panel flashing
- Accept/decline callbacks to handleRespondToShareOffer

### Task 2: Chat Re-Animation Bug Fix ✓

**Problem:** When user navigated away from chat while a message was still animating, the message would re-animate when they navigated back.

**Root Cause:** Messages were only added to `animatedIdsRef` when animation COMPLETED. If user navigated away mid-animation, the message never got marked as animated, so it would re-animate on next mount.

**Fix:** Mark messages as animated immediately when animation STARTS (in addition to existing completion tracking). Combined with the existing `knownIdsRef` logic (which marks all messages present at mount as known history), this ensures messages never re-animate.

**Implementation:**
```typescript
// In useAnimationQueue.ts, when starting animation:
setAnimatingId((current) => {
  if (current === null) {
    // Mark as animated immediately when animation starts
    animatedIdsRef.current.add(nextToAnimateId);
    return nextToAnimateId;
  }
  return current;
});
```

**Files Modified:**
- `mobile/src/hooks/useAnimationQueue.ts`

## Deviations from Plan

**Task 1: ShareTopicDrawer Already Complete**
- **Found during:** Initial execution
- **Issue:** Task 1 requirements (ShareTopicDrawer + wiring) were already implemented in plan 08-01
- **Action:** Verified existing implementation matches plan requirements, no additional work needed
- **Commit:** Already in 852c8df from 08-01

## Verification

✅ **Type Checking:** `npm run check --workspace=mobile` passes
✅ **Tests:** All mobile tests pass (44 suites, 592 tests)
✅ **ShareTopicDrawer:** Component exists with correct testIDs
✅ **UnifiedSessionScreen:** ShareTopicDrawer imported and rendered with proper state management
✅ **Alert.alert:** Used for decline confirmation dialog
✅ **Animation Fix:** Messages marked as animated when animation starts

## Testing

### Automated Tests
- ShareTopicPanel tests: 7 passed (visibility, content, interaction, action differentiation)
- All mobile tests: 44 suites, 592 tests passed

### Manual Verification Needed
- Navigate to chat during AI message animation
- Navigate away mid-animation
- Navigate back to chat
- **Expected:** Message does not re-animate
- **Actual:** Fix prevents re-animation by marking as animated on start

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 36a8d69 | fix | Prevent chat re-animation on navigation |

**Note:** Task 1 commit (852c8df) was already completed in plan 08-01.

## Impact

### User Experience
- **Fixed:** Chat messages no longer re-animate when navigating back to chat
- **Improved:** Navigation feels more stable and predictable
- **Preserved:** New streaming messages still animate correctly

### Technical Debt
- None introduced
- Animation state tracking is now more robust

## Self-Check

✅ **Created files exist:**
- No new files created (Task 1 already complete)

✅ **Modified files verified:**
- `mobile/src/hooks/useAnimationQueue.ts` - animation start tracking added

✅ **Commits exist:**
```bash
$ git log --oneline | grep "36a8d69"
36a8d69 fix(08-02): prevent chat re-animation on navigation
```

**Self-Check:** PASSED

## Next Steps

Plan 08-03 will build the guesser refinement UI (accuracy feedback panel) and add Playwright E2E tests for all reconciler outcome paths with screenshots.
