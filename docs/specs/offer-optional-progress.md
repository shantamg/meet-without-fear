# OFFER_OPTIONAL Implementation Progress

**Spec:** [when-the-reconciler-responds-with-offeroptional-we-need-to-implement-this.md](./when-the-reconciler-responds-with-offeroptional-we-need-to-implement-this.md)
**Started:** 2026-01-13
**Last Updated:** 2026-01-13

## Overview

Track implementation progress for the OFFER_OPTIONAL reconciler action and share flow redesign.

---

## Phase 1: Backend Preparation

### 1.1 Fix OFFER_OPTIONAL handling in reconciler
- [x] Update `backend/src/services/reconciler.ts` lines 407-408 to handle OFFER_OPTIONAL
- [x] Ensure OFFER_OPTIONAL with null suggestedShareFocus is treated as PROCEED
- [x] Add tests for OFFER_OPTIONAL behavior

### 1.2 Draft generation endpoint/context
- [x] Verify existing draft generation works with suggestedShareFocus context
- [x] Update prompt to include suggestedShareFocus when generating share draft
- [x] Test draft generation with various suggestedShareFocus values

### 1.3 Guesser status events
- [x] Add realtime event for "considering share suggestion" status
- [x] Add realtime event for PROCEED positive feedback
- [x] Update shared content message to include reconciler context label

---

## Phase 2: Mobile - New Components

### 2.1 ShareTopicPanel component
- [x] Create `mobile/src/components/ShareTopicPanel.tsx`
- [x] Low-profile full-width styling (like "Review what you'll share")
- [x] Tappable to open drawer
- [x] Props: `visible`, `onPress`, `action` (for potential styling hints)

### 2.2 ShareTopicDrawer component
- [x] Create `mobile/src/components/ShareTopicDrawer.tsx`
- [x] Full-screen drawer with intro text
- [x] Display suggestedShareFocus under "SUGGESTED FOCUS" label
- [x] Differentiated language for OFFER_SHARING vs OFFER_OPTIONAL
- [x] Lightbulb icon with color differentiation (orange vs blue)
- [x] "Yes, help me share" button
- [x] "No thanks" button with confirmation dialog

### 2.3 Tests for new components
- [x] Unit tests for ShareTopicPanel
- [x] Unit tests for ShareTopicDrawer
- [x] Test language differentiation
- [x] Test confirmation dialog flow

---

## Phase 3: Mobile - Integration

### 3.1 Hook up ShareTopicPanel to chat flow
- [x] Update `UnifiedSessionScreen.tsx` to show ShareTopicPanel when reconciler returns OFFER_*
- [x] Panel shows when reconciler returns OFFER_* with suggestedShareFocus
- [x] Panel hides after user decision
- [x] Add ShareTopicDrawer with accept/decline handlers

### 3.2 Draft generation via chat
- [x] Create `useGenerateShareDraft` hook in `useStages.ts`
- [x] Trigger draft generation when user taps "Yes, help me share"
- [x] Store generated draft in local state
- [x] Pass generated draft to ShareSuggestionDrawer

### 3.3 Decline flow
- [x] Confirmation dialog on "No thanks" (implemented in ShareTopicDrawer)
- [x] Mark empathy direction as READY on confirm via `handleRespondToShareOffer('decline')`
- [x] Hide panel and proceed

### 3.4 Update ShareSuggestionDrawer
- [x] ShareSuggestionDrawer now receives generated draft content
- [x] Falls back to original suggestedContent if draft generation fails
- [x] Clears generated draft on close/share/decline

---

## Phase 4: Guesser Experience

### 4.1 Status updates in WaitingBanner
- [x] Add new waiting states to `getWaitingStatus.ts`:
  - `awaiting-context-share-optional` - Subject side for OFFER_OPTIONAL
  - `awaiting-subject-decision` - Guesser waiting for subject's decision
  - `subject-skipped-sharing` - Subject declined sharing
  - `empathy-proceed` - Empathy match is good (PROCEED)
- [x] Update `waitingStatusConfig.ts` with banner text for new states

### 4.2 PROCEED positive feedback
- [x] Added `empathy-proceed` state with banner text: "Your understanding of {name} looks good!"
- [x] Backend already sends positive feedback message

### 4.3 Shared content label
- [x] Backend already updated shared content message formatting (Phase 1.3)

---

## Phase 5: Analytics & Polish

### 5.1 Analytics events
- [x] `share_topic_shown` with action property
- [x] `share_topic_accepted` with action property
- [x] `share_topic_declined` with action property
- [x] `share_draft_sent` with action and was_edited properties

### 5.2 Error handling
- [x] Draft generation failure shows toast and falls back to existing content
- [x] Test error recovery flow (verified fallback logic in handlers)

### 5.3 State persistence
- [x] Verify app close/reopen preserves state (server-side state via React Query)
- [x] Panel restores based on chat state (derived from shareOfferData which has staleTime: 0)

---

## User Story Completion Checklist

| Story | Description | Status |
|-------|-------------|--------|
| US-1 | Topic Suggestion Panel Display | ✅ Complete |
| US-2 | Topic Drawer with Differentiated Language | ✅ Complete |
| US-3 | Draft Generation via Chat | ✅ Complete |
| US-4 | Decline Confirmation | ✅ Complete |
| US-5 | Guesser Status Updates | ✅ Complete |
| US-6 | PROCEED Positive Feedback | ✅ Complete |
| US-7 | Shared Content Delivery to Guesser | ✅ Complete |
| US-8 | Edge Case - Null suggestedShareFocus | ✅ Complete |

**Status Key:** ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Blocked

---

## Verification Commands

```bash
# Type checking
npm run check

# Run all tests
npm run test

# Run backend tests only
npm run test --workspace=backend

# Run mobile tests only
npm run test --workspace=mobile

# Run reconciler tests specifically
cd backend && npm run test -- --testPathPattern="reconciler"
```

---

## Notes & Decisions

### 2026-01-13: Phase 1.1 Complete
- Updated `reconciler.ts` with new `isDirectionReady()` helper function that handles:
  - `PROCEED`: always ready
  - `OFFER_OPTIONAL` with `null/empty suggestedShareFocus`: treated as PROCEED (US-8)
  - `OFFER_OPTIONAL` with `suggestedShareFocus`: NOT ready (triggers share flow)
  - `OFFER_SHARING`: NOT ready (triggers share flow)
- Updated `shouldOfferSharing` logic to include OFFER_OPTIONAL when focus exists
- Added comprehensive tests in `reconciler-offer-optional.test.ts`

### 2026-01-13: Phase 1.2 Complete
- Updated `ShareSuggestionDTO` in `shared/src/dto/empathy.ts` with:
  - `suggestedShareFocus: string | null` - topic for Phase 1 of two-phase flow
  - `action: 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING'` - for UI language differentiation
- Updated `getShareOfferHandler` in `backend/src/controllers/reconciler.ts` to return new fields
- Created new `generateShareDraftHandler` endpoint (`POST /sessions/:id/reconciler/share-offer/generate-draft`):
  - Validates session access and share offer exists
  - Gets `suggestedShareFocus` from reconciler result
  - Calls AI orchestrator with `isGeneratingShareDraft: true` and `suggestedShareFocus`
  - Saves AI message to DB and publishes via Ably
  - Returns draft content for mobile to display
- Added new context fields to `FullAIContext` in `backend/src/services/ai.ts`:
  - `suggestedShareFocus?: string | null`
  - `isGeneratingShareDraft?: boolean`
- Added route in `backend/src/routes/reconciler.ts`
- Fixed unrelated TypeScript error in `inner-work.ts` (missing `getCompletion` import)

### 2026-01-13: Phase 1.3 Complete
- Added `empathy.status_updated` to `SessionEvent` type in `backend/src/services/realtime.ts`
- Added push notification template for `empathy.status_updated` in `backend/src/services/push.ts`
- Updated PROCEED positive feedback message (US-6):
  - Old: "{name} has shared their side and is now considering how you might be feeling..."
  - New: "{name} has felt heard. The reconciler reports your attempt to imagine what they're feeling was quite accurate..."
- Added guesser notification when AWAITING_SHARING (US-5):
  - Sends `empathy.status_updated` event with message: "{name} is considering a suggestion to share more"
- Updated shared content intro message (US-7):
  - Old: "Your empathy statement hasn't been shown to {name} yet because our internal reconciler found some gaps..."
  - New: "{name} hasn't seen your empathy statement yet because the reconciler suggested they share more. This is what they shared:"

### 2026-01-13: Phase 2 Components Complete
- Created `ShareTopicPanel.tsx`:
  - Low-profile full-width panel matching `ReadyToShareConfirmation` style
  - Uses Lightbulb icon with color differentiation (orange for OFFER_SHARING, blue for OFFER_OPTIONAL)
  - Props: `visible`, `onPress`, `action`
- Created `ShareTopicDrawer.tsx`:
  - Full-screen modal with intro text explaining reconciler reviewed the guess
  - Shows `suggestedShareFocus` under "SUGGESTED FOCUS" label
  - Differentiated language: "you share more about:" vs "you might consider sharing about:"
  - "Yes, help me share" button calls `onAccept` callback
  - "No thanks" button shows Alert confirmation dialog (US-4)
  - Color differentiation: orange/amber for OFFER_SHARING, blue for OFFER_OPTIONAL
  - Added `isLoading` prop for accept button loading state

### 2026-01-13: Phase 3 Integration Complete
- Integrated ShareTopicPanel and ShareTopicDrawer into UnifiedSessionScreen:
  - ShareTopicPanel replaces old share suggestion button
  - Tapping panel opens ShareTopicDrawer (Phase 1)
  - Accept triggers draft generation via `useGenerateShareDraft` hook
  - Generated draft passed to ShareSuggestionDrawer (Phase 2)
  - Decline calls `handleRespondToShareOffer('decline')` and closes drawer
- Added `useGenerateShareDraft` hook in `useStages.ts`:
  - Calls `POST /sessions/:id/reconciler/share-offer/generate-draft`
  - Returns generated draft content
  - Shows toast on error
- Updated `useUnifiedSession.ts`:
  - Added `handleGenerateShareDraft` callback
  - Exported `isGeneratingShareDraft` state

### 2026-01-13: Phase 4 Guesser Experience Complete
- Added new waiting status states in `getWaitingStatus.ts`:
  - `awaiting-context-share-optional` - Subject side for OFFER_OPTIONAL
  - `awaiting-subject-decision` - Guesser waiting for subject's decision
  - `subject-skipped-sharing` - Subject declined sharing
  - `empathy-proceed` - Empathy match is good (PROCEED)
- Added configurations in `waitingStatusConfig.ts`:
  - `awaiting-context-share-optional`: Soft banner for optional sharing
  - `awaiting-subject-decision`: Guesser sees "{name} is deciding whether to share more context"
  - `empathy-proceed`: Positive feedback "Your understanding of {name} looks good!"

### 2026-01-14: Phase 5 Analytics & Polish Complete
- Added unit tests for ShareTopicPanel and ShareTopicDrawer components:
  - Tests for visibility, content, interaction, action differentiation
  - Tests for confirmation dialog flow
  - Added mock for react-native-safe-area-context in jest.setup.js
- Added analytics events in `mobile/src/services/analytics.ts`:
  - `trackShareTopicShown(sessionId, action)`
  - `trackShareTopicAccepted(sessionId, action)`
  - `trackShareTopicDeclined(sessionId, action)`
  - `trackShareDraftSent(sessionId, action, wasEdited)`
- Integrated analytics in `UnifiedSessionScreen.tsx`:
  - Track share topic shown via useEffect when panel becomes visible
  - Track accepted/declined in ShareTopicDrawer handlers
  - Track draft sent in ShareSuggestionDrawer onShare handler
- Verified state persistence:
  - Server-side state via React Query (staleTime: 0 for fresh data)
  - Panel visibility derived from shareOfferData.hasSuggestion
  - Once user responds, server status changes and offer no longer appears

---

## Remaining Work

All work is complete! ✅

---

## Blockers

None.
