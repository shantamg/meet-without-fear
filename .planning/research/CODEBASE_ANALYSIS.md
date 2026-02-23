# Meet Without Fear - Codebase Analysis

**Date:** February 22, 2026
**Purpose:** Comprehensive system documentation for redesign team
**Scope:** Share page, Stage system, reconciler, empathy flow, real-time events, notifications

---

## Executive Summary

The current system uses a **single integrated SharingStatusScreen** that displays all empathy-related activity (user's attempt, partner's attempt, share suggestions, shared context history). The **reconciler runs asymmetrically** after each person completes their stage, generating gap-based share suggestions. Real-time updates come via **Ably event streaming** with SSE fallback.

Key architectural patterns:
- **Cache-first state management** via React Query (critical: cache keys must match between write and read)
- **Delivery status tracking** for shared content (sending → pending → delivered → seen)
- **Circuit breaker logic** (max 3 refinement attempts per direction to prevent infinite loops)
- **Optimistic updates** for all mutations with rollback on error

---

## 1. SHARE PAGE SYSTEM

### Current Implementation

**Screen:** `mobile/src/screens/SharingStatusScreen.tsx`

This is THE main sharing interface, consolidating everything previously scattered across drawers.

#### Layout (top to bottom):
1. **Pending Actions Section**
   - Share suggestion card(s) from reconciler
   - Shows count badge if multiple actions
   - Highest priority (appears first)

2. **My Empathy Attempt Card**
   - Shows what I said/drafted
   - Current status badge (HELD, ANALYZING, AWAITING_SHARING, REFINING, READY, REVEALED, VALIDATED)
   - Action buttons vary by status
   - If status is AWAITING_SHARING: inline edit mode for refinement

3. **Partner's Empathy Attempt Card**
   - Shows partner's empathy statement (only when REVEALED)
   - If not yet revealed: shows status (HELD, ANALYZING, etc.)
   - Validation buttons if REVEALED but not validated:
     - "This feels accurate"
     - "Partially accurate"
     - "This misses the mark" (returns to chat)

4. **Shared Context Timeline**
   - Chronological list of all sharing activity
   - Shows what was shared, when, and delivery status
   - Bidirectional (both my shared context and partner's)

#### Key Components:
- `EmpathyAttemptCard` - Display empathy with status badge and validation buttons
- `ShareSuggestionCard` - Reconciler suggestion with inline edit UI for refinement
- `SharedContextTimeline` - Chronological history of all sharing events
- `BadgeIndicator` - Shows count of pending actions (on share button in header)

#### Navigation:
- Accessed via "Share" button in `SessionChatHeader` (top-right)
- Route: `router.push('/session/[id]/sharing-status')`
- Back navigation returns to `UnifiedSessionScreen` (main chat)

#### Data Source:
- Hook: `useSharingStatus()` provides composite data:
  - `myAttempt` - My empathy statement
  - `partnerAttempt` - Partner's empathy statement
  - `shareOffer` - Current share suggestion from reconciler
  - `hasSuggestion` - Whether suggestion pending
  - `isAnalyzing` - Whether reconciler is running
  - `pendingActionsCount` - For badge display
  - `sharedContextHistory` - All sharing events
  - `hasNewSharedContext` - Unviewed shared context indicator
  - `partnerValidated` - Whether partner validated my attempt
  - `sharedContentDeliveryStatus` - Delivery status of my shared content

---

## 2. STAGE SYSTEM

### Stage Progression

**Enum:** `shared/src/enums.ts`

```typescript
export enum Stage {
  ONBOARDING = 0,           // Compact signed
  WITNESS = 1,              // Feel heard confirmed
  PERSPECTIVE_STRETCH = 2,  // Empathy drafted, consented, validated
  NEED_MAPPING = 3,         // Needs confirmed
  STRATEGIC_REPAIR = 4,     // Strategies agreed
}

export const STAGE_NAMES: Record<Stage, string> = {
  [Stage.ONBOARDING]: 'Onboarding',
  [Stage.WITNESS]: 'The Witness',
  [Stage.PERSPECTIVE_STRETCH]: 'Perspective Stretch',
  [Stage.NEED_MAPPING]: 'Need Mapping',
  [Stage.STRATEGIC_REPAIR]: 'Strategic Repair',
};
```

### Stage Gates

**DTO:** `shared/src/dto/stage.ts`

Each stage has specific requirements (gates) that must be satisfied before advancement:

**Stage 0 (ONBOARDING):**
- `compactSigned: boolean` - Both users signed the Curiosity Compact
- `compactSignedAt: string | null` - Timestamp of signing

**Stage 1 (WITNESS):**
- `feelHeardConfirmed: boolean` - User confirmed they feel heard
- `feelHeardConfirmedAt: string | null` - Timestamp
- `finalEmotionalReading: number | null` - Optional 1-10 scale
- `feelHeardCheckOffered?: boolean` - AI has offered the check

**Stage 2 (PERSPECTIVE_STRETCH):**
- `empathyDraftReady: boolean` - Draft created
- `empathyConsented: boolean` - User consented to share (clicked "Ready to Share")
- `partnerConsented: boolean` - Partner has also consented
- `partnerValidated: boolean` - Partner confirmed accuracy

**Stage 3 (NEED_MAPPING):**
- `needsConfirmed: boolean` - User confirmed their needs
- `partnerNeedsConfirmed: boolean` - Partner confirmed theirs
- `commonGroundConfirmed: boolean` - Common ground identified

**Stage 4 (STRATEGIC_REPAIR):**
- `strategiesSubmitted: boolean` - User submitted strategies
- `rankingsSubmitted: boolean` - User ranked partner's strategies
- `overlapIdentified: boolean` - Overlap found
- `agreementCreated: boolean` - Agreement made

### Stage Advancement

**API:** `POST /sessions/:id/stages/advance`

```typescript
AdvanceStageRequest {
  sessionId: string;
  fromStage: Stage;
  toStage: Stage;
}

AdvanceStageResponse {
  success: boolean;
  newProgress: StageProgressDetailDTO;
  blockedReason?: StageBlockedReason;  // If failed
  unsatisfiedGates?: string[];         // Which gates not met
}

enum StageBlockedReason {
  GATES_NOT_SATISFIED = 'GATES_NOT_SATISFIED',
  PARTNER_NOT_READY = 'PARTNER_NOT_READY',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  INVALID_STAGE_TRANSITION = 'INVALID_STAGE_TRANSITION',
}
```

### Current Stage Status Tracking

**API:** `GET /sessions/:id/progress`

```typescript
GetProgressResponse {
  sessionId: string;
  myProgress: StageProgressDetailDTO;      // My current stage + gates
  partnerProgress: PartnerStageStatusDTO;  // Partner's stage (no gate details)
  canAdvance: boolean;
  advanceBlockedReason?: StageBlockedReason;
  milestones?: SessionMilestonesDTO;       // Historical markers (feelHeardConfirmedAt)
}
```

### Cache Key Pattern

```typescript
// In mobile/src/hooks/queryKeys.ts
sessionKeys = {
  state: (id: string) => ['sessions', id, 'state'],
  // ... other keys
}

stageKeys = {
  progress: (id: string) => ['stages', id, 'progress'],
  empathyStatus: (id: string) => ['stages', id, 'empathy', 'status'],
  shareOffer: (id: string) => ['stages', id, 'empathy', 'share-offer'],
  // ... other keys
}
```

### Important: Stage Mutation Updates

When mutations advance stages:
- `sessionKeys.state` cache MUST be manually updated with new stage
- `sessionKeys.state` is **NOT invalidated** after mutations (prevents race conditions)
- Example: `useConfirmFeelHeard` updates `data.advancedToStage` directly in cache

---

## 3. RECONCILER SERVICE

### Purpose

The **Empathy Reconciler** detects gaps between:
- What Person A guessed about Person B's feelings (empathy draft)
- What Person B actually expressed (Stage 1 content)

It runs **asymmetrically** - when B completes Stage 1, reconciler analyzes A→B gap.

### Reconciler Flow Diagram

```
User A completes Stage 2 (shares empathy)
  ↓
  Status: HELD (waiting for partner to complete Stage 1)
  ↓
User B completes Stage 1 (confirms "I feel heard")
  ↓
  TRIGGERS: Reconciler.analyzeGaps(A→B)
  ↓
Reconciler compares A's guess vs B's actual content
  ↓
  Gap Analysis Results:
  ├─ None/Minimal → Status: READY, reveal A's empathy
  ├─ Moderate → Status: AWAITING_SHARING, offer optional refinement
  └─ Significant → Status: AWAITING_SHARING, require refinement
  ↓
If gaps exist:
  ├─ Generate ShareSuggestionDTO for B (the subject)
  ├─ B can: Accept, Decline, or Refine suggestion
  ├─ If B Accepts/Refines:
  │   ├─ Create SHARED_CONTEXT message
  │   ├─ Publish event: empathy.context_shared
  │   └─ A's status: REFINING (can refine empathy in chat)
  ├─ If B Declines:
  │   └─ A's status: READY, reveal as-is
  └─ If A refines in chat:
      ├─ Emit ResubmitEmpathyRequest
      ├─ Create new empathy attempt version
      ├─ Status: ANALYZING (rerun reconciler)
      └─ Check circuit breaker (max 3 attempts)
  ↓
Once A's empathy approved (or B declined):
  ├─ A's status: REVEALED
  ├─ B can now see A's empathy in chat
  └─ B can validate (accurate/partial/inaccurate)
```

### Empathy Status States

**Defined in:** `shared/src/dto/empathy.ts`

```typescript
export const EmpathyStatus = {
  HELD: 'HELD',                      // Waiting for partner to complete Stage 1
  ANALYZING: 'ANALYZING',             // Reconciler comparing guess vs actual
  AWAITING_SHARING: 'AWAITING_SHARING', // Gaps detected, awaiting subject's response
  REFINING: 'REFINING',               // Subject shared context, guesser refining
  NEEDS_WORK: 'NEEDS_WORK',           // Legacy - use AWAITING_SHARING
  READY: 'READY',                     // Reconciliation done, waiting for partner before reveal
  REVEALED: 'REVEALED',               // Recipient can now see statement
  VALIDATED: 'VALIDATED',             // Recipient confirmed accuracy
};
```

### Reconciler API Endpoints

**File:** `backend/src/routes/reconciler.ts`

```
POST   /sessions/:id/reconciler/run
       → Manually trigger reconciler analysis

GET    /sessions/:id/reconciler/status
       → Get current reconciliation status

GET    /sessions/:id/reconciler/share-offer
       → Get pending share suggestion (for subject)
       → Returns: ShareSuggestionDTO

POST   /sessions/:id/reconciler/share-offer/respond
       → Subject accepts, declines, or refines suggestion
       → Payload: { action: 'accept' | 'decline' | 'refine', refinedContent?: string }
       → Creates SHARED_CONTEXT message for guesser

POST   /sessions/:id/reconciler/share-offer/skip
       → Subject skips refinement check (acceptance check)

POST   /sessions/:id/reconciler/share-offer/generate-draft
       → Generate AI draft for refinement

GET    /sessions/:id/reconciler/summary
       → Reconciler result summary for my attempt
       → Returns: ReconcilerResultSummary
```

### Share Suggestion DTO

**File:** `shared/src/dto/empathy.ts`

```typescript
export interface ShareSuggestionDTO {
  // Who is trying to understand (the guesser)
  guesserName: string;

  // Topic/area to share (Phase 1 of two-phase flow)
  suggestedShareFocus: string | null;

  // AI-generated draft content (Phase 2)
  suggestedContent: string;

  // Why sharing helps
  reason: string;

  // Can user refine?
  canRefine: boolean;

  // Determines UI language/styling:
  action: 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING';
}
```

### Gap Detection Logic

**File:** `backend/src/services/reconciler.ts`

Key function: `analyzeEmotionalGaps()`
- Compares semantic similarity between A's guess and B's actual content
- Uses embedding distance to measure gaps
- Generates gap severity: 'none' | 'minor' | 'moderate' | 'significant'

### Circuit Breaker (Refinement Loop Prevention)

```typescript
// Prevents infinite refinement loops
checkAndIncrementAttempts(attemptDirection: string) {
  // Max 3 refinement attempts per direction (A→B or B→A)
  // On 4th attempt:
  // - Skip reconciler analysis
  // - Use natural transition message instead of accuracy feedback
  // - Mark empathy as READY
}
```

**Also checks:**
```typescript
hasContextAlreadyBeenShared(guesserUserId, subjectUserId) {
  // Prevents offering sharing twice to same person
  // Checks for existing SHARED_CONTEXT messages
}
```

---

## 4. EMPATHY FLOW

### DTOs

**File:** `shared/src/dto/empathy.ts`

#### Drafting

```typescript
export interface EmpathyDraftDTO {
  id: string;
  content: string;
  version: number;
  readyToShare: boolean;  // User marked as ready
  updatedAt: string;
}

export interface SaveEmpathyDraftRequest {
  sessionId: string;
  content: string;
  readyToShare?: boolean;  // Mark as ready in one call
}

export interface SaveEmpathyDraftResponse {
  draft: EmpathyDraftDTO;
  readyToShare: boolean;
}
```

#### Consent to Share

```typescript
export interface ConsentToShareEmpathyRequest {
  sessionId: string;
  draftId: string;
  finalContent?: string;  // Override draft if needed
}

export interface ConsentToShareEmpathyResponse {
  consented: boolean;
  consentedAt: string | null;
  partnerConsented: boolean;      // Has partner also consented?
  canReveal: boolean;             // Both consented?
  status: EmpathyStatus;          // Current status
  empathyMessage: ConsentMessageDTO;  // Statement added to chat
  transitionMessage: ConsentMessageDTO | null;  // AI transition message
}
```

#### Validation (Receiver)

```typescript
export interface ValidateEmpathyRequest {
  sessionId: string;
  validated: boolean;  // true = accurate, false = not accurate
  feedback?: string;   // Optional feedback
  consentToShareFeedback?: boolean;
}

export interface ValidateEmpathyResponse {
  validated: boolean;
  validatedAt: string | null;
  feedbackShared: boolean;
  awaitingRevision: boolean;   // Guesser refining?
  canAdvance: boolean;         // Both validated?
  partnerValidated: boolean;
}
```

### Refinement Flow

When user needs to refine empathy after receiving feedback:

**Step 1: AI guides refinement in chat**
```typescript
export interface RefineEmpathyRequest {
  message: string;  // User's response to AI refinement prompt
}

export interface RefineEmpathyResponse {
  response: string;           // AI's next question
  proposedRevision: string | null;  // Updated statement (null if still exploring)
  canResubmit: boolean;       // Ready to resubmit?
}
```

**Step 2: User resubmits revised statement**
```typescript
export interface ResubmitEmpathyRequest {
  content: string;  // Revised empathy statement
}

export interface ResubmitEmpathyResponse {
  status: EmpathyStatus;  // Will be ANALYZING
  message: string;
  empathyMessage: {
    id: string;
    content: string;
    timestamp: string;
    stage: number;
    deliveryStatus: SharedContentDeliveryStatus;
  };
  transitionMessage?: ConsentMessageDTO | null;
}
```

### Delivery Status Tracking

**File:** `shared/src/dto/empathy.ts`

```typescript
export const SharedContentDeliveryStatus = {
  SENDING: 'sending',        // Optimistic UI (being sent)
  PENDING: 'pending',        // Saved but not delivered
  DELIVERED: 'delivered',    // Delivered to recipient's chat
  SEEN: 'seen',             // Recipient viewed it
  SUPERSEDED: 'superseded', // Replaced by newer version (not delivered)
};
```

**Flow:**
1. User sends → Optimistic: `SENDING`
2. Server saves → Real: `PENDING`
3. Ably event published → `DELIVERED` (added to partner's cache)
4. Partner views message → `SEEN`
5. If user resubmits before delivery → `SUPERSEDED`

---

## 5. REAL-TIME EVENTS (ABLY)

### Client Setup

**File:** `mobile/src/lib/ably.ts`

```typescript
// Singleton Ably client (survives Fast Refresh in dev)
getAblyClient(): Promise<Realtime>
getAblyClientSync(): Realtime | null
isAblyConnected(): boolean
reconnectAbly(): void
disconnectAbly(): void
refreshAblyToken(sessionId: string): Promise<void>
```

Features:
- Token-based authentication
- Auto-reconnect with configurable timeouts
- Custom log filtering (hides capability errors)
- Token refresh on new session creation

### Backend Event Publishing

**File:** `backend/src/services/realtime.ts`

Events published per session:

```typescript
// Empathy-related
'partner.empathy_shared'
  → Partner shared their empathy attempt

'partner.additional_context_shared'
  → Partner shared context in response to share suggestion

'partner.empathy_revealed'
  → Partner's empathy was revealed (reconciliation complete)

'empathy.share_suggestion'
  → Share suggestion pending (for subject)

'empathy.context_shared'
  → Additional context was shared

'empathy.status_updated'
  → Status changed (e.g., HELD → ANALYZING)

// Session lifecycle
'session.joined'
'session.paused'
'session.resumed'
'session.resolved'
```

### Event Structure

```typescript
type RealtimeEvent = {
  type: 'user_message' |   // Start of SSE stream
        'chunk' |          // Part of AI response (many)
        'metadata' |       // Tool outputs/metadata
        'text_complete' |  // AI response complete
        'complete';        // Final confirmation

  data?: {
    content?: string;      // For 'chunk' type
    id?: string;          // For 'text_complete'
    metadata?: StreamMetadata;  // For 'metadata' type
  };
}

type StreamMetadata = {
  offerFeelHeardCheck?: boolean;
  offerReadyToShare?: boolean;
  invitationMessage?: string | null;
  proposedEmpathyStatement?: string | null;
  analysis?: string;
};
```

### Event Handling

**File:** `mobile/src/hooks/useStreamingMessage.ts`

SSE flow:
1. `user_message` → Start stream, create optimistic user message
2. `chunk` → Accumulate AI response text (throttled 50ms)
3. `metadata` → Extract metadata (updates cache directly)
4. `text_complete` → Final text, get message ID
5. `complete` → Stream closes

**Callback chain:**
```
onMetadata (streaming)
  → handleMetadata (cache update)
  → onMetadata callback (state update)
  → handleStreamMetadata in useUnifiedSession (panel visibility)
```

---

## 6. CHAT SYSTEM

### Message Sending

**Hook:** `mobile/src/hooks/useMessages.ts`

```typescript
useMessages(sessionId: string, stage?: Stage)
  → Query for messages (optional stage filter)
  → Returns: { messages, hasMore, isFetching }

useInfiniteMessages(sessionId: string, stage?: Stage)
  → Paginated infinite scroll
  → Cursor-based pagination

useMutateMessage(sessionId: string)
  → Send message to AI
  → Handles SSE streaming
  → Cache: messageKeys.list(sessionId, stage)
  → Stale time: 10 seconds
```

### Message Types

**Enum:** `shared/src/enums.ts`

```typescript
export enum MessageRole {
  USER = 'USER',                    // User's message
  AI = 'AI',                        // AI response
  SYSTEM = 'SYSTEM',               // System message
  EMPATHY_STATEMENT = 'EMPATHY_STATEMENT',        // User's shared empathy
  SHARE_SUGGESTION = 'SHARE_SUGGESTION',          // Reconciler suggestion
  SHARED_CONTEXT = 'SHARED_CONTEXT',              // User shared context
}
```

### DTO

```typescript
export interface MessageDTO {
  id: string;
  sessionId: string;
  sourceUserId: string;  // Who sent it
  role: MessageRole;
  content: string;
  stage: number;         // Which stage it's from
  timestamp: string;
  metadata?: {
    [key: string]: unknown;
  };
  emotion?: EmotionDTO;  // Optional emotion label
  deliveryStatus?: SharedContentDeliveryStatus;  // For shared content
}
```

### Typing Indicator (Ghost Dots)

**How it works:** Derived from last message role, NOT a boolean state

```typescript
// In UnifiedSessionScreen
const messages = useMessages(sessionId);
const isWaitingForAI =
  messages.length > 0 &&
  messages[messages.length - 1]?.role === MessageRole.USER;

// When user sends message:
// 1. Added to cache with role: USER
// 2. isWaitingForAI = true → dots show
// 3. AI response arrives (via Ably) with role: AI
// 4. isWaitingForAI = false → dots hide
```

**Benefits:**
- No race conditions (dots tied to actual message)
- Survives app reload (cache-based)
- No manual state to clear

---

## 7. CHAT ROUTER (Semantic Routing)

### Purpose

Routes user messages to appropriate handlers based on intent detection.

**File:** `backend/src/services/chat-router/`

### Intent Detectors

- `help` - User asking for help
- `session_creation` - Creating new session
- `session_switch` - Switching between sessions
- `conversation` - Continuing conversation (default)

### Handlers

- `help.ts` - Help requests
- `session-creation.ts` - New session flow
- `session-switch.ts` - Session switching
- `conversation.ts` - Main conversation handler
- `witnessing.ts` - Stage-specific handling

---

## 8. CURRENT REFINEMENT FLOW

### How Refinement Works Today

The refinement happens **in chat** before the user resubmits their empathy statement.

**Scenario:**
1. User shares empathy (status: HELD)
2. Partner completes Stage 1
3. Reconciler finds gaps (status: AWAITING_SHARING)
4. Partner receives share suggestion in SharingStatusScreen
5. Partner can inline-edit in `ShareSuggestionCard`:
   - Taps "Edit" button
   - TextInput appears with "How would you like to change this?"
   - Partner sends refinement message
   - AI responds with guidance
   - AI proposes revised content
6. Partner accepts/adjusts revision
7. Partner taps "Share" to send context to guesser
8. Context message added to chat as SHARED_CONTEXT
9. Guesser can now refine their empathy in chat
10. Guesser sends refined empathy to resubmit
11. Reconciler reruns analysis

### Share Suggestion Card Edit Mode

**File:** `mobile/src/components/sharing/ShareSuggestionCard.tsx`

States:
- Default: Shows suggestion with buttons (Accept, Edit, Decline)
- Edit Mode: TextInput with refinement prompt
- Sending: Spinner while message being sent
- Done: Shows refined suggestion with "Share" button

### Refinement Constraints

- Circuit breaker: Max 3 refinement attempts per direction
- On 4th attempt: Skip reconciler, use natural transition
- Can't refine if partner already shared context

---

## 9. NOTIFICATIONS & BADGES

### Badge Component

**File:** `mobile/src/components/BadgeIndicator.tsx`

```typescript
interface BadgeIndicatorProps {
  count: number;
  size?: 'small' | 'default' | 'large';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  color?: string;
}
```

Features:
- Configurable size and position
- Spring animation on appearance
- Relative to parent container

### Share Button Badge

**File:** `mobile/src/components/SessionChatHeader.tsx`

Shows count of pending actions:
1. Share suggestion pending (from reconciler)
2. Partner's empathy needs validation (revealed but not validated)
3. New shared context to view

```typescript
<BadgeIndicator
  count={pendingActionsCount}
  position="top-right"
  color="alert"
/>
```

### Notification System

**Current:** No push notifications for Stage 2 actions (empathy, sharing)

**Considerations for redesign:**
- Badge alone is sufficient for current flow (single screen)
- Push notifications may be overkill for Stage 2 flow (short duration)
- Important for Stage 3+ where timing matters more

---

## 10. NAVIGATION STRUCTURE

### App Layout

**File:** `mobile/app/(auth)/(tabs)/_layout.tsx`

Uses **Stack** navigation (not tabs):
- Hamburger menu for sessions
- Gear icon for settings
- Home screen as main landing page

### Session Routes

**File:** `mobile/app/(auth)/session/[id]/_layout.tsx`

```
/sessions/[id]/
├── /index
│   └── UnifiedSessionScreen (main chat view)
│       ├── ChatInterface (message list + input)
│       ├── SessionChatHeader (with Share button)
│       └── Panels (feel-heard, empathy, etc.)
├── /sharing-status
│   └── SharingStatusScreen (share page)
│       ├── ShareSuggestionCard(s)
│       ├── EmpathyAttemptCard(s)
│       └── SharedContextTimeline
└── /share
    └── [Legacy/Fallback share context page]
```

### Header Share Button

**File:** `mobile/src/components/SessionChatHeader.tsx`

Location: Top-right of `UnifiedSessionScreen`

```typescript
<Pressable
  onPress={() => router.push(`/session/${sessionId}/sharing-status`)}
>
  <Icon name="share" />
  <BadgeIndicator count={pendingActionsCount} />
</Pressable>
```

Visibility:
- Shows when `shouldShowButton` is true (from useSharingStatus hook)
- Hidden when nothing pending

---

## 11. DATA MODELS

### Prisma Schema Excerpts

**File:** `backend/prisma/schema.prisma`

Key models for sharing flow:

```prisma
model Message {
  id String @id
  sessionId String
  sourceUserId String
  role MessageRole    // USER, AI, EMPATHY_STATEMENT, etc.
  content String
  stage Int
  createdAt DateTime
  updatedAt DateTime
  emotion Emotion?
  // ... other fields
}

model EmpathyAttempt {
  id String @id
  sessionId String
  sourceUserId String  // Who wrote this empathy
  content String
  status EmpathyStatus  // HELD, ANALYZING, etc.
  sharedAt DateTime     // When consented to share
  revealedAt DateTime?  // When shown to partner
  revisionCount Int     // How many times refined
  // ... other fields
}

model Consent {
  id String @id
  sessionId String
  userId String
  contentType ConsentContentType  // EMPATHY_DRAFT, etc.
  decision ConsentDecision        // GRANTED, DENIED
  recordedAt DateTime
  // ... other fields
}

model StageProgress {
  sessionId String
  stage Int
  status StageStatus    // NOT_STARTED, IN_PROGRESS, etc.
  startedAt DateTime?
  completedAt DateTime?
  gates Json            // Gate satisfaction details
  // ... other fields
}
```

---

## 12. CRITICAL CACHE KEY PATTERNS

### Query Keys File

**File:** `mobile/src/hooks/queryKeys.ts`

```typescript
export const sessionKeys = {
  state: (id: string) => ['sessions', id, 'state'] as const,
  details: (id: string) => ['sessions', id, 'details'] as const,
  // ... others
};

export const stageKeys = {
  progress: (id: string) => ['stages', id, 'progress'] as const,
  empathyStatus: (id: string) => ['stages', id, 'empathy', 'status'] as const,
  shareOffer: (id: string) => ['stages', id, 'empathy', 'share-offer'] as const,
  partnerEmpathy: (id: string) => ['stages', id, 'empathy', 'partner'] as const,
  // ... others
};

export const messageKeys = {
  list: (sessionId: string, stage?: Stage) =>
    stage ? ['messages', sessionId, 'stage', stage] : ['messages', sessionId],
  infinite: (sessionId: string, stage?: Stage) =>
    stage ? ['messages', 'infinite', sessionId, 'stage', stage]
          : ['messages', 'infinite', sessionId],
  // ... others
};
```

### Critical Pattern: Key Matching

**MUST match cache key in `setQueryData` with key in `useQuery`:**

```typescript
// GOOD
queryClient.setQueryData(sessionKeys.state(id), (old) => ({...}));
const { data } = useQuery({ queryKey: sessionKeys.state(id), ... });

// BAD - Keys don't match, write goes to orphan cache
queryClient.setQueryData(['sessions', id], (old) => ({...}));
const { data } = useQuery({ queryKey: sessionKeys.state(id), ... });
```

---

## 13. CRITICAL FILES REFERENCE

| Component | File Path | Purpose |
|-----------|-----------|---------|
| **Screens** | | |
| Sharing Page | `mobile/src/screens/SharingStatusScreen.tsx` | Main sharing UI |
| Main Chat | `mobile/src/screens/UnifiedSessionScreen.tsx` | Chat interface |
| **Components** | | |
| Empathy Card | `mobile/src/components/sharing/EmpathyAttemptCard.tsx` | Display empathy + status |
| Share Suggestion | `mobile/src/components/sharing/ShareSuggestionCard.tsx` | Suggestion with edit UI |
| Timeline | `mobile/src/components/sharing/SharedContextTimeline.tsx` | Sharing history |
| Header | `mobile/src/components/SessionChatHeader.tsx` | Share button placement |
| Badge | `mobile/src/components/BadgeIndicator.tsx` | Pending count |
| **Hooks** | | |
| Sharing Status | `mobile/src/hooks/useSharingStatus.ts` | Composite data hook |
| Messages | `mobile/src/hooks/useMessages.ts` | Message queries |
| Streaming | `mobile/src/hooks/useStreamingMessage.ts` | SSE handling |
| Unified Session | `mobile/src/hooks/useUnifiedSession.ts` | Session data + events |
| Stages | `mobile/src/hooks/useStages.ts` | Stage mutations |
| Query Keys | `mobile/src/hooks/queryKeys.ts` | Cache key definitions |
| **Backend Services** | | |
| Reconciler | `backend/src/services/reconciler.ts` | Gap analysis engine |
| Reconciler Routes | `backend/src/routes/reconciler.ts` | API endpoints |
| Reconciler Controller | `backend/src/controllers/reconciler.ts` | Request handlers |
| Realtime | `backend/src/services/realtime.ts` | Event publishing |
| **DTOs** | | |
| Empathy DTOs | `shared/src/dto/empathy.ts` | Empathy type definitions |
| Stage DTOs | `shared/src/dto/stage.ts` | Stage progress types |
| Session State | `shared/src/dto/session-state.ts` | Consolidated state DTO |
| **Utils** | | |
| Ably Client | `mobile/src/lib/ably.ts` | Real-time connection |

---

## 14. KEY ARCHITECTURAL PATTERNS

### 1. Cache-First State Management

**Rule:** If it's on screen, it's in React Query cache.

```typescript
// GOOD: Derive UI state from cache
const { data } = useSessionState(sessionId);
const showPanel = !data?.invitation?.messageConfirmed;
const handleConfirm = () => {
  mutate();  // onMutate sets messageConfirmed in cache → panel hides
};

// BAD: Local state bridging user action to response
const [showPanel, setShowPanel] = useState(true);
const handleConfirm = () => {
  setShowPanel(false);  // Out of sync on reload
  mutate();
};
```

### 2. Optimistic Updates + Rollback

```typescript
useMutation({
  mutationFn: async (params) => post('/api/endpoint', params),

  onMutate: async (params) => {
    // 1. Cancel in-flight queries
    await queryClient.cancelQueries({ queryKey: ['key'] });

    // 2. Save previous data
    const previousData = queryClient.getQueryData(['key']);

    // 3. Write optimistic data
    queryClient.setQueryData(['key'], (old) => ({
      ...old,
      field: true,
      fieldTimestamp: new Date().toISOString(),
    }));

    return { previousData };  // For rollback
  },

  onSuccess: (data, params) => {
    // 4. Replace optimistic with real data
    queryClient.invalidateQueries({ queryKey: ['key'] });
  },

  onError: (error, params, context) => {
    // 5. Rollback on error
    if (context?.previousData) {
      queryClient.setQueryData(['key'], context.previousData);
    }
  },
});
```

### 3. Streaming with Metadata

```typescript
// SSE Event: metadata contains tool outputs
const handleMetadata = (metadata: StreamMetadata) => {
  // 1. Update cache directly with metadata
  queryClient.setQueryData(messageKeys, (old) => ({
    ...old,
    lastMessage: {
      ...old.lastMessage,
      metadata: { ...metadata },
    },
  }));

  // 2. Update derived state
  if (metadata.offerFeelHeardCheck) {
    setShowFeelHeardPanel(true);
  }
};
```

### 4. Timeline Indicators from Timestamps

```typescript
// No boolean state. Indicators derived from cached timestamps.
const indicators = [];

if (invitation?.messageConfirmedAt) {
  indicators.push({
    type: 'indicator',
    indicatorType: 'invitation-sent',
    timestamp: invitation.messageConfirmedAt,
  });
}
```

---

## 15. KNOWN EDGE CASES & PATTERNS

### Stage 2 E2E Test Race Condition

When User A shares empathy, backend generates a **transition message** delivered via Ably. This confuses test expectations for AI response count.

**Solution:** Both users must complete empathy drafting BEFORE either shares.

### Circuit Breaker Timeout

Reconciler retry logic: up to 3 attempts with 100ms delays to allow DB visibility.

### Typing Indicator Correctness

Must check `messages[messages.length - 1]?.role === MessageRole.USER`, not a boolean.

### Delivery Status for Superseded Content

If user resubmits empathy before previous version delivered, mark old as `SUPERSEDED` instead of `DELIVERED`.

---

## 16. SUMMARY TABLE: Current vs. Proposed Changes

| Feature | Current | Proposed | Impact |
|---------|---------|----------|--------|
| Share Page | Single integrated screen | Menu: Sent/Received tabs | Navigation change |
| Share UI | Card-based layout | Tabbed navigation | Component restructure |
| Refinement | Inline in share suggestion | Drawer chat interface | New refinement drawer |
| Stage 2 | Single stage | Add Stage 2B (Informed Empathy) | Gate logic update |
| Notifications | Badge only | Badges + notification system | New notification layer |
| Circuit Breaker | Max 3 attempts | ? (clarify requirement) | Reconciler logic change |

---

## Questions for Redesign Team

1. **Stage 2B Details:** What exactly is "Informed Empathy"? Different gates? Different prompts?
2. **Refinement Drawer:** Modal overlay or sidebar? How wide? How tall?
3. **Menu-based Navigation:** How are Sent/Received filtered? Same data, different views?
4. **Notifications:** Push notifications for Stage 2? Badges sufficient?
5. **Data Retention:** How long do reconciler results/suggestions stay in cache?

---

## Usage Guide for Other Team Members

- **For UI/UX Design:** Review Sections 1, 9, 10, 14
- **For Backend Planning:** Review Sections 2, 3, 8, 11, 15
- **For Frontend Implementation:** Review Sections 1, 5, 6, 7, 12, 14
- **For Testing:** Review Sections 3, 15
- **For Cache/State Management:** Review Sections 12, 14

---

*This document is a living reference. Update as design decisions are made.*
