# Share Flow Redesign: Menu-Based Sent/Received + Stage 2B

## Status: DESIGN COMPLETE - Ready for Implementation Planning

## Overview

Replace the integrated share page (SharingStatusScreen) with a menu-based system featuring "Sent" and "Received" tabs, add Stage 2B (Informed Empathy), and introduce a refinement full-screen modal with AI chat.

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reconciler loop | Server-driven, circuit breaker (max 3 attempts per direction) | Prevents infinite loops, reuses existing circuit breaker |
| Stage 2B implementation | Prompt-routing only (Stage 21 in enum, StageProgress stays at 2) | Zero new stage transitions = no race conditions |
| Migration | None - reset DB (still in development) | Simplifies everything |
| Refinement UI | Full-screen modal (main chat unmounted) | No FlatList rendering conflicts |
| Refinement storage | Stateless (client manages chat history) | No DB writes, no cleanup, no cache growth |
| Menu icon | Three-dot vertical with BadgeIndicator | Standard mobile pattern |
| Tab naming | "Sent" / "Received" | Clear, concise, universally understood |

---

## UI/UX Design

### Menu System (Replaces Share Button)

**Header Change**: Replace "Share →" pill button with three-dot vertical menu icon.
- Same pill-style background (#475569) as current Share button
- BadgeIndicator component positioned top-right shows count of unattended items
- Badge animates in/out as count changes

**Menu Modal**: Full-screen modal with:
- Header: "Activity" title, X close button top-right
- Two tabs: "Sent" / "Received" with underline on active tab
- Tab badges: smaller count on each tab label for that tab's unattended items
- Content: scrollable list of items for selected tab
- Color scheme: Header bgSecondary (#334155), tabs bgPrimary (#1e293b), content bgPage (#0f172a)

### Sent Page

Each item is a card (bgPrimary #1e293b with subtle border):
- **Top**: Type badge pill ("Empathy" / "Context" / "Gap-fill") + timestamp
- **Middle**: Quoted content text
- **Bottom**: Delivery status icon progression:
  - Clock (gray) = Sent
  - Check (gray) = Delivered
  - Check + Eye (blue) = Seen
  - Double-check (blue) = Acted on
- **Card accent**: Orange left border for empathy, Blue for context, Orange-warning for gap-fill
- **Empty state**: "Nothing sent yet" with lightbulb icon
- **Order**: Newest first, date separators for multi-day spans

### Received Page

Same card structure as Sent but with action buttons:
- **Reconciler gap-fill suggestion**: Header "Reconciler found gaps" + exclamation icon, suggestion text, two buttons: "Refine" (secondary) / "Share as-is" (orange primary)
- **Partner's empathy**: Header "[PartnerName] shared their understanding", empathy text, three rating buttons: "Accurate" / "Partially accurate" / "Not quite"
- **Unread highlighting**: Orange left border (#f5a623) on unread items, fades when viewed
- **Unattended count**: Title shows "Received (3)" for items needing action
- **Empty state**: "Nothing received yet. Your partner will share here."

### Refinement Full-Screen Modal

Full-screen view (main chat unmounted during this):
- **Header**: "Refining: [item type]" left, X close button right, bgSecondary (#334155)
- **Top section**: AI's suggested share in a bubble (left-aligned, muted color), followed by "How would you like to refine this?"
- **Chat area**: ScrollView of messages, same bubble styling as main chat (AI left, user right orange)
- **AI revisions**: Each revision appears as new message with "Share This Version" button below
- **Bottom**: ChatInput component (same as main chat)
- **On share**: Loading state → modal closes → Sent page updated → back to main chat
- **On close without sharing**: Draft can be resumed later (auto-saved to AsyncStorage)

### Stage 2B in Main Chat

When partner shares new context:
1. System indicator pill: "[PartnerName] shared new context with you" (fade + slide animation)
2. Partner's content rendered as special message type (bgSecondary with border, "From [PartnerName]" label)
3. AI message: "I see [PartnerName] has shared something important. What are your thoughts on this?"
4. ChatInput re-enables (was disabled during waiting state)
5. After several turns, AI suggests empathy draft with "Refine further" / "This looks good" buttons

### Notification Flow

1. Backend: Reconciler creates share offer → Ably event to user channel
2. Mobile: Event arrives → cache updates → badge count increments
3. User taps three-dot menu → modal opens → "Received" tab shows badge
4. User taps item → orange border fades (marks read) → badge decrements
5. User taps "Refine" → full-screen modal opens with AI chat
6. User refines via chat → taps "Share This Version" → modal closes
7. Sent page shows new item with delivery status tracking

---

## Backend Architecture

### Stage 2B: Prompt-Routing Only

`Stage.INFORMED_EMPATHY = 21` added to enum for:
- Prompt dispatch (different system prompt than Stage 2)
- Message tagging (analytics: `message.stage = 21`)

`StageProgress.stage` NEVER changes to 21. Stays at 2 throughout refinement loop.

**Detection**: Message controller checks `EmpathyAttempt.status === 'REFINING'` → routes to Stage 2B prompt.

### Stage 2B Prompt Design

Context includes:
- Gap analysis from reconciler (what was missed)
- Partner's shared context (new information)
- Previous empathy attempt (what user guessed before)
- Iteration count (1st, 2nd, 3rd attempt)

Three modes:
- **INTEGRATING**: User is actively incorporating new info (default)
- **STRUGGLING**: User is having difficulty reconciling new info with their understanding
- **CLARIFYING**: User needs help understanding what partner shared

Goal: Guide user to craft refined empathy statement with new context. Allow several conversational turns before suggesting draft.

Response protocol: Same as Stage 2 - uses `ReadyShare:Y` + `<draft>` tags for empathy drafts.

### Refinement Chat API (Stateless)

Three endpoints under `/sessions/:id/reconciler/refinement/`:

1. `POST /start` - Fetch share offer details, return initial AI suggestion
2. `POST /message` - Stream Haiku coaching response via SSE
   - Client sends full conversation history (no DB writes)
   - AI responds with revised content + conversational text
   - Extracts `proposedContent` from `<content>` tags
3. `POST /finalize` - Submit final refined content
   - Creates `SHARED_CONTEXT` message
   - Updates share offer status
   - Triggers Ably event to partner

### Reconciler Re-trigger

The loop already works via existing `resubmitEmpathy`:
1. User shares revised empathy → `resubmitEmpathy` endpoint
2. Deletes current `ReconcilerResult` (cascade-deletes offer)
3. Reconciler re-runs analysis
4. If gaps remain + circuit breaker < 3: creates new share offer → notification
5. If gaps resolved OR circuit breaker = 3: marks READY → advance to Stage 3

Only new addition: `empathy.resubmitted` Ably event so partner sees update.

### Notification System (Derived State)

No new Notification table. Badges derived from existing state:

`GET /sessions/:id/pending-actions` returns:
- `share_offer` items (ReconcilerShareOffer with status PENDING)
- `context_received` items (SHARED_CONTEXT messages not yet viewed)
- `validate_partner` items (partner empathy awaiting validation)

`GET /notifications/badge-count` returns app-level aggregate.

New Ably user-channel event: `notification.pending_action`

### Data Model Changes

New table:
- `RefinementAttemptCounter` (tracks attempts per direction per session)

Modified tables:
- `EmpathyAttempt`: +revisionCount, +lastRevisedAt, +revisedAttemptIds
- `ReconcilerResult`: +iteration, +wasCircuitBreakerTrip
- `ReconcilerShareOffer`: +iteration, +refinementChatUsed

### Files to Modify (Backend)

- `shared/src/enums.ts` - Add Stage 21 (INFORMED_EMPATHY)
- `backend/src/services/stage-prompts.ts` - Stage 2B prompt + routing
- `backend/src/controllers/messages.ts` - Stage 2B detection via REFINING status
- `backend/src/controllers/stage2.ts` - empathy.resubmitted Ably event
- `backend/src/controllers/reconciler.ts` - Refinement chat endpoints
- `backend/src/controllers/notifications.ts` - NEW: pending actions + badge count
- `backend/src/routes/reconciler.ts` - Add refinement routes
- `backend/src/routes/notifications.ts` - NEW: notification routes
- `backend/src/services/realtime.ts` - New event helpers

---

## Risk Mitigations

### Must-Solve Before Implementation

1. **Cache Key Audit** (LOW effort, HIGH impact)
   - Create Query Key Map document: every key + who writes it + who reads it
   - Add comments in code: "I update these cache keys" / "I read from these cache keys"
   - Add unit tests for key consistency

2. **Stage Transition Mutex** (MEDIUM effort)
   - Server-side atomic check: `UPDATE ... WHERE stage = expected`
   - Return 409 Conflict if race detected
   - Client retries with invalidated cache

3. **Ably Event Versioning** (MEDIUM effort)
   - Track empathy version in refinement context
   - Server validates: submission was against current version
   - Force re-review on version mismatch (422 response)

### Manageable Concerns

- **Cache growth**: Cleanup hook on refinement modal unmount clears keys
- **Offline drafts**: Auto-save to AsyncStorage every 2s, restore on reopen
- **Context loss in modal**: Badge in modal header if partner sends message while refining
- **Android back button**: Navigation listener with "Discard draft?" confirmation
- **State explosion**: Consider XState finite state machine for refinement flow

---

## Feature Migration: 8 High-Risk Items

| # | Feature | Current Location | New Location | Risk |
|---|---------|-----------------|--------------|------|
| 1 | Refinement loop modals (4 phases) | PerspectiveStretchScreen | RefinementModal component | CRITICAL |
| 2 | Share suggestion card (Accept/Decline/Refine) | SharingStatusScreen | Sent page | CRITICAL |
| 3 | Accuracy feedback (3 buttons) | PerspectiveStretchScreen | Received page + AccuracyFeedbackDrawer | CRITICAL |
| 4 | Share topic panel (low-profile) | Main chat (unchanged) | Main chat (unchanged) | CRITICAL |
| 5 | Empathy status tracking (7 states) | Various | Sent/Received card status | CRITICAL |
| 6 | Real-time cache invalidation | Ably handlers | Same handlers + new keys | CRITICAL |
| 7 | Delivery status badges | Chat renderers | Sent page cards | CRITICAL |
| 8 | Circuit breaker counter | Backend reconciler | Backend (unchanged logic) | CRITICAL |

---

## Implementation Order

### Phase 1: Foundation (2-3 days)
- Add Stage 21 to enum + shared types
- Backend: Stage 2B prompt + routing detection
- Backend: Refinement chat endpoints (stateless)
- Backend: Notification endpoints (pending-actions, badge-count)

### Phase 2: Mobile Core (3-4 days)
- Menu button with BadgeIndicator (replace Share button)
- Sent screen (card list with delivery status)
- Received screen (card list with action buttons)
- Navigation updates

### Phase 3: Interactivity (2-3 days)
- Share/Refine actions on received items
- Refinement full-screen modal with AI chat
- Stage 2B main chat experience (re-enable chat, show partner content)
- Accuracy feedback in received page

### Phase 4: Integration (1-2 days)
- Ably event wiring for new events
- Cache invalidation for all new keys
- Delete SharingStatusScreen
- E2E test updates

**Total: ~2-3 weeks**

---

## Deleted Components

- `SharingStatusScreen` (replaced by menu modal with Sent/Received tabs)
- Share button in SessionChatHeader (replaced by three-dot menu)
- Inline refinement in ShareSuggestionCard (replaced by full-screen modal)

## New Components

- `ActivityMenuButton` - Three-dot icon with badge in header
- `ActivityMenuModal` - Full-screen modal with Sent/Received tabs
- `SentItemsList` - Scrollable list of sent items with delivery status
- `ReceivedItemsList` - Scrollable list of received items with actions
- `RefinementModalScreen` - Full-screen AI chat for refining items
- `SentItemCard` - Individual sent item card
- `ReceivedItemCard` - Individual received item with action buttons

---

## Open Integration Questions (Resolve Before Implementation)

### 1. Stage 2B Visibility in Frontend
StageProgress.stage stays at 2, so how does the frontend detect Stage 2B?
- **Option A**: Check `stage === 2 && empathyAttempt.status === 'REFINING'` (compound check)
- **Option B**: Add explicit `inRefinementPhase: boolean` to session state response (cleaner)
- **Recommendation**: Option B - cleaner separation, avoids deeply nested status checks

### 2. Empathy Version Conflict Detection
When User B submits refinement, server must verify they were refining against the current version.
- Add `revisionCount` (auto-incrementing) to EmpathyAttempt
- Submissions include `submittedAgainstRevisionCount`
- Server validates: if current > submitted, return 422 + version diff

### 3. Refinement Chat Start Atomicity
`POST /reconciler/refinement-chat/start` must be idempotent or guarded.
- First call increments RefinementAttemptCounter
- Concurrent calls from both users increment independently (per-direction counters)
- Server enforces max 3 per direction, 4th forces READY

---

## Pre-Implementation Checklist

- [ ] Resolve 3 integration questions above
- [ ] Create Query Key Map document (key + writers + readers)
- [ ] Backend + frontend pairing session: walk through one complete refinement flow
- [ ] Confirm modal navigation approach (React Navigation modal vs custom)
- [ ] DB reset and fresh migration with new schema
