# Technical Change Impact Assessment

**Date:** February 23, 2026
**Scope:** Server-driven reconciler loop, full-screen refinement modal, database reset allowed
**Impact Level:** HIGH (affects Stage 2 architecture, streaming, navigation, state management)

---

## 1. FILES THAT MUST CHANGE

### 1.1 Stage Enum and Shared Types

**Directory:** `shared/src/`

#### Stage Enum
**File:** `shared/src/enums.ts`

**Current:**
```typescript
export enum Stage {
  ONBOARDING = 0,
  WITNESS = 1,
  PERSPECTIVE_STRETCH = 2,
  NEED_MAPPING = 3,
  STRATEGIC_REPAIR = 4,
}
```

**Must Change:**
```typescript
export enum Stage {
  ONBOARDING = 0,
  WITNESS = 1,
  PERSPECTIVE_STRETCH = 2,
  PERSPECTIVE_STRETCH_REFINEMENT = 2.5,  // Stage 2B - NEW
  NEED_MAPPING = 3,
  STRATEGIC_REPAIR = 4,
}
```

**Impact:** This is a breaking change for stage-based filtering and transitions. All stage comparisons must handle 2.5.

#### Stage DTOs
**File:** `shared/src/dto/stage.ts`

**Must Add:**
- `Stage2BRefinementGates` type (new gate satisfaction interface)
- Update `GateSatisfactionDTO` union to include new stage gates
- Add fields to `Stage2Gates` for refinement status:
  ```typescript
  export interface Stage2Gates {
    // ... existing fields ...
    refinementStartedAt: string | null;      // NEW
    refinementCompletedAt: string | null;    // NEW
    refinementAttemptCount: number;          // NEW (for circuit breaker)
  }
  ```

#### Empathy DTOs
**File:** `shared/src/dto/empathy.ts`

**Must Add/Modify:**
- New `RefinementSessionDTO` for drawer chat state:
  ```typescript
  export interface RefinementSessionDTO {
    id: string;
    sessionId: string;
    direction: 'to_partner' | 'from_partner';  // Which empathy being refined
    content: string;
    startedAt: string;
    messages: RefinementChatMessageDTO[];
    attemptCount: number;
    maxAttempts: number;  // Circuit breaker limit
    status: 'active' | 'completed' | 'abandoned';
  }

  export interface RefinementChatMessageDTO {
    id: string;
    role: MessageRole;  // USER or AI
    content: string;
    timestamp: string;
  }
  ```

- Modify `EmpathyExchangeStatusResponse` to include:
  ```typescript
  export interface EmpathyExchangeStatusResponse {
    // ... existing fields ...
    refinementSession: RefinementSessionDTO | null;  // NEW
    refinementModalOpen: boolean;                     // NEW
  }
  ```

- New response types:
  ```typescript
  export interface OpenRefinementModalRequest {
    sessionId: string;
    empathyAttemptId: string;  // Which empathy to refine
    direction: 'to_partner' | 'from_partner';
  }

  export interface OpenRefinementModalResponse {
    refinementSession: RefinementSessionDTO;
    initialPrompt: string;  // AI's opening prompt
  }

  export interface SendRefinementMessageRequest {
    sessionId: string;
    refinementSessionId: string;
    message: string;
  }

  export interface SendRefinementMessageResponse {
    message: RefinementChatMessageDTO;
    refinementSession: RefinementSessionDTO;
    proposedRevision?: string;  // AI proposes updated statement
    canResubmit?: boolean;
  }

  export interface ResubmitFromRefinementRequest {
    sessionId: string;
    refinementSessionId: string;
    revisedContent: string;
  }

  export interface ResubmitFromRefinementResponse {
    success: boolean;
    empathyAttempt: EmpathyAttemptDTO;  // Updated attempt
    refinementSession: RefinementSessionDTO;  // Marked as completed
    transitionMessage?: ConsentMessageDTO;
  }
  ```

---

### 1.2 Backend Services

#### Stage Prompts
**File:** `backend/src/services/stage-prompts.ts`

**Must Add:**
```typescript
// Stage 2B specific prompts
getStage2BRefinementOpeningPrompt(
  direction: 'to_partner' | 'from_partner',
  empathyContent: string,
  gaps?: string
): string {
  // AI opening question for refinement chat
  // Use EXPLAIN_EMPATHY_PURPOSE for context
  // Reference specific gaps from reconciler
}

getStage2BRefinementGuidancePrompt(
  userMessage: string,
  empathyContent: string,
  direction: 'to_partner' | 'from_partner'
): string {
  // Guidance for refining empathy statement
}

getStage2BRefinementTransitionPrompt(
  revisedContent: string,
  direction: 'to_partner' | 'from_partner'
): string {
  // Transition message when user resubmits
}
```

**Impact on existing:**
- Keep `getStage1LandingPrompt()` - unchanged (Stage 0→1)
- Keep `getStage1ListeningRules()` - unchanged
- Keep `getStage2PurposeContext()` - unchanged, reuse for Stage 2B
- Keep `getStage2ExplainEmpathy()` - unchanged (used in Stage 2B)
- Keep facilitation rules for Stages 3-4 - unchanged

#### Reconciler Service
**File:** `backend/src/services/reconciler.ts`

**Must Modify:**

1. **Circuit Breaker Logic** - Already exists, needs Stage 2B awareness:
   ```typescript
   checkAndIncrementAttempts(
     sessionId: string,
     attemptDirection: string,
     stage: number  // NEW parameter to distinguish Stage 2 vs 2B
   ): { allowed: boolean; attemptCount: number; remaining: number }
   ```
   - Track attempts per stage per direction (separate counters for 2 and 2B)
   - Max 3 attempts per direction per stage

2. **New Function:**
   ```typescript
   async getGapsForRefinement(
     sessionId: string,
     empathyAttemptId: string
   ): Promise<{
     gaps: string[];
     gapSummary: string;
     areasToExplore: string[];
   }> {
     // Return reconciler's gap analysis for refinement modal
     // Used to populate AI's opening prompt
   }
   ```

3. **Trigger Reconciler from Refinement:**
   ```typescript
   async handleRefinementResubmit(
     sessionId: string,
     refinementSessionId: string,
     revisedContent: string,
     attemptDirection: string
   ): Promise<{
     success: boolean;
     newAnalysis: ReconcilerResultSummary;
     circuitBreakerTriggered: boolean;
   }> {
     // Rerun reconciler after refinement
     // Check circuit breaker before analyzing
     // If triggered: skip to READY with natural message
   }
   ```

**Impact on existing:**
- Keep `analyzeEmotionalGaps()` - unchanged
- Keep `markEmpathyReady()` - unchanged, but may be called from Stage 2B flow too
- Keep share suggestion flow - unchanged (for Stage 2, non-refined path)

#### Streaming Service
**File:** `backend/src/services/ai-orchestrator.ts` (or relevant streaming handler)

**Must Add:**

1. **Refinement Chat Streaming:**
   ```typescript
   async streamRefinementGuidance(
     sessionId: string,
     refinementSessionId: string,
     userMessage: string,
     empathyContent: string,
     direction: 'to_partner' | 'from_partner'
   ): Promise<AsyncIterable<StreamEvent>> {
     // Yield refinement guidance as SSE stream
     // Format same as main chat streaming
     // Use refinement prompts from stage-prompts service
   }
   ```

2. **New Metadata Type for Refinement:**
   ```typescript
   // In addition to existing StreamMetadata
   export interface RefinementStreamMetadata {
     refinementSessionId: string;
     proposedRevision?: string;
     canResubmit?: boolean;
     circuitBreakerWarning?: string;
   }
   ```

**Impact on existing:**
- Keep existing `streamUserMessage()` - unchanged
- Keep existing `handleMetadata()` - extend to handle refinement metadata
- Keep typing indicator pattern - unchanged (works for refinement chat too)

#### Dispatch Handler
**File:** `backend/src/services/dispatch-handler.ts`

**Must Add:**
- New dispatch case for Stage 2B refinement:
  ```typescript
  if (stage === 2.5) {  // Stage 2B
    return handleStage2BRefinement(sessionId, userMessage);
  }
  ```

**Must NOT Modify:**
- Existing Stage 1 dispatch - unchanged
- Existing Stage 2 dispatch - unchanged
- Existing Stages 3-4 dispatch - unchanged

---

### 1.3 Backend Routes/Controllers

#### Reconciler Routes
**File:** `backend/src/routes/reconciler.ts`

**Must Add:**
```typescript
// Refinement modal endpoints
POST   /sessions/:id/reconciler/refinement/open
       → Start refinement session (open modal)
       → Returns: OpenRefinementModalResponse

POST   /sessions/:id/reconciler/refinement/message
       → Send message in refinement chat (SSE stream)
       → Payload: { refinementSessionId, message }
       → Returns: RefinementMessageResponse + SSE events

POST   /sessions/:id/reconciler/refinement/resubmit
       → User submits revised empathy from modal
       → Payload: { refinementSessionId, revisedContent }
       → Returns: ResubmitFromRefinementResponse

POST   /sessions/:id/reconciler/refinement/abandon
       → User closes modal without resubmitting (optional)
       → Returns: { success: boolean }

GET    /sessions/:id/reconciler/refinement/gaps
       → Get gap analysis for refinement modal display
       → Returns: { gaps, gapSummary, areasToExplore }
```

**Must NOT Modify:**
- Existing `/reconciler/run` - unchanged
- Existing `/reconciler/status` - unchanged
- Existing `/reconciler/share-offer` - unchanged (still used for Stage 2 non-refined path)
- Existing `/reconciler/share-offer/respond` - unchanged

#### Stage Routes
**File:** `backend/src/routes/stages.ts`

**Must Modify:**
```typescript
// Existing endpoint, expand for 2B
GET    /sessions/:id/progress
       → Update response to include Stage 2B status
       → Returns: GetProgressResponse with gates for 2.5

POST   /sessions/:id/stages/advance
       → Must handle transitions:
         - 1 → 2 (existing)
         - 2 → 2.5 (NEW - when reconciler detects gaps, offer refinement)
         - 2.5 → 2 (if resubmit from refinement goes back to analysis)
         - 2.5 → 3 (if reconciler approves after refinement, skip to 3)
         - 2 → 3 (existing - if no refinement needed)
```

**Impact:**
- Must handle new stage transitions (2 ↔ 2.5 ↔ 3)
- Must update gate satisfaction logic for 2.5
- Must update canAdvance calculation

---

### 1.4 Prisma Schema

**File:** `backend/prisma/schema.prisma`

**Must Add:**
```prisma
model RefinementSession {
  id String @id @default(cuid())
  sessionId String
  empathyAttemptId String
  direction String  // 'to_partner' | 'from_partner'

  startedAt DateTime @default(now())
  completedAt DateTime?
  abandonedAt DateTime?

  attemptCount Int @default(0)
  maxAttempts Int @default(3)

  status String @default("active")  // 'active' | 'completed' | 'abandoned'

  // Messages exchanged during refinement chat
  messages RefinementMessage[]

  // Revised empathy if user submitted changes
  finalRevisedContent String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  session Session @relation(fields: [sessionId], references: [id])
  empathyAttempt EmpathyAttempt @relation(fields: [empathyAttemptId], references: [id])

  @@index([sessionId])
  @@index([empathyAttemptId])
}

model RefinementMessage {
  id String @id @default(cuid())
  refinementSessionId String
  role String  // 'USER' | 'AI'
  content String

  createdAt DateTime @default(now())

  refinementSession RefinementSession @relation(fields: [refinementSessionId], references: [id])

  @@index([refinementSessionId])
}
```

**Must Modify (Existing Models):**
```prisma
model EmpathyAttempt {
  // ... existing fields ...

  // NEW fields for Stage 2B tracking
  refinementSessionId String?
  refinementStartedAt DateTime?
  refinementCompletedAt DateTime?
  refinementAttempts RefinementSession[]

  // Track circuit breaker per stage
  refinementAttemptCount Int @default(0)
}

model StageProgress {
  // ... existing fields ...

  // Expand gates JSON to include 2B fields
  gates Json  // Now includes refinementStartedAt, refinementCompletedAt, etc.
}
```

**Migration Strategy:**
- Since "no migration needed" (can reset DB): Create fresh migration
- Existing production data: Must plan migration to add new fields with defaults
- **File:** `backend/prisma/migrations/[timestamp]_add_stage_2b_refinement/migration.sql`

---

### 1.5 Mobile Screens and Components

#### Navigation Structure
**File:** `mobile/app/(auth)/session/[id]/_layout.tsx`

**Must Modify:**
```typescript
// Add refinement modal route
export const unstable_settings = {
  initialRouteName: 'index',
};

<Stack
  screenOptions={{
    presentation: 'modal',  // For refinement modal
  }}
>
  <Stack.Screen name="index" component={UnifiedSessionScreen} />
  <Stack.Screen
    name="sharing-status"
    component={SharingStatusScreen}
  />
  <Stack.Screen
    name="refinement-modal"  // NEW
    component={RefinementModalScreen}
    options={{
      presentation: 'fullScreen',
      animationEnabled: true,
    }}
  />
</Stack>
```

**Navigation Handler (in UnifiedSessionScreen or header):**
```typescript
const openRefinementModal = (empathyAttemptId: string) => {
  router.push(`/session/${sessionId}/refinement-modal?attemptId=${empathyAttemptId}`);
};
```

#### New Refinement Modal Screen
**File:** `mobile/src/screens/RefinementModalScreen.tsx` (NEW)

**Must Create:**
```typescript
export interface RefinementModalScreenProps {
  sessionId: string;
  empathyAttemptId: string;
  direction: 'to_partner' | 'from_partner';
}

export default function RefinementModalScreen() {
  const { sessionId, attemptId } = useLocalSearchParams();

  // 1. Open refinement session (API call)
  const refinementSession = useOpenRefinementModal(sessionId, attemptId);

  // 2. Render modal:
  //    - Header: Title + Close button
  //    - Gap summary (read-only)
  //    - Chat interface (messages from refinement chat)
  //    - Text input for user messages
  //    - "Done" button when proposed revision shown

  // 3. Send messages to refinement chat
  const sendMessage = useSendRefinementMessage(sessionId);

  // 4. Resubmit refined empathy
  const resubmit = useResubmitFromRefinement(sessionId);

  // 5. Close modal (abandon without resubmit)
  const closeModal = () => router.back();

  return (
    <Modal>
      <RefinementModalHeader onClose={closeModal} />
      <GapsSummary gaps={refinementSession.gaps} />
      <RefinementChatInterface
        messages={refinementSession.messages}
        onSendMessage={sendMessage}
      />
      <TextInput onChangeText={setMessage} />
      <Button title="Done" onPress={() => resubmit(revisedContent)} />
    </Modal>
  );
}
```

**Layout Details:**
- Full-screen overlay
- Modal presentation (slides from bottom on iOS, center on Android)
- Header with close button (X)
- Gap summary section (read-only, shows what reconciler found)
- Chat history (messages from refinement chat, scrollable)
- Text input at bottom (for user messages)
- "Done" button (enabled when proposed revision shown)

#### Modify Existing Screens

**File:** `mobile/src/screens/SharingStatusScreen.tsx`

**Must Modify:**
- Remove inline refinement UI from `ShareSuggestionCard`
- Add "Open Refinement Modal" button instead:
  ```typescript
  onPress={() => openRefinementModal(empathyAttemptId)}
  ```
- Keep existing functionality for non-refined path
- Update to show "Refinement in Progress" state if Stage 2B

**File:** `mobile/src/screens/UnifiedSessionScreen.tsx`

**Must Modify:**
- Update stage condition logic to include Stage 2B (2.5)
- Update panel visibility calculations for Stage 2B
- Keep all Stage 1 and existing Stage 2 panels - unchanged

#### Component Changes

**File:** `mobile/src/components/sharing/ShareSuggestionCard.tsx`

**Must Modify:**
```typescript
// OLD: Inline edit mode
// NEW: Open refinement modal button

interface ShareSuggestionCardProps {
  suggestion: ShareSuggestionDTO;
  onOpenRefinement: (empathyAttemptId: string) => void;  // NEW
  onAccept: () => void;      // For non-refined path
  onDecline: () => void;     // For non-refined path
}

<Button
  title="Refine in Detail"  // NEW instead of "Edit"
  onPress={() => onOpenRefinement(empathyAttemptId)}
/>
```

**File:** `mobile/src/components/sharing/EmpathyAttemptCard.tsx`

**Must Modify:**
```typescript
// Add Stage 2B status display
if (status === EmpathyStatus.REFINING) {
  // Show "Refinement in Progress" with modal open button
  return (
    <Card>
      <StatusBadge status="REFINING" icon="spinner" />
      <Text>Refining with partner's feedback...</Text>
      <Button
        title="Continue Refinement"
        onPress={() => openRefinementModal()}
      />
    </Card>
  );
}
```

**New Component:** `mobile/src/components/refinement/RefinementChatInterface.tsx` (NEW)

```typescript
export interface RefinementChatInterfaceProps {
  messages: RefinementChatMessageDTO[];
  onSendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
}

// Similar to chat interface but for refinement chat
// Messages only from USER and AI (in refinement context)
// No special message types
// Streaming same as main chat
```

---

### 1.6 Mobile Hooks

#### New Hooks for Stage 2B

**File:** `mobile/src/hooks/useRefinement.ts` (NEW)

```typescript
export function useOpenRefinementModal(sessionId: string) {
  return useMutation({
    mutationFn: async (empathyAttemptId: string) => {
      return post(`/sessions/${sessionId}/reconciler/refinement/open`, {
        empathyAttemptId,
      });
    },
    onSuccess: (data) => {
      // Cache refinement session
      queryClient.setQueryData(
        stageKeys.refinementSession(sessionId),
        data.refinementSession
      );
    },
  });
}

export function useSendRefinementMessage(sessionId: string) {
  return useMutation({
    mutationFn: async (message: string) => {
      // SSE stream for refinement message
      return streamPost(
        `/sessions/${sessionId}/reconciler/refinement/message`,
        { message }
      );
    },
    onMutate: async (message) => {
      // Optimistic: add user message to cache
      await queryClient.cancelQueries({
        queryKey: stageKeys.refinementSession(sessionId),
      });
      const previous = queryClient.getQueryData(
        stageKeys.refinementSession(sessionId)
      );

      queryClient.setQueryData(
        stageKeys.refinementSession(sessionId),
        (old) => ({
          ...old,
          messages: [
            ...old.messages,
            { id: uuid(), role: 'USER', content: message, timestamp: now() },
          ],
        })
      );

      return { previous };
    },
    onError: (error, message, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          stageKeys.refinementSession(sessionId),
          context.previous
        );
      }
    },
  });
}

export function useResubmitFromRefinement(sessionId: string) {
  return useMutation({
    mutationFn: async (revisedContent: string) => {
      return post(
        `/sessions/${sessionId}/reconciler/refinement/resubmit`,
        { revisedContent }
      );
    },
    onSuccess: (data) => {
      // Update empathy attempt status
      queryClient.invalidateQueries({
        queryKey: stageKeys.empathyStatus(sessionId),
      });
      // Update stage progress
      queryClient.invalidateQueries({
        queryKey: stageKeys.progress(sessionId),
      });
      // Close modal (caller handles navigation)
    },
  });
}

export function useRefinementSession(sessionId: string) {
  return useQuery({
    queryKey: stageKeys.refinementSession(sessionId),
    queryFn: async () => {
      // Fetch current refinement session (if any)
      return get(`/sessions/${sessionId}/reconciler/refinement/session`);
    },
    staleTime: 0,  // Real-time
  });
}
```

#### Query Keys Addition

**File:** `mobile/src/hooks/queryKeys.ts`

**Must Add:**
```typescript
export const stageKeys = {
  // ... existing ...

  refinementSession: (sessionId: string) =>
    ['stages', sessionId, 'refinement', 'session'] as const,

  refinementGaps: (sessionId: string) =>
    ['stages', sessionId, 'refinement', 'gaps'] as const,
};
```

#### Modify Existing Hooks

**File:** `mobile/src/hooks/useSharingStatus.ts`

**Must Modify:**
```typescript
export function useSharingStatus(sessionId: string) {
  // ... existing code ...

  // NEW: Include refinement session status
  const refinementSession = useRefinementSession(sessionId);

  return {
    // ... existing fields ...
    refinementSession: refinementSession.data,          // NEW
    refinementModalOpen: !!refinementSession.data,     // NEW
    hasUnfinishedRefinement: refinement && refinement.status === 'active',  // NEW
  };
}
```

**File:** `mobile/src/hooks/useStages.ts`

**Must Modify:**
```typescript
// Add Stage 2B mutations
export function useAdvanceToStage2B(sessionId: string) {
  return useMutation({
    mutationFn: async () => {
      return post(`/sessions/${sessionId}/stages/advance`, {
        fromStage: Stage.PERSPECTIVE_STRETCH,
        toStage: 2.5,  // Stage 2B
      });
    },
    // ... with cache updates
  });
}

// Ensure existing Stage 2→3 advancement works
// Must handle: 2→2.5→3 pathway
```

**File:** `mobile/src/hooks/useChatUIState.ts`

**Must Modify:**
```typescript
// Add Stage 2B panel visibility logic
if (data.myStage === 2.5) {
  // Show refinement modal indicator or pending state
  // Don't show regular empathy panels
}
```

---

### 1.7 Mobile Navigation

#### App Layout
**File:** `mobile/app/(auth)/(tabs)/_layout.tsx`

**Must NOT Modify** - existing navigation structure unchanged

#### Session Layout
**File:** `mobile/app/(auth)/session/[id]/_layout.tsx`

**Must Modify:** Add refinement modal route (see 1.5 above)

#### Router Integration

**File:** `mobile/src/navigation/router.ts` (if exists) or inline routing

**Must Add:**
```typescript
// In components that can trigger refinement
const openRefinement = (empathyAttemptId: string) => {
  router.push({
    pathname: `/session/[id]/refinement-modal`,
    params: { id: sessionId, attemptId: empathyAttemptId },
  });
};
```

---

## 2. FILES THAT MUST NOT CHANGE

### 2.1 Stage 0-1 Flow (Completely Protected)

**Unchanging Files:**
- `backend/src/services/stage-prompts.ts` - Keep Stage 0-1 prompt functions
- `backend/src/services/ai-orchestrator.ts` - Keep Stage 0-1 dispatch
- `backend/src/routes/stages.ts` - Keep compact signing logic
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Keep Stage 0-1 panels intact
- `mobile/src/components/panels/CompactSigningPanel.tsx` - unchanged
- `mobile/src/components/panels/FeelHeardPanel.tsx` - unchanged
- `mobile/src/hooks/useInvitation.ts` - unchanged
- `mobile/src/hooks/useConfirmFeelHeard.ts` - unchanged

**Reason:** These are stable, working flows. Any change risks breaking onboarding.

---

### 2.2 Chat Core (Completely Protected)

**Unchanging Files:**
- `mobile/src/screens/UnifiedSessionScreen.tsx` - Message rendering, input handling
- `mobile/src/components/ChatInterface.tsx` - Message list UI
- `mobile/src/hooks/useMessages.ts` - Message queries
- `mobile/src/hooks/useStreamingMessage.ts` - SSE streaming
- `backend/src/services/ai-orchestrator.ts` - Main streaming handler
- Typing indicator pattern - derived from `messages[last].role`, unchanged

**Reason:** Chat is core UX. Breaking this breaks entire app experience.

**Important:** Refinement chat uses SAME streaming infrastructure, but separate endpoints/sessions. Don't merge refinement messages into main message list.

---

### 2.3 Ably Integration (Extend, Don't Break)

**Unchanging Files:**
- `mobile/src/lib/ably.ts` - Core Ably client
- `backend/src/services/realtime.ts` - Event publishing
- `mobile/src/hooks/useRealtime.ts` - Event subscription

**Extend:** Add new Ably event types for refinement:
```typescript
// In backend/src/services/realtime.ts
publishRefinementEvent(sessionId: string, event: {
  type: 'refinement.started' | 'refinement.message_received' | 'refinement.completed';
  data: any;
}) {
  // Publish to Ably channel
}
```

**Don't Break:**
- Keep existing empathy sharing events unchanged
- Keep session event publishing unchanged
- Keep token refresh logic unchanged
- Keep message event structure unchanged

---

### 2.4 Auth/Session Management (Completely Protected)

**Unchanging Files:**
- `mobile/src/hooks/useAuth.ts`
- `mobile/src/hooks/useAuthProviderClerk.ts`
- `backend/src/routes/sessions.ts` - Session CRUD
- `backend/src/controllers/sessions.ts`
- Session creation, invitation flow
- Authentication middleware

**Reason:** Touching auth breaks everything. No changes needed for Stage 2B.

---

## 3. ARCHITECTURAL CONSTRAINTS TO RESPECT

### 3.1 Cache-First Pattern (CRITICAL)

**Rule:** If it's on screen, it's in React Query cache. Derive all UI state from cache.

**Application to Stage 2B:**

```typescript
// GOOD: Derive refinement modal visibility from cache
const refinementSession = useQuery({
  queryKey: stageKeys.refinementSession(sessionId),
  // ...
});
const showRefinementModal = !!refinementSession.data;

// BAD: Track modal visibility in local state
const [showRefinementModal, setShowRefinementModal] = useState(false);
```

**Must Maintain:**
- All refinement session state in cache (RefinementSessionDTO)
- All messages in cache (don't accumulate in component state)
- All proposed revisions in cache
- Circuit breaker status in cache (attemptCount)

---

### 3.2 Query Key Organization (CRITICAL)

**Central Location:** `mobile/src/hooks/queryKeys.ts`

**Must Add:** (See section 1.6)
```typescript
stageKeys.refinementSession(sessionId)
stageKeys.refinementGaps(sessionId)
```

**CRITICAL RULE:** Cache key used in `setQueryData()` must EXACTLY match key used in `useQuery()`.

```typescript
// In API response handler:
queryClient.setQueryData(
  stageKeys.refinementSession(sessionId),  // Key 1
  data
);

// In component:
const { data } = useQuery({
  queryKey: stageKeys.refinementSession(sessionId),  // Key 2 - MUST MATCH
  // ...
});

// If keys don't match: write goes to orphan cache, read gets undefined
```

---

### 3.3 Optimistic Updates with Rollback

**Pattern for refinement messages:**

```typescript
useMutation({
  mutationFn: async (message: string) => { /* ... */ },

  onMutate: async (message) => {
    // 1. Cancel queries
    await queryClient.cancelQueries({
      queryKey: stageKeys.refinementSession(sessionId),
    });

    // 2. Save previous
    const previous = queryClient.getQueryData(
      stageKeys.refinementSession(sessionId)
    );

    // 3. Optimistic write
    queryClient.setQueryData(
      stageKeys.refinementSession(sessionId),
      (old) => ({
        ...old,
        messages: [
          ...old.messages,
          { id: uuid(), role: 'USER', content: message, timestamp: now() },
        ],
      })
    );

    return { previous };
  },

  onSuccess: (data) => {
    // Server overwrites optimistic
    queryClient.setQueryData(
      stageKeys.refinementSession(sessionId),
      data.refinementSession
    );
  },

  onError: (error, message, context) => {
    // 4. Rollback
    if (context?.previous) {
      queryClient.setQueryData(
        stageKeys.refinementSession(sessionId),
        context.previous
      );
    }
  },
});
```

**Must Apply To:**
- Sending refinement messages (add to cache immediately)
- Resubmitting refined empathy (update status immediately)
- All refinement session mutations

---

### 3.4 Stage Prompt Structure

**Constraint:** Use existing prompt structure, extend for Stage 2B.

**Static Cached Blocks:**
- `EXPLAIN_EMPATHY_PURPOSE` - Reuse for Stage 2B (already cached)
- `STAGE2_PURPOSE_CONTEXT` - Reuse for Stage 2B context

**Dynamic Blocks:**
- Gap summary from reconciler (injected into opening prompt)
- User's empathy content (referenced in guidance)
- Partner's original Stage 1 content (for context)

**Example Opening Prompt:**
```
[EXPLAIN_EMPATHY_PURPOSE] + [Gap summary from reconciler] + "Let's explore this together..."
```

**Constraint:** Don't duplicate prompt logic. Reference existing cached blocks.

---

### 3.5 Streaming Metadata Pattern

**Existing Pattern:**
```typescript
// In SSE stream:
{ type: 'metadata', data: { offerFeelHeardCheck: true, ... } }

// Handler:
const handleMetadata = (metadata) => {
  // 1. Update cache
  queryClient.setQueryData(..., old => ({ ...old, metadata }));
  // 2. Call callback
  onMetadata?.(metadata);
};
```

**Extend for Stage 2B:**
```typescript
// New metadata type
export interface RefinementStreamMetadata {
  proposedRevision?: string;    // AI suggests updated statement
  canResubmit?: boolean;
  circuitBreakerWarning?: string;  // "3 attempts used, final refinement"
}

// Handler extends existing pattern - no changes to core streaming
const handleRefinementMetadata = (metadata: RefinementStreamMetadata) => {
  queryClient.setQueryData(
    stageKeys.refinementSession(sessionId),
    old => ({ ...old, metadata })
  );
};
```

**Constraint:** Don't change existing metadata handling. Add new types alongside.

---

## 4. KEY INTEGRATION POINTS

### 4.1 Stage 2B in Stage Transition System

**Entry Point:** When reconciler detects gaps in Stage 2

**File:** `backend/src/services/reconciler.ts`

**Function:** `analyzeEmotionalGaps()`

**Current Flow:**
```
User A shares empathy → status: HELD
User B completes Stage 1 → trigger reconciler for A
If gaps: status: AWAITING_SHARING (share suggestion offered)
If approved: status: READY → REVEALED
```

**New Flow:**
```
User A shares empathy → status: HELD
User B completes Stage 1 → trigger reconciler for A
If gaps detected:
  ├─ Check circuit breaker (attemptCount < 3)
  ├─ If allowed:
  │   ├─ Create RefinementSession
  │   ├─ Return status: REFINING (not AWAITING_SHARING)
  │   ├─ Offer refinement modal (instead of share suggestion)
  │   └─ Stage: PERSPECTIVE_STRETCH → PERSPECTIVE_STRETCH_REFINEMENT (2.5)
  └─ If blocked (3+ attempts):
      ├─ Skip refinement
      ├─ Status: READY
      └─ Natural transition message (no accuracy feedback)
```

**Integration Points:**

1. **In Reconciler:**
   ```typescript
   async analyzeEmotionalGaps(sessionId, fromUserId, toUserId) {
     // ... existing gap analysis ...

     if (gaps && gaps.severity === 'significant') {
       // NEW: Check circuit breaker
       const { allowed, attemptCount } = checkAndIncrementAttempts(
         sessionId,
         `${fromUserId}->${toUserId}`,
         Stage.PERSPECTIVE_STRETCH  // Track per stage
       );

       if (allowed) {
         // NEW: Create refinement session
         const refinementSession = await createRefinementSession(
           sessionId,
           empathyAttemptId,
           gaps
         );

         // Set status to REFINING (not AWAITING_SHARING)
         await updateEmpathyStatus(empathyAttemptId, 'REFINING');

         // Advance stage to 2B
         await advanceStage(sessionId, 2, 2.5);

         return { status: 'REFINING', refinementSession };
       } else {
         // Circuit breaker triggered
         await markEmpathyReady(sessionId, empathyAttemptId);
         return { status: 'READY', circuitBreakerTriggered: true };
       }
     }
   }
   ```

2. **API Endpoint:**
   ```typescript
   // In reconciler routes
   GET /sessions/:id/reconciler/status
       → If stage = 2.5, return refinementSession data
       → If stage = 2, return shareOffer data (existing)
   ```

3. **Mobile Detection:**
   ```typescript
   // In useSharingStatus hook
   if (myProgress.stage === 2.5 && refinementSession) {
     // Show "Refinement in Progress" state
     // Enable "Open Refinement Modal" button
     return { refinementModalOpen: true, ... };
   }
   ```

---

### 4.2 Refinement Chat in Streaming System

**Integration Point:** Reuse existing SSE streaming infrastructure

**File:** `backend/src/services/ai-orchestrator.ts` (or similar)

**Architecture:**
- Main chat streaming: `POST /sessions/:id/messages` → Main chat list
- Refinement streaming: `POST /sessions/:id/reconciler/refinement/message` → Refinement session

**Separate Endpoints, Same Mechanism:**
```typescript
// Existing
async streamUserMessage(sessionId, message) {
  // Yields: user_message → chunk → chunk → metadata → text_complete → complete
  // Updates: messageKeys.list(sessionId)
}

// NEW (similar structure)
async streamRefinementMessage(sessionId, refinementSessionId, message) {
  // Yields: user_message → chunk → chunk → metadata → text_complete → complete
  // Updates: stageKeys.refinementSession(sessionId)
  // Metadata type: RefinementStreamMetadata (includes proposedRevision, canResubmit)
}
```

**Handler Chain:**
```
streamRefinementMessage()
  ↓
  onChunk() → accumulate text (throttle 50ms)
  ↓
  onMetadata() → handleRefinementMetadata()
    ├─ Update cache: refinementSession.metadata
    └─ Call callback: onRefinementMetadata() (for UI updates)
  ↓
  onComplete() → final confirmation, message ID
```

**Mobile Integration:**
```typescript
// In RefinementModalScreen
const { mutate: sendMessage } = useSendRefinementMessage(sessionId);

const handleSendMessage = async (text) => {
  // 1. Call mutation
  await sendMessage(text);

  // 2. SSE stream handled by mutation
  //    - Optimistic user message added to cache
  //    - AI chunks accumulated (throttled)
  //    - Metadata triggers proposedRevision display
  //    - Complete event confirms

  // 3. Cache auto-updates via onSuccess
  //    - refinementSession.messages updated
  //    - refinementSession.metadata updated

  // 4. Component re-renders from cache
};
```

**Constraint:** Don't merge refinement messages into main chat. Keep separate cache keys.

---

### 4.3 Menu-Based Navigation (Sent/Received)

**Entry Point:** ShareSuggestionCard or EmpathyAttemptCard

**Current Navigation:**
```
UnifiedSessionScreen → [Share button] → SharingStatusScreen (all activity)
```

**New Navigation with Menu:**
```
UnifiedSessionScreen
  → [Share button] → SharingStatusScreen
    ├─ Menu: [Sent] [Received]
    ├─ Sent Tab: My empathy attempts, my shared context
    └─ Received Tab: Partner's empathy attempts, partner's shared context
```

**Implementation Details:**

**File:** `mobile/src/screens/SharingStatusScreen.tsx`

**Add Menu Tabs:**
```typescript
const [activeTab, setActiveTab] = useState<'sent' | 'received'>('sent');

return (
  <View>
    <MenuTabs
      tabs={[
        { label: 'Sent', value: 'sent' },
        { label: 'Received', value: 'received' },
      ]}
      active={activeTab}
      onChange={setActiveTab}
    />

    {activeTab === 'sent' ? (
      <SentTabContent
        myAttempt={sharingStatus.myAttempt}
        mySharedContext={sharingStatus.mySharedContext}
        myReconcilerResult={sharingStatus.myReconcilerResult}
        refinementSession={sharingStatus.refinementSession}
      />
    ) : (
      <ReceivedTabContent
        partnerAttempt={sharingStatus.partnerAttempt}
        sharedContext={sharingStatus.sharedContext}
        validation={sharingStatus.validation}
      />
    )}
  </View>
);
```

**Sent Tab Contents:**
1. My empathy attempt card
2. Share suggestion (if offering refinement)
3. "Open Refinement" button (if Stage 2B)
4. My shared context history
5. Reconciler result summary

**Received Tab Contents:**
1. Partner's empathy attempt (when REVEALED)
2. Validation buttons (if REVEALED but not validated)
3. Shared context from partner (if subject shared)
4. Feedback I gave (if any)

**Cache Key Mapping:**
- Sent data: `stageKeys.empathyStatus(id)` + `stageKeys.refinementSession(id)`
- Received data: `stageKeys.partnerEmpathy(id)`

**No API Changes:** Just filter existing `useSharingStatus()` data

---

### 4.4 New Ably Events for Refinement

**Integration Point:** Extend existing Ably event publishing

**File:** `backend/src/services/realtime.ts`

**New Events to Publish:**
```typescript
// When refinement session starts
publishRefinementEvent(sessionId, {
  type: 'refinement.started',
  data: {
    direction: 'to_partner',
    refinementSessionId: string,
    empathyAttemptId: string,
  }
});

// When refinement message received (AI response)
publishRefinementEvent(sessionId, {
  type: 'refinement.message_received',
  data: {
    refinementSessionId: string,
    message: RefinementChatMessageDTO,
    proposedRevision?: string,
  }
});

// When refinement completed (user resubmits)
publishRefinementEvent(sessionId, {
  type: 'refinement.completed',
  data: {
    refinementSessionId: string,
    newEmpathyAttempt: EmpathyAttemptDTO,
    status: EmpathyStatus,
  }
});
```

**Mobile Subscription:**

**File:** `mobile/src/hooks/useRealtime.ts`

**Extend existing listener:**
```typescript
useEffect(() => {
  const channel = ably.channels.get(sessionId);

  // Existing listeners
  channel.subscribe('partner.empathy_shared', handleEmpathyShared);

  // NEW listeners for refinement
  channel.subscribe('refinement.started', (msg) => {
    // Refinement modal opened on partner's side (informational)
    // Could show notification or update UI state
  });

  channel.subscribe('refinement.message_received', (msg) => {
    // Partner received AI guidance during refinement
    // Update refinement session cache if modal open
    const { refinementSessionId, message } = msg.data;
    queryClient.setQueryData(
      stageKeys.refinementSession(sessionId),
      (old) => ({
        ...old,
        messages: [...old.messages, message],
      })
    );
  });

  channel.subscribe('refinement.completed', (msg) => {
    // Partner resubmitted refined empathy
    // Update empathy status, potentially trigger reconciler
    queryClient.invalidateQueries({
      queryKey: stageKeys.empathyStatus(sessionId),
    });
  });

  return () => {
    channel.unsubscribe('refinement.started');
    channel.unsubscribe('refinement.message_received');
    channel.unsubscribe('refinement.completed');
  };
}, [sessionId, ably]);
```

**Constraint:** Don't modify existing event subscriptions. Add new ones alongside.

---

## 5. SUMMARY TABLE: Exact File Changes

| Area | File | Type | Change | Priority |
|------|------|------|--------|----------|
| **Types** | `shared/src/enums.ts` | Modify | Add Stage 2.5 | CRITICAL |
| | `shared/src/dto/stage.ts` | Modify | Add Stage2BRefinementGates | HIGH |
| | `shared/src/dto/empathy.ts` | Add | RefinementSessionDTO, related types | HIGH |
| **Backend** | `backend/src/services/stage-prompts.ts` | Add | Stage 2B prompt functions | HIGH |
| | `backend/src/services/reconciler.ts` | Modify | Circuit breaker per-stage, refinement flow | CRITICAL |
| | `backend/src/services/ai-orchestrator.ts` | Add | streamRefinementMessage() | HIGH |
| | `backend/src/services/dispatch-handler.ts` | Add | Stage 2B dispatch case | HIGH |
| | `backend/src/routes/reconciler.ts` | Add | Refinement endpoints (4 new) | HIGH |
| | `backend/src/routes/stages.ts` | Modify | Handle 2→2.5→3 transitions | HIGH |
| | `backend/prisma/schema.prisma` | Add | RefinementSession, RefinementMessage models | HIGH |
| | `backend/prisma/schema.prisma` | Modify | EmpathyAttempt, StageProgress models | HIGH |
| **Mobile** | `mobile/app/(auth)/session/[id]/_layout.tsx` | Modify | Add refinement modal route | HIGH |
| | `mobile/src/screens/RefinementModalScreen.tsx` | Create | NEW full-screen modal | CRITICAL |
| | `mobile/src/screens/SharingStatusScreen.tsx` | Modify | Add menu tabs (Sent/Received) | HIGH |
| | `mobile/src/components/sharing/ShareSuggestionCard.tsx` | Modify | Replace inline edit with modal button | HIGH |
| | `mobile/src/components/sharing/EmpathyAttemptCard.tsx` | Modify | Add Stage 2B status handling | MEDIUM |
| | `mobile/src/components/refinement/RefinementChatInterface.tsx` | Create | NEW refinement chat component | HIGH |
| | `mobile/src/hooks/useRefinement.ts` | Create | NEW hook for refinement mutations | HIGH |
| | `mobile/src/hooks/queryKeys.ts` | Modify | Add refinement cache keys | HIGH |
| | `mobile/src/hooks/useSharingStatus.ts` | Modify | Include refinement session data | HIGH |
| | `mobile/src/hooks/useStages.ts` | Modify | Add Stage 2B advancement logic | HIGH |
| | `mobile/src/hooks/useChatUIState.ts` | Modify | Handle Stage 2B panel visibility | MEDIUM |
| | `mobile/src/hooks/useRealtime.ts` | Modify | Add refinement event listeners | HIGH |

---

## 6. RISK ASSESSMENT

### HIGH RISK AREAS

1. **Cache Key Mismatches** - Refinement cache keys must match exactly
2. **Stage Transition Logic** - New 2→2.5→3 pathway must not break existing 2→3
3. **Circuit Breaker Edge Cases** - Must handle attempt counting across refinements
4. **Streaming Metadata** - New refinement metadata must not interfere with existing types

### MITIGATION

- Add integration tests for all cache key patterns
- Add tests for all stage transition pathways
- Test circuit breaker with multiple refinements
- Test that existing (non-refinement) Stage 2 flow still works

### ROLLBACK PLAN

Since DB can be reset:
1. Drop RefinementSession and RefinementMessage tables
2. Remove Stage 2B enum value
3. Remove new properties from EmpathyAttempt
4. Revert route/service changes
5. Revert component changes

---

## 7. IMPLEMENTATION ORDER

**Phase 1: Types & Schema** (1-2 days)
1. Add Stage 2.5 enum
2. Add DTOs for refinement
3. Create Prisma models and migration
4. Add stage prompt functions

**Phase 2: Backend Services** (2-3 days)
1. Implement reconciler refinement flow
2. Add refinement streaming
3. Add dispatch handling
4. Add API routes/controllers

**Phase 3: Mobile Implementation** (2-3 days)
1. Create RefinementModalScreen
2. Create refinement hooks and queries
3. Update navigation
4. Update SharingStatusScreen with menu
5. Add Ably event listeners

**Phase 4: Integration & Testing** (1-2 days)
1. E2E tests for Stage 2→2.5→3 flow
2. Cache key validation tests
3. Circuit breaker tests
4. Streaming integration tests

---

*This assessment assumes no database migration constraints.*
*Implementation should proceed in order: Types → Backend → Mobile.*

