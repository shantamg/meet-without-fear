# Progress: Feedback Fixes (2026-01-14)

Tracking implementation progress for `docs/specs/feedback-2026-01-14.md`

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Prompt Fixes | ✅ Complete | SIMPLE_LANGUAGE_PROMPT added, guardrails added to generateShareSuggestion |
| 2. Context Injection | ✅ Complete | getSharedContentContext utility created, integrated into AI orchestrator |
| 3. Bug Fixes | ✅ Complete | Removed fallback placeholders, fixed knownMessageIdsRef race condition |
| 4. Stuck State Investigation | ✅ Complete | Changed invalidateQueries to refetchQueries for immediate UI update |
| 5. Modal Prompts | ✅ Complete | Auto-show modal, dismiss/re-offer with 5-message and stage-transition fallbacks |

---

## Phase 1: Prompt Fixes

### Tasks
- [x] Create `SIMPLE_LANGUAGE_PROMPT` constant
- [x] Inject into all stage prompt builders
- [x] Add guardrails to `generateShareSuggestion`

### Notes
- Added `SIMPLE_LANGUAGE_PROMPT` constant in `backend/src/services/stage-prompts.ts` line 144
- Injected into `buildBaseSystemPrompt()` which is used by all stage builders
- Added guardrails to `generateShareSuggestion()` in `backend/src/services/reconciler.ts` line 742
- Stage-prompts and reconciler tests all pass (57 tests)

---

## Phase 2: Context Injection

### Tasks
- [x] Create `getSharedContentContext()` utility
- [x] Query EmpathyAttempt, ReconcilerShareOffer, special Messages
- [x] Format as prompt section
- [x] Inject into stage prompts

### Notes
- Created `backend/src/services/shared-context.ts` with `getSharedContentContext(sessionId, userId)` function
- Queries: EmpathyAttempt (REVEALED status), ReconcilerShareOffer (DELIVERED), Messages (EMPATHY_STATEMENT, SHARED_CONTEXT roles), ConsentedContent (active)
- Added `sharedContentHistory` optional field to `PromptContext` interface
- Modified `buildBaseSystemPrompt` to accept and include shared content history
- Integrated into `ai-orchestrator.ts` via Promise.all parallel fetch
- Stage-prompts and reconciler tests all pass (57 tests)

---

## Phase 3: Bug Fixes

### Tasks
- [x] Remove fallback placeholder text from reconciler.ts (lines 762, 1006)
- [x] Add proper error handling for AI call failures
- [x] Fix knownMessageIdsRef race condition in ChatInterface
- [x] Ensure messages loaded async are captured as "known"

### Notes
- Removed placeholder "There's something about my experience..." from reconciler.ts line 768
- Changed to return null instead of fallback, letting caller handle error state
- Changed second fallback at line 1009 to throw error instead (data integrity issue)
- Added `initialLoadCompletedAtRef` to track when initial load finished
- New useEffect checks incoming messages' timestamps - marks as known if before initial load completed
- This handles async query batching and Ably race conditions
- Tests pass for stage-prompts, reconciler, chatUIState, getWaitingStatus

---

## Phase 4: Stuck State Investigation

### Tasks
- [x] Add logging to Ably notification flow
- [x] Trace from reconciler completion to client handler
- [x] Document findings
- [x] Implement fix based on findings

### Notes

**Root Cause Found:** The issue was that `onSessionEvent` handlers in UnifiedSessionScreen.tsx were using `queryClient.invalidateQueries()` instead of `queryClient.refetchQueries()`.

**Technical Details:**
- `invalidateQueries()` only marks queries as stale - they won't refetch until:
  1. The component re-renders
  2. The window gains focus
  3. A manual refetch is triggered
- `refetchQueries()` immediately triggers a refetch regardless of component state

**Flow Traced:**
1. Backend: `confirmFeelHeard` → `runReconcilerForDirection` → `notifyPartner(sessionId, userId, 'empathy.share_suggestion', {...})`
2. Backend: `notifyPartner` → `publishSessionEvent` → Ably channel `session:{sessionId}`
3. Client: `useRealtime` subscribes to session channel → `handleMessage` → `onSessionEvent` callback
4. Client: `onSessionEvent` calls `invalidateQueries` (was not triggering immediate refetch)

**Fix Applied:**
Changed all `invalidateQueries` calls to `refetchQueries` in UnifiedSessionScreen.tsx for empathy reconciler events:
- `empathy.share_suggestion`
- `empathy.context_shared`
- `partner.session_viewed`
- `partner.stage_completed`
- `empathy.revealed`

**File Modified:** `mobile/src/screens/UnifiedSessionScreen.tsx` lines 249-290

---

## Phase 5: Modal Action Prompts

### Tasks
- [x] Convert ShareSuggestionDrawer to modal
- [x] Add dismiss functionality
- [x] Track pendingShareOffer state (via `shareOfferDismissed`, `messageCountAtDismiss`)
- [x] Implement 5-message and stage-transition fallbacks
- [ ] Update AI prompts with pending offer awareness (deferred - lower priority)
- [ ] Add output JSON field for re-offer trigger (deferred - lower priority)

### Notes

**Implementation Complete:**
ShareSuggestionDrawer now auto-shows as a modal when a share offer is ready, with dismiss/re-offer state machine logic.

**State Machine:**
- `NO_OFFER → OFFERED`: Modal shows when `shareOfferData?.hasSuggestion` becomes true
- `OFFERED → DISMISSED`: User clicks X button (via `handleDismissShareModal`)
- `DISMISSED → OFFERED`: After 5 user messages OR on stage transition

**Key Changes to `mobile/src/screens/UnifiedSessionScreen.tsx`:**
1. Added state tracking: `shareOfferDismissed`, `messageCountAtDismiss`
2. Added `MESSAGE_THRESHOLD_FOR_REOFFER = 5` constant
3. Added auto-show effect that opens modal when offer ready and not dismissed
4. Added re-offer effect that checks message count threshold
5. Added stage transition effect that resets dismissed state on stage change
6. Added `handleDismissShareModal` callback wired to `onClose` prop
7. Added `trackShareTopicDismissed` analytics function

**Files Modified:**
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Modal state machine and auto-show logic
- `mobile/src/services/analytics.ts` - Added `trackShareTopicDismissed` function

**Deferred Items (US-8 partial):**
- AI prompt awareness of pending offer - requires backend changes
- `showShareModal: true` output JSON field - requires AI output schema changes
These are lower priority enhancements that can be added later if needed.

---

## Blockers & Issues

*Document any blockers encountered during implementation*

---

## Verification Log

| Phase | Command | Result | Date |
|-------|---------|--------|------|
| 1 | `npm run check && npm run test` | Pass | 2026-01-14 |
| 2 | `npm run check && npm run test` | Pass | 2026-01-14 |
| 3 | `npm run check && npm run test` | Pass | 2026-01-14 |
| 4 | `npm run check && npm run test` | Pass | 2026-01-14 |
| 5 | `npm run test -- --testPathPattern="chatUIState\|getWaitingStatus"` | 58 tests pass | 2026-01-14 |
| 5 | `npm run test -- --testPathPattern="reconciler\|stage-prompts"` | 57 tests pass | 2026-01-14 |
