# Audit: Stage 0-1 Two-User Interaction Paths

**Phase:** 01-audit
**Plan:** 01
**Created:** 2026-02-14
**Purpose:** Document every two-user interaction path and stage transition in Stage 0 (Onboarding) and Stage 1 (Witnessing), capturing DB changes, cache updates, Ably events, and UI state for both users.

---

## Overview

This audit traces the complete two-user flow from session creation through Stage 1 completion. Each interaction path documents:
- **Trigger**: User action that initiates the flow
- **Backend**: API endpoint → controller → service → DB writes (specific tables/fields)
- **Ably Events**: Event name, payload, channel, recipients
- **Acting User (Mobile)**: Cache key updates, UI state changes
- **Partner (Mobile)**: Ably handler, cache invalidations, UI changes
- **Issues Found**: Gaps, race conditions, missing updates

---

## Stage 0: Onboarding

### Path 1: Session Creation + Invitation Send (User A only)

**Trigger:** User A calls `POST /sessions` with `{ inviteName: "Partner" }`

**Backend Flow:**

1. **Endpoint:** `POST /sessions` → `controllers/invitations.ts:createSession()`
2. **Controller Logic:**
   - Creates or finds `Relationship` with `inviteName` stored as `nickname` on `RelationshipMember`
   - Creates `Session` with `status: 'CREATED'`
   - Creates `Invitation` with 7-day expiry
   - Creates initial `StageProgress` for inviter: `{ stage: 0, status: 'IN_PROGRESS', userId: inviterID }`
   - Creates `UserVessel` for inviter
   - Creates `SharedVessel`
   - Does NOT create initial AI message (moved to separate endpoint)

3. **DB Writes:**
   - `Relationship` (if new): `{ id, createdAt }`
   - `RelationshipMember`: `{ userId: inviterID, relationshipId, nickname: inviteName }`
   - `Session`: `{ id, relationshipId, status: 'CREATED' }`
   - `Invitation`: `{ id, sessionId, invitedById: inviterID, name: inviteName, expiresAt, status: 'PENDING' }`
   - `StageProgress`: `{ sessionId, userId: inviterID, stage: 0, status: 'IN_PROGRESS' }`
   - `UserVessel`: `{ sessionId, userId: inviterID }`
   - `SharedVessel`: `{ sessionId }`

4. **Ably Events:**
   - `publishSessionCreated()` to audit stream (non-blocking, monitoring only)
   - **No partner notification** (partner doesn't exist yet)

**Acting User (Mobile - User A):**

1. **Hook:** `useCreateSession()` in `mobile/src/hooks/useSessions.ts`
2. **onSuccess Cache Updates:**
   - Invalidates `sessionKeys.lists()` to refetch session list
   - Sets `sessionKeys.detail(sessionId)` with new session data
   - Session appears in list with status `CREATED`

3. **UI Changes:**
   - Session list shows new session
   - User navigates to session detail (invitation composition screen)

**Partner (Mobile - User B):** N/A (not invited yet)

**Issues Found:**
- None identified

---

### Path 2: Invitation Message Composition (User A only)

**Trigger:** User A drafts and confirms invitation message

#### 2a. Draft Message: `PUT /sessions/:id/invitation/message`

**Backend Flow:**

1. **Endpoint:** `PUT /sessions/:id/invitation/message` → `controllers/sessions.ts:updateInvitationMessage()`
2. **Controller Logic:**
   - Validates message length (max 500 chars)
   - Validates invitation hasn't been confirmed yet
   - Updates `Invitation.invitationMessage`

3. **DB Writes:**
   - `Invitation`: `{ invitationMessage: "..." }`

4. **Ably Events:** None

**Acting User (Mobile - User A):**

1. **Hook:** `useUpdateInvitationMessage()` in `useSessions.ts`
2. **onSuccess Cache Updates:**
   - Invalidates `sessionKeys.sessionInvitation(sessionId)`

**Partner (Mobile - User B):** N/A (not invited yet)

**Issues Found:**
- None identified

#### 2b. Confirm Message: `POST /sessions/:id/invitation/confirm`

**Trigger:** User A taps "Send Invitation"

**Backend Flow:**

1. **Endpoint:** `POST /sessions/:id/invitation/confirm` → `controllers/sessions.ts:confirmInvitationMessage()`
2. **Controller Logic:**
   - Updates `Invitation`: `{ messageConfirmed: true, messageConfirmedAt: now }`
   - Updates `Session.status` to `'INVITED'`
   - Completes Stage 0 for inviter: updates `StageProgress` to `{ status: 'COMPLETED', completedAt, gatesSatisfied: { compactSigned: true, invitationSent: true } }`
   - **Advances inviter to Stage 1**: creates new `StageProgress` `{ stage: 1, status: 'IN_PROGRESS' }`
   - Generates AI transition message (via `ai-orchestrator.ts`)
   - Saves transition message as `Message` with `{ role: 'AI', stage: 1, forUserId: inviterID }`

3. **DB Writes:**
   - `Invitation`: `{ messageConfirmed: true, messageConfirmedAt: timestamp }`
   - `Session`: `{ status: 'INVITED' }`
   - `StageProgress` (Stage 0): `{ status: 'COMPLETED', completedAt, gatesSatisfied: {...} }`
   - `StageProgress` (Stage 1): `{ sessionId, userId: inviterID, stage: 1, status: 'IN_PROGRESS', startedAt }`
   - `Message`: `{ role: 'AI', content: "...", stage: 1, forUserId: inviterID }`

4. **Ably Events:** None (partner not in session yet)

**Acting User (Mobile - User A):**

1. **Hook:** `useConfirmInvitationMessage()` in `useSessions.ts`
2. **onMutate (Optimistic Updates):**
   - Sets `sessionKeys.state(sessionId).invitation.messageConfirmedAt` immediately
   - Adds "Invitation Sent" indicator to `timelineKeys.infinite(sessionId)` cache
   - **UI shows indicator immediately without waiting for server**

3. **onSuccess (Replace with Server Data):**
   - Updates `sessionKeys.state()` with server response
   - Updates `progress.myProgress.stage` to 1 (uses `data.advancedToStage`)
   - Adds transition message directly to `messageKeys.infinite()` cache
   - **Does NOT invalidate messages** (prevents re-animation)

4. **UI Changes:**
   - "Invitation Sent" indicator appears in timeline
   - Stage advances to 1 (Witnessing)
   - Transition message appears in chat

**Partner (Mobile - User B):** N/A (invitation not yet accepted)

**Issues Found:**
- **CRITICAL (Fixed):** Previous bug where invalidating `sessionKeys.state()` caused race condition overwriting optimistic update. Now uses `setQueryData` instead of `invalidateQueries` to preserve `messageConfirmedAt`.
- **Comment in code (line 1088):** "Does NOT invalidate messages queries here!" — confirms fix to prevent re-animation issues

---

### Path 3: Invitation Acceptance (User B)

**Trigger:** User B clicks invitation link, views invitation, taps "Accept"

#### 3a. View Invitation: `GET /invitations/:id`

**Backend Flow:**

1. **Endpoint:** `GET /invitations/:id` → `controllers/invitations.ts:getInvitation()`
2. **Controller Logic:**
   - Fetches `Invitation` with inviter details
   - Checks if expired
   - Returns invitation data

3. **DB Reads:** `Invitation`, `User` (inviter)

4. **Ably Events:** None

**Acting User (Mobile - User B):**

1. **Hook:** `useInvitation(invitationId)` in `useSessions.ts`
2. **UI Changes:** Displays invitation screen with inviter name and message

**Partner (Mobile - User A):** N/A (no notification)

**Issues Found:**
- None identified

#### 3b. Accept Invitation: `POST /invitations/:id/accept`

**Trigger:** User B taps "Accept Invitation"

**Backend Flow:**

1. **Endpoint:** `POST /invitations/:id/accept` → `controllers/invitations.ts:acceptInvitation()`
2. **Controller Logic:**
   - Prevents self-acceptance
   - Checks invitation is still `PENDING` and not expired
   - Joins User B to relationship (creates `RelationshipMember` if not exists)
   - Updates `Invitation.status` to `'ACCEPTED'`, sets `acceptedAt`
   - Updates `Session.status` to `'ACTIVE'`
   - Creates Stage 0 progress for accepter: `{ stage: 0, status: 'IN_PROGRESS' }`
   - Creates `UserVessel` for accepter
   - **Notifies inviter via Ably**: `notifyPartnerWithFallback()` publishes `'session.joined'` event

3. **DB Writes:**
   - `RelationshipMember`: `{ relationshipId, userId: accepterID }` (if new)
   - `Invitation`: `{ status: 'ACCEPTED', acceptedAt: timestamp }`
   - `Session`: `{ status: 'ACTIVE' }`
   - `StageProgress`: `{ sessionId, userId: accepterID, stage: 0, status: 'IN_PROGRESS' }`
   - `UserVessel`: `{ sessionId, userId: accepterID }`

4. **Ably Events:**
   - `notifyPartnerWithFallback(sessionId, inviterID, 'session.joined', { userId: accepterID, userName: "..." })`
   - Channel: `meetwithoutfear:session:${sessionId}`
   - Payload: `{ sessionId, userId: accepterID, userName, timestamp }`
   - Also publishes to inviter's user channel: `meetwithoutfear:user:${inviterID}` via `publishUserEvent()`
   - Touches `Session.updatedAt` via `notifySessionMembers()`

**Acting User (Mobile - User B):**

1. **Hook:** `useAcceptInvitation()` in `useSessions.ts`
2. **onSuccess Cache Updates:**
   - Invalidates `sessionKeys.lists()` and `sessionKeys.invitations()`
   - Sets `sessionKeys.detail(sessionId)` with session data
   - Session appears in User B's session list

3. **UI Changes:**
   - Navigates to session detail
   - Shows Compact signing screen

**Partner (Mobile - User A):**

1. **Ably Handler:** `useRealtime()` in `mobile/src/hooks/useRealtime.ts` receives `'session.joined'` event
2. **Cache Updates:**
   - Event fires `callbacksRef.current.onSessionEvent(event, data)`
   - User channel handler receives `'session.updated'` → invalidates `sessionKeys.lists()`
   - Session list refetch shows status change to `ACTIVE`

3. **UI Changes:**
   - Session in list updates to show "Partner Joined"
   - If User A is viewing the session, compact screen may update to show partner is online

**Issues Found:**
- None identified

---

### Path 4: Compact Signing (Both users independently)

**Trigger:** User signs the Curiosity Compact

#### 4a. User A Signs First

**Backend Flow:**

1. **Endpoint:** `POST /sessions/:id/compact/sign` → `controllers/stage0.ts:signCompact()`
2. **Controller Logic:**
   - Validates `{ agreed: true }`
   - Checks not already signed
   - Updates Stage 0 progress: `gatesSatisfied: { compactSigned: true, signedAt }`
   - Checks partner's compact status
   - If partner NOT signed yet:
     - Notifies partner via `notifyPartner(sessionId, partnerID, 'partner.signed_compact', { signedAt })`
     - Does NOT auto-advance
   - If partner ALREADY signed (second signer):
     - Updates `Session.status` to `'ACTIVE'` (if not already)
     - **Auto-advances this user to Stage 1**: marks Stage 0 `COMPLETED`, creates Stage 1 progress
     - Notifies partner

3. **DB Writes (First Signer):**
   - `StageProgress`: `{ gatesSatisfied: { compactSigned: true, signedAt: timestamp } }`

4. **Ably Events (First Signer):**
   - `notifyPartner(sessionId, partnerID, 'partner.signed_compact', { signedAt })`
   - Channel: `meetwithoutfear:session:${sessionId}`
   - Payload: `{ sessionId, timestamp, signedAt }`
   - Also publishes to partner's user channel

**Acting User (Mobile - User A):**

1. **Hook:** `useSignCompact()` in `useStages.ts`
2. **onMutate (Optimistic Updates):**
   - Sets `sessionKeys.state().compact.mySigned = true` immediately
   - Sets `sessionKeys.state().compact.mySignedAt` to optimistic timestamp

3. **onSuccess:**
   - Invalidates `stageKeys.compact()`, `stageKeys.progress()`, `sessionKeys.detail()`, `sessionKeys.state()`

4. **UI Changes:**
   - Compact checkmark/badge appears
   - Shows "Waiting for Partner" state

**Partner (Mobile - User B):**

1. **Ably Handler:** Receives `'partner.signed_compact'` event via `useRealtime()`
2. **Cache Updates:**
   - Invalidates `sessionKeys.state()` → compact status refetch shows `partnerSigned: true`
   - User channel handler invalidates `sessionKeys.lists()`

3. **UI Changes:**
   - Compact screen shows "Partner has signed" indicator
   - Encourages User B to sign

**Issues Found:**
- None identified

#### 4b. User B Signs Second (Triggers Stage 0→1 Transition for User B)

**Trigger:** User B signs compact after User A

**Backend Flow:**

1. **Endpoint:** `POST /sessions/:id/compact/sign` → `controllers/stage0.ts:signCompact()`
2. **Controller Logic (Second Signer):**
   - Updates User B's Stage 0 progress: `gatesSatisfied: { compactSigned: true, signedAt }`
   - Detects partner (User A) already signed
   - Ensures `Session.status = 'ACTIVE'`
   - **Auto-advances User B to Stage 1**:
     - Marks Stage 0 `COMPLETED`
     - Creates Stage 1 `StageProgress` `{ stage: 1, status: 'IN_PROGRESS', startedAt }`
   - Notifies User A: `notifyPartner(sessionId, userA_ID, 'partner.signed_compact', { signedAt })`

3. **DB Writes (Second Signer):**
   - `StageProgress` (Stage 0): `{ gatesSatisfied: {...}, status: 'COMPLETED', completedAt }`
   - `StageProgress` (Stage 1): `{ sessionId, userId: userB_ID, stage: 1, status: 'IN_PROGRESS', startedAt }`
   - `Session`: `{ status: 'ACTIVE' }` (if not already)

4. **Ably Events:**
   - `notifyPartner(sessionId, userA_ID, 'partner.signed_compact', { signedAt })`
   - Same structure as 4a

**Acting User (Mobile - User B):**

1. **Hook:** `useSignCompact()` in `useStages.ts`
2. **onMutate/onSuccess:** Same as User A above
3. **UI Changes:**
   - Advances to Stage 1 chat interface
   - Shows initial AI greeting message (if pre-loaded)

**Partner (Mobile - User A):**

1. **Ably Handler:** Receives `'partner.signed_compact'` event
2. **Cache Updates:**
   - Invalidates caches → refetch shows both signed, stage advances
   - **Question:** Does User A auto-advance to Stage 1 upon receiving this event, or do they need to re-sign?
     - **Code Review:** User A was already advanced in step 4a when they signed second. If User B signed first, User A would advance when they sign.

3. **UI Changes:**
   - Compact overlay dismisses
   - Advances to Stage 1 chat interface

**Issues Found:**
- **POTENTIAL RACE CONDITION:** If User A signed first but their client is offline/suspended when User B signs second, User A may not receive the `partner.signed_compact` event immediately. Upon reconnect:
  - User A's cache may be stale (shows `partnerSigned: false`)
  - User A may still see "Waiting for Partner" state
  - **Mitigation:** User A needs to refetch state on reconnect or app foreground
  - **Severity:** Medium — affects UX but resolves on next refetch

---

### Path 5: Stage 0 → Stage 1 Transition

**Trigger Conditions:**

- **For Inviter (User A):** Invitation message confirmed → `confirmInvitationMessage()` advances immediately to Stage 1
- **For Invitee (User B):** Accepting invitation → stays in Stage 0 until both sign compact
- **For Both Users:** Second compact signer triggers auto-advance for that user (via `signCompact()`)

**Unified Transition Logic:**

1. **Mark Stage 0 Complete:**
   - `StageProgress` (Stage 0): `{ status: 'COMPLETED', completedAt, gatesSatisfied: { compactSigned: true, ... } }`

2. **Create Stage 1 Progress:**
   - `StageProgress` (Stage 1): `{ stage: 1, status: 'IN_PROGRESS', startedAt, gatesSatisfied: {} }`

3. **Session Status Check:**
   - If both users have signed compact AND session is `INVITED`, update to `ACTIVE`

4. **AI Transition Message:**
   - For inviter: generated in `confirmInvitationMessage()`
   - For invitee: no transition message (uses initial greeting)

**Cache Updates (Both Users):**

- `sessionKeys.state().progress.myProgress.stage` → 1
- `sessionKeys.state().progress.myProgress.status` → `'IN_PROGRESS'`

**UI Changes (Both Users):**

- Dismisses compact overlay
- Shows Stage 1 chat interface
- Displays first AI message

**Issues Found:**
- **ASYMMETRY:** Inviter gets proactive transition message explaining Stage 1. Invitee does not get transition message upon compact signing — they must request initial message via separate endpoint.
- **Severity:** Low — UX inconsistency, not a bug

---

## Stage 1: Witnessing

### Path 1: Message Send + AI Response (Each user independently)

**Trigger:** User sends message via chat interface

#### 1a. User Sends Message

**Backend Flow:**

1. **Endpoint:** `POST /sessions/:id/messages/stream` → `controllers/messages.ts:streamMessage()`
2. **Controller Logic:**
   - Saves user message to DB: `Message { role: 'USER', senderId: userId, content, stage }`
   - Initiates AI response generation (via `ai-orchestrator.ts`)
   - Streams response via SSE (Server-Sent Events)
   - After streaming completes, saves AI message: `Message { role: 'AI', forUserId, content, stage }`
   - Publishes AI response via Ably: `publishMessageAIResponse(sessionId, forUserId, message, metadata)`

3. **DB Writes:**
   - `Message` (User): `{ sessionId, senderId: userId, role: 'USER', content, stage: 1, timestamp }`
   - `Message` (AI): `{ sessionId, senderId: null, forUserId: userId, role: 'AI', content, stage: 1, timestamp }`

4. **Ably Events:**
   - After AI response completes:
     - `publishMessageAIResponse(sessionId, forUserId, message, { offerFeelHeardCheck: true })`
     - Channel: `meetwithoutfear:session:${sessionId}`
     - Event: `'message.ai_response'`
     - Payload: `{ sessionId, forUserId, message, offerFeelHeardCheck, timestamp }`

**Acting User (Mobile):**

1. **Hook:** `useSendMessage()` in `mobile/src/hooks/useMessages.ts`
2. **onMutate (Optimistic Updates):**
   - Adds user message to `messageKeys.infinite(sessionId)` cache immediately
   - **UI shows message instantly without waiting for server**

3. **SSE Streaming:**
   - `useStreamingMessage()` hook receives chunks via EventSource
   - Handles events: `user_message` → `chunk` (many) → `metadata` → `text_complete` → `complete`
   - Adds AI message to cache as chunks arrive (typewriter effect)

4. **Ably Handler:**
   - If using fire-and-forget pattern (not SSE), receives `'message.ai_response'` event
   - Adds AI message to cache
   - Processes `offerFeelHeardCheck` metadata → shows "Feel Heard" panel

5. **UI Changes:**
   - User message appears immediately
   - AI response appears character-by-character (typewriter)
   - "Feel Heard" confirmation panel appears after AI response

**Partner (Mobile):**

1. **Ably Handler:** Receives `'message.ai_response'` event (filtered by `forUserId`)
   - If `event.forUserId !== currentUserId`, event is ignored (data isolation)

2. **Cache Updates:** None (message is private to acting user)

3. **UI Changes:** None (partner doesn't see the other user's messages)

**Issues Found:**
- **DATA ISOLATION CONFIRMED:** Messages in Stage 1 are private. Each user has their own conversation with AI. Partner does not receive events or see messages.

---

#### 1b. AI Response Error Handling

**Trigger:** AI processing fails

**Backend Flow:**

1. **Error Handler:** `controllers/messages.ts` catches error during AI response generation
2. **Ably Event:** `publishMessageError(sessionId, forUserId, userMessageId, errorMessage, canRetry: true)`
3. **Payload:** `{ sessionId, forUserId, userMessageId, error: "AI processing failed", canRetry: true, timestamp }`

**Acting User (Mobile):**

1. **Ably Handler:** `useRealtime()` receives `'message.error'` event
2. **Cache Updates:**
   - Optionally removes optimistic message
   - Shows error state on message

3. **UI Changes:**
   - Error banner appears
   - "Retry" button shown if `canRetry: true`

**Partner (Mobile):** N/A (event filtered by `forUserId`)

**Issues Found:**
- None identified

---

### Path 2: Feel-Heard Confirmation (Each user independently)

**Trigger:** User taps "Yes, I feel heard" after receiving AI responses

**Backend Flow:**

1. **Endpoint:** `POST /sessions/:id/feel-heard` → `controllers/messages.ts:confirmFeelHeard()`
2. **Controller Logic:**
   - Records feel-heard confirmation in Stage 1 progress: `gatesSatisfied: { feelHeardConfirmed: true, feelHeardConfirmedAt: timestamp }`
   - Updates `milestones.feelHeardConfirmedAt`
   - Checks if both users have confirmed feel-heard → if yes, **both can advance to Stage 2**
   - Generates transition message (via `ai-orchestrator.ts`)
   - **Advances user to Stage 2**:
     - Marks Stage 1 `COMPLETED`
     - Creates Stage 2 progress `{ stage: 2, status: 'IN_PROGRESS' }`

3. **DB Writes:**
   - `StageProgress` (Stage 1): `{ gatesSatisfied: { feelHeardConfirmedAt: timestamp }, status: 'COMPLETED', completedAt }`
   - `StageProgress` (Stage 2): `{ sessionId, userId, stage: 2, status: 'IN_PROGRESS', startedAt }`
   - `Message`: `{ role: 'AI', content: "transition to Stage 2", stage: 2, forUserId }`

4. **Ably Events:** None (Stage 2 transition is private until empathy sharing)

**Acting User (Mobile):**

1. **Hook:** `useConfirmFeelHeard()` in `useStages.ts`
2. **onMutate (Optimistic Updates):**
   - Sets `sessionKeys.state().progress.milestones.feelHeardConfirmedAt` immediately
   - Sets `sessionKeys.state().progress.myProgress.stage` to `Stage.PERSPECTIVE_STRETCH` (hardcoded Stage 2)

3. **onSuccess (CRITICAL FIX):**
   - **Does NOT invalidate `sessionKeys.state()`** to prevent race condition
   - Uses `setQueryData()` to update cache directly with server response
   - Adds transition message directly to `messageKeys.infinite()` cache
   - **Avoids re-animation** by not invalidating messages query

4. **UI Changes:**
   - "Feel Heard" panel dismisses
   - Stage advances to 2 (Perspective Stretch)
   - Transition message appears
   - Empathy drafting panel appears

**Partner (Mobile):**

1. **Ably Events:** None (confirmation is private)
2. **Cache Updates:** None (stage advancement is private until empathy sharing)
3. **UI Changes:** None

**Issues Found:**
- **CRITICAL (Fixed):** Previous bug where invalidating `sessionKeys.state()` caused refetch to overwrite optimistic stage update with stale server data. This broke empathy panel display.
- **Fix:** Lines 578-603 in `useStages.ts` — uses `setQueryData()` instead of `invalidateQueries()` for session state.
- **Comment References:** Commits 6c6504e, d16a32f, 1151ab9 documented this recurring bug pattern.

---

### Path 3: Stage 1 → Stage 2 Transition (When both confirm feel-heard)

**Trigger Conditions:**

- Each user independently confirms feel-heard → advances to Stage 2
- **No synchronization gate** — users can advance at different times
- Transition is private until empathy statements are shared in Stage 2

**Transition Logic (Per User):**

1. **Mark Stage 1 Complete:**
   - `StageProgress` (Stage 1): `{ status: 'COMPLETED', completedAt, gatesSatisfied: { feelHeardConfirmedAt: timestamp } }`

2. **Create Stage 2 Progress:**
   - `StageProgress` (Stage 2): `{ stage: 2, status: 'IN_PROGRESS', startedAt, gatesSatisfied: {} }`

3. **Generate Transition Message:**
   - AI explains Stage 2 (Perspective Stretch) and prompts empathy drafting

**Cache Updates (Per User):**

- `sessionKeys.state().progress.myProgress.stage` → 2
- `sessionKeys.state().progress.myProgress.status` → `'IN_PROGRESS'`
- `sessionKeys.state().progress.milestones.feelHeardConfirmedAt` → timestamp

**UI Changes (Per User):**

- Advances to Stage 2 interface
- Shows empathy drafting UI
- Displays transition message explaining next steps

**Issues Found:**
- **ASYMMETRIC ADVANCEMENT:** Users can be in different stages (User A in Stage 2, User B still in Stage 1). This is by design but creates complexity for "waiting state" UI.
- **Severity:** Informational — expected behavior

---

### Path 4: Waiting State (When stages are mismatched)

**Trigger:** One user completes a stage gate before their partner

**Example:** User A confirms feel-heard and advances to Stage 2, but User B is still in Stage 1.

**Backend Logic:**

1. **Service:** `backend/src/services/waitingStatusConfig.ts` and `getWaitingStatus.ts`
2. **Computation:**
   - Checks `myProgress.stage` vs `partnerProgress.stage`
   - Checks gate satisfaction (e.g., `feelHeardConfirmedAt` for Stage 1)
   - Returns waiting status: `{ isWaiting: true, reason: "partner_behind", partnerNeedsTo: "confirm feel heard" }`

**Acting User (Mobile - User A, now in Stage 2):**

1. **UI Query:** `useProgress(sessionId)` fetches progress for both users
2. **Computation:** `computeWaitingStatus()` runs client-side
3. **UI Changes:**
   - If User A is ahead but not blocked, continues to Stage 2 work
   - May show subtle indicator "Waiting for Partner to complete Stage 1"

**Partner (Mobile - User B, still in Stage 1):**

1. **UI Query:** `useProgress(sessionId)` fetches progress
2. **Computation:** May show "Partner is ahead" indicator
3. **UI Changes:**
   - Encourages User B to continue Stage 1 work

**Issues Found:**
- **UNCLEAR UX:** Waiting status is computed but not always surfaced clearly in UI. Users may not know their partner is waiting.
- **Severity:** Low — UX clarity issue, not a functional bug

---

## Summary of Issues

### Critical (Fixed)

1. **Stage Advancement Cache Race Condition** (`useConfirmFeelHeard()` and `useConfirmInvitationMessage()`)
   - **Found During:** Path 2 (Feel-Heard Confirmation) and Stage 0 Path 2b (Invitation Confirm)
   - **Issue:** Invalidating `sessionKeys.state()` caused refetch to overwrite optimistic stage update with stale server data before DB committed new stage.
   - **Symptom:** Empathy panel wouldn't appear after feel-heard confirmation; invitation indicator would disappear and reappear.
   - **Fix:** Use `setQueryData()` instead of `invalidateQueries()` to directly update cache with server response. Prevents race condition by not triggering refetch during mutation.
   - **Files Modified:** `mobile/src/hooks/useStages.ts` (lines 578-603), `mobile/src/hooks/useSessions.ts` (lines 614-678)
   - **Commits:** 6c6504e, d16a32f, 1151ab9
   - **Status:** Fixed and documented in code comments

### Medium

2. **Compact Signing Race Condition**
   - **Found During:** Path 4 (Compact Signing)
   - **Issue:** If first signer (User A) is offline when second signer (User B) completes compact, User A won't receive `partner.signed_compact` event until reconnect. User A's cache shows stale data (`partnerSigned: false`).
   - **Symptom:** User A sees "Waiting for Partner" even though both have signed.
   - **Fix:** Requires refetch on reconnect or app foreground (not currently implemented as automatic behavior).
   - **Severity:** Medium — affects UX but resolves on next manual refetch or navigation
   - **Recommendation:** Add automatic state refetch on Ably reconnect event

### Low

3. **Asymmetric Transition Messages**
   - **Found During:** Path 5 (Stage 0→1 Transition)
   - **Issue:** Inviter receives proactive transition message explaining Stage 1. Invitee does not receive transition message upon signing compact.
   - **Symptom:** Invitee may be confused about next steps.
   - **Severity:** Low — UX inconsistency, not a functional bug
   - **Recommendation:** Generate transition message for invitee upon compact signing (second signer)

4. **Waiting Status UX Clarity**
   - **Found During:** Path 4 (Waiting State)
   - **Issue:** Waiting status is computed but not always clearly surfaced in UI.
   - **Symptom:** Users may not know their partner is waiting for them to complete a gate.
   - **Severity:** Low — UX clarity issue
   - **Recommendation:** Add prominent "Partner is waiting" indicators when gates are misaligned

### Informational

5. **Data Isolation Confirmed**
   - **Found During:** Path 1 (Message Send)
   - **Observation:** Messages in Stage 1 are private to each user. Partner does not receive Ably events or see messages. `forUserId` filtering works correctly.
   - **Status:** Working as designed

6. **Asymmetric Stage Advancement**
   - **Found During:** Path 3 (Stage 1→2 Transition)
   - **Observation:** Users can advance to different stages independently. No synchronization gate between Stage 1 and Stage 2.
   - **Status:** Working as designed — expected behavior

---

## Code References

### Backend

- **Invitations:** `backend/src/controllers/invitations.ts` (createSession, acceptInvitation)
- **Sessions:** `backend/src/controllers/sessions.ts` (getSession, confirmInvitationMessage, updateInvitationMessage)
- **Stage 0:** `backend/src/controllers/stage0.ts` (signCompact, getCompactStatus)
- **Messages:** `backend/src/controllers/messages.ts` (streamMessage, confirmFeelHeard)
- **Realtime:** `backend/src/services/realtime.ts` (publishSessionEvent, notifyPartner, publishMessageAIResponse)

### Mobile

- **Session Hooks:** `mobile/src/hooks/useSessions.ts` (useCreateSession, useAcceptInvitation, useConfirmInvitationMessage)
- **Stage Hooks:** `mobile/src/hooks/useStages.ts` (useSignCompact, useConfirmFeelHeard)
- **Message Hooks:** `mobile/src/hooks/useMessages.ts` (useSendMessage)
- **Realtime:** `mobile/src/hooks/useRealtime.ts` (event subscription, Ably handlers)
- **Query Keys:** `mobile/src/hooks/queryKeys.ts` (centralized cache key definitions)

### Shared

- **Realtime DTOs:** `shared/src/dto/realtime.ts` (SessionEventType, Ably channel names)
- **Session DTOs:** `shared/src/dto/session-state.ts` (SessionStateResponse, Progress)
- **Enums:** `shared/src/enums.ts` (Stage, SessionStatus, StageStatus)

---

**End of Stage 0-1 Audit**

*Next Steps:* Use this audit as foundation for Stage 0-1 reliability improvements (Phase 01-audit subsequent plans).
