# Bug Fix: Incorrect "Waiting for Partner to Feel Heard" Status

**Status:** COMPLETED
**Date:** 2026-01-12
**Commit:** f72abcc

## Summary

Fixed a bug where the "Waiting for [partner] to feel heard" banner incorrectly appeared immediately when a user entered Stage 2 (Perspective Stretch), blocking them from working on their empathy draft.

## Problem

When User A completed Stage 1 (confirmed "I feel heard") and advanced to Stage 2, while User B was still in Stage 1, the UI would immediately show "Waiting for [User B] to feel heard" and block User A from chatting.

**Expected behavior:** User A should be able to work on their empathy draft in Stage 2 without waiting. The waiting state should only appear *after* User A has shared their empathy.

## Root Cause

The waiting status logic checked only stage positions:
```typescript
if (myStage === Stage.PERSPECTIVE_STRETCH && partnerStage === Stage.WITNESS) {
  return 'witness-pending';
}
```

This triggered the waiting banner as soon as the user entered Stage 2, without checking if they had actually shared their empathy yet.

## Solution

Added a check for `empathyDraft.alreadyConsented` - the waiting banner now only shows after the user has consented to share their empathy:

```typescript
if (
  myStage === Stage.PERSPECTIVE_STRETCH &&
  partnerStage === Stage.WITNESS &&
  empathyDraft?.alreadyConsented  // New condition
) {
  return 'witness-pending';
}
```

## Files Changed

- `mobile/src/utils/getWaitingStatus.ts` - Added consent check
- `mobile/src/hooks/useUnifiedSession.ts` - Added same check
- `mobile/src/utils/__tests__/getWaitingStatus.test.ts` - Updated tests
- `mobile/src/utils/__tests__/chatUIState.test.ts` - Updated tests

## Additional Fixes (Same Commit)

1. **Revision analyzing status** - Added `revision-analyzing` status that shows "Re-analyzing your understanding..." without a spinner when user revises their empathy statement.

2. **AI acknowledgment after revision** - Backend now generates an AI message acknowledging when user resubmits a revised empathy statement.

## Verification

All 584 mobile tests pass. Type checks pass.
