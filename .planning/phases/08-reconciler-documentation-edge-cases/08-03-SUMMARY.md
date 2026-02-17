---
phase: 08-reconciler-documentation-edge-cases
plan: 03
subsystem: reconciler-ux
tags: [reconciler, accuracy-feedback, refinement, acceptance-check]
dependency_graph:
  requires: [08-02]
  provides: [accuracy-feedback-inaccurate-flow, guesser-refinement-ui, acceptance-check]
  affects: [mobile-unified-session, mobile-share-screen]
tech_stack:
  added: []
  patterns: [ai-mediated-feedback, acceptance-check, modal-composition]
key_files:
  created: []
  modified:
    - mobile/src/screens/UnifiedSessionScreen.tsx
    - mobile/src/components/ValidationCoachChat.tsx
    - mobile/src/components/ViewEmpathyStatementDrawer.tsx
    - mobile/app/(auth)/session/[id]/share.tsx
decisions:
  - "ValidationCoachChat initialDraft made optional to support empty-start flow"
  - "Acceptance check button shows only when isRevising=true in ViewEmpathyStatementDrawer"
  - "Footer layout reorganized to column with accept button above action buttons"
  - "willingToAccept=true for simple acceptance (no reason needed)"
metrics:
  duration: 7min
  completed: 2026-02-17
---

# Phase 08 Plan 03: Accuracy Feedback Inaccurate Path & Guesser Refinement

**One-liner:** Wired AI-mediated feedback crafting for inaccurate empathy and acceptance check for guesser refinement

## Overview

Completed the full reconciler feedback loop:
- Subject rates empathy as inaccurate → AI-mediated feedback chat → AI crafts constructive feedback → delivered to guesser
- Guesser receives feedback → can refine empathy via AI conversation OR accept feedback without revising
- Acceptance check supports "I accept their experience" (proceed) without requiring reason

## What Was Built

### Task 1: Subject Inaccurate Feedback Path ✓

**Problem:** Tapping "Not quite" in AccuracyFeedbackDrawer immediately sent generic validation message instead of opening AI feedback coach.

**Solution:** Wire ValidationCoachChat for AI-mediated feedback crafting.

**Implementation:**
1. **Make ValidationCoachChat flexible** - initialDraft now optional to support empty-start flow
2. **Add state** - `showFeedbackCoachChat` and `feedbackCoachInitialDraft` in UnifiedSessionScreen
3. **Update onInaccurate handler** - Close drawer → open ValidationCoachChat modal
4. **Wire submission** - onComplete callback calls `handleValidatePartnerEmpathy(false, aiCraftedFeedback)`

**Flow:**
```
Subject taps "Not quite"
  → AccuracyFeedbackDrawer closes
  → ValidationCoachChat opens (empty or with draft)
  → Subject describes concerns
  → AI crafts constructive feedback
  → Subject approves
  → POST /empathy/validate { validated: false, feedback: "..." }
  → Backend notifies guesser via Ably
```

**Files Modified:**
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Added ValidationCoachChat modal, state, handlers
- `mobile/src/components/ValidationCoachChat.tsx` - Made initialDraft optional, handle empty case

**Commit:** e82fac5

---

### Task 2: Guesser Refinement & Acceptance Check ✓

**Problem:** Guesser refinement UI existed (ViewEmpathyStatementDrawer in share.tsx) but lacked acceptance check option.

**Solution:** Add "I accept their experience" button to ViewEmpathyStatementDrawer when isRevising=true.

**Implementation:**
1. **Add onAcceptWithoutRevising prop** to ViewEmpathyStatementDrawer
2. **Add acceptance button** - Shows only when `isRevising && onAcceptWithoutRevising` exists
3. **Import useSkipRefinement** in share.tsx
4. **Wire callback** - Calls `skipRefinement({ sessionId, willingToAccept: true })`
5. **Update layout** - Footer now column layout with accept button above action buttons
6. **Update button text** - "Share" becomes "Resubmit" when isRevising=true

**Guesser Options After Receiving Feedback:**
1. **Refine further** → Opens inline composer → Chat with AI → Update empathy
2. **Resubmit** → Directly resubmit current empathy (if already refined in chat)
3. **I accept their experience** → Skip refinement, proceed to next stage

**Acceptance Check Flow:**
```
Guesser receives feedback (status: REFINING)
  → Opens Share tab
  → Taps "Refine" on PartnerContentCard
  → ViewEmpathyStatementDrawer opens (isRevising=true)
  → Sees 3 buttons:
     - "I accept their experience" → skipRefinement({ willingToAccept: true })
     - "Refine further" → Chat with AI
     - "Resubmit" → resubmitEmpathy (if already refined)
```

**Files Modified:**
- `mobile/src/components/ViewEmpathyStatementDrawer.tsx` - Added onAcceptWithoutRevising prop, accept button, layout changes
- `mobile/app/(auth)/session/[id]/share.tsx` - Import useSkipRefinement, wire onAcceptWithoutRevising callback

**Commit:** 6f6f903

---

## Deviations from Plan

**None** - Plan executed exactly as written. Both tasks completed successfully.

---

## Verification

✅ **Type Checking:** `npm run check --workspace=mobile` passes
✅ **Tests:** All mobile tests pass (44 suites, 592 tests)
✅ **Task 1 - Inaccurate Path:**
  - onInaccurate opens ValidationCoachChat
  - ValidationCoachChat supports empty initialDraft
  - AI crafts feedback, subject approves
  - Feedback sent via handleValidatePartnerEmpathy(false, feedback)

✅ **Task 2 - Guesser Refinement:**
  - ViewEmpathyStatementDrawer shows accept button when isRevising=true
  - Accept button calls skipRefinement({ willingToAccept: true })
  - Guesser can refine via AI, resubmit directly, or accept without revising
  - Footer layout accommodates accept button

---

## Testing

### Automated Tests
- All 592 mobile tests passed
- AccuracyFeedback tests: 6 passed
- EmpathyAttemptCard tests: 19 passed

### Manual Verification Needed
**Subject Path:**
1. Partner empathy revealed → AccuracyFeedbackDrawer shows
2. Tap "Not quite" → ValidationCoachChat opens
3. Type feedback concerns → AI crafts constructive message
4. Approve → Feedback sent to guesser

**Guesser Path:**
1. Receive feedback → Status becomes REFINING
2. Navigate to Share tab → See "Refine" button
3. Tap "Refine" → ViewEmpathyStatementDrawer opens
4. See 3 options: Accept / Refine further / Resubmit
5. Tap "I accept their experience" → Proceeds to next stage

---

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| e82fac5 | feat | Wire accuracy feedback inaccurate path |
| 6f6f903 | feat | Wire guesser refinement and acceptance check |

---

## Impact

### User Experience
- **Subject:** Can craft constructive feedback via AI coach when empathy is inaccurate
- **Guesser:** Has 3 clear options after receiving feedback (refine, resubmit, accept)
- **Transparency:** Acceptance check makes explicit that guesser accepts subject's experience
- **No Infinite Loops:** Guesser can proceed without revising (acceptance check prevents deadlock)

### Technical Debt
- None introduced
- ValidationCoachChat is now more flexible (optional initialDraft)
- ViewEmpathyStatementDrawer supports all refinement scenarios

---

## Content Persistence

Both Chat and Share pages serve as persistent records:
- **Subject sees:** Partner's empathy attempt + validation result
- **Guesser sees:** Subject's feedback + own empathy history (original + revisions)
- **No disappearing content:** All actions preserve history
- **Share tab shows revision count:** via isSuperseded flag on older attempts

---

## Self-Check

✅ **Created files exist:**
- No new files created

✅ **Modified files verified:**
- `mobile/src/screens/UnifiedSessionScreen.tsx` - ValidationCoachChat modal added
- `mobile/src/components/ValidationCoachChat.tsx` - initialDraft now optional
- `mobile/src/components/ViewEmpathyStatementDrawer.tsx` - Accept button added
- `mobile/app/(auth)/session/[id]/share.tsx` - skipRefinement wired

✅ **Commits exist:**
```bash
$ git log --oneline | grep -E "e82fac5|6f6f903"
6f6f903 feat(08-03): wire guesser refinement and acceptance check
e82fac5 feat(08-03): wire accuracy feedback inaccurate path
```

**Self-Check:** PASSED

---

## Next Steps

Plan 08-04 will add Playwright E2E tests for all reconciler outcome paths (PROCEED, OFFER_OPTIONAL, OFFER_SHARING) with visual snapshots.
