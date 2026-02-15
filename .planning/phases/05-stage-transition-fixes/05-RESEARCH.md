# Phase 5: Stage Transition Fixes - Research

**Researched:** 2026-02-14
**Domain:** React Query cache-first architecture with Ably real-time notifications for stage transitions
**Confidence:** HIGH

## Summary

Phase 5 addresses cache consistency and UI update issues during stage transitions in a React Native app using React Query (TanStack Query) with Ably for real-time partner notifications. The architecture follows a "cache-first" pattern where all UI state is derived from the React Query cache, with optimistic updates on user actions and Ably events triggering partner cache updates.

**Current state:** Phase 4 completed comprehensive audit and test coverage for Stages 0-2. Known issues are well-documented in audit files with severity classifications (3 critical, 7 medium, 7 low). The cache-first architecture is verified correct - all 60+ manual cache updates write to correct keys with no mismatches found.

**Primary recommendation:** Fix critical reconciler backend issues (infinite loop, visibility race) first, then address frontend cache update patterns for stage transitions using existing verified patterns from audits.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Query (TanStack Query) | v4 | Client-side state management and caching | Industry standard for server state, optimistic updates, automatic refetching |
| Ably | Latest | Real-time WebSocket communication | Managed infrastructure for WebSockets, automatic reconnection, presence |
| Expo (React Native) | Latest | Mobile app framework | Standard for cross-platform mobile with web support |
| TypeScript | Latest | Type safety | Critical for complex state machines and cache operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | Latest | E2E testing | Two-browser tests for partner interactions |
| Prisma | Latest | Database ORM | Backend transaction management, migrations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Query | Redux Toolkit Query | RTQ has built-in SSE support but React Query has better optimistic update patterns and is already deeply integrated |
| Ably | Socket.io | Socket.io is self-hosted but requires infrastructure management vs. Ably's managed service |

**Installation:**
Already installed in existing codebase.

## Architecture Patterns

### Recommended Project Structure
```
mobile/src/
├── hooks/               # React Query hooks (mutations, queries)
│   ├── queryKeys.ts    # Centralized cache key definitions
│   ├── useSessions.ts  # Session/invitation mutations
│   ├── useStages.ts    # Stage-specific mutations
│   └── useMessages.ts  # Message mutations
├── utils/
│   └── chatUIState.ts  # Pure functions for deriving UI state from cache
└── screens/
    └── UnifiedSessionScreen.tsx  # Ably event handlers
```

### Pattern 1: Optimistic Cache Updates (Verified Correct in Codebase)

**What:** Write to cache immediately in `onMutate`, replace with server response in `onSuccess`, rollback in `onError`

**When to use:** All user-triggered mutations (confirm invitation, sign compact, confirm feel-heard, share empathy)

**Example:**
```typescript
// Source: mobile/src/hooks/useStages.ts lines 494-671
const useConfirmFeelHeard = () => {
  return useMutation({
    mutationFn: async () => post('/api/confirm-feel-heard'),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: sessionKeys.state(sessionId) });
      const previousSessionState = queryClient.getQueryData(sessionKeys.state(sessionId));

      // Optimistic update: set feelHeardConfirmedAt AND advance stage
      queryClient.setQueryData(sessionKeys.state(sessionId), (old) => ({
        ...old,
        progress: {
          ...old.progress,
          milestones: {
            ...old.progress.milestones,
            feelHeardConfirmedAt: new Date().toISOString(),
          },
          myProgress: {
            ...old.progress.myProgress,
            stage: Stage.PERSPECTIVE_STRETCH, // CRITICAL: Update stage in cache
          },
        },
      }));

      return { previousSessionState };
    },

    onSuccess: (data) => {
      // Replace optimistic with server response
      queryClient.setQueryData(sessionKeys.state(sessionId), (old) => ({
        ...old,
        progress: {
          ...old.progress,
          myProgress: {
            ...old.progress.myProgress,
            stage: Stage.PERSPECTIVE_STRETCH, // Confirm stage from server
          },
        },
      }));
    },

    onError: (error, variables, context) => {
      // Rollback to previous state
      if (context?.previousSessionState) {
        queryClient.setQueryData(sessionKeys.state(sessionId), context.previousSessionState);
      }
    },
  });
};
```

**Critical:** Stage transitions MUST update `progress.myProgress.stage` in cache, not just milestone timestamps. UI panels check `myStage === Stage.X` to determine visibility.

---

### Pattern 2: Ably Event Handlers Update Cache Directly (Verified Correct in Codebase)

**What:** Ably events include full status payload to avoid extra HTTP round-trips. Mobile handler calls `queryClient.setQueryData()` directly.

**When to use:** Partner notifications (empathy shared, reconciler status updates, validation)

**Example:**
```typescript
// Source: mobile/src/screens/UnifiedSessionScreen.tsx lines 258-347
onSessionEvent: (event, data) => {
  // Skip self-triggered events (defense in depth)
  if (data.triggeredByUserId === user?.id) return;

  if (event === 'empathy.status_updated') {
    // Backend includes full empathy status in event payload
    if (data.empathyStatus && data.forUserId === user?.id) {
      queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
    } else if (data.empathyStatuses && user?.id) {
      const empathyStatuses = data.empathyStatuses as Record<string, unknown>;
      if (empathyStatuses[user.id]) {
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), empathyStatuses[user.id]);
      }
    }
  }

  if (event === 'empathy.revealed' && data.forUserId === user?.id) {
    queryClient.setQueryData(stageKeys.empathyStatus(sessionId), data.empathyStatus);
    queryClient.refetchQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
  }
}
```

**Key insight:** Events include `forUserId` and `triggeredByUserId` for filtering. Mobile filters out self-triggered events to prevent race conditions with optimistic updates.

---

### Pattern 3: UI State Derivation from Cache (Verified Correct in Codebase)

**What:** Pure function computes all UI visibility from cache values. No local state bridges.

**When to use:** All panel visibility, input hiding, waiting banners

**Example:**
```typescript
// Source: mobile/src/utils/chatUIState.ts lines 198-231
function computeShowEmpathyPanel(inputs: ChatUIStateInputs): boolean {
  const {
    myStage,
    hasEmpathyContent,
    empathyAlreadyConsented,
    hasSharedEmpathyLocal,
    isRefiningEmpathy,
  } = inputs;

  const currentStage = myStage ?? Stage.ONBOARDING;

  // Must be in Stage 2
  if (currentStage !== Stage.PERSPECTIVE_STRETCH) {
    return false;
  }

  // If refining, use Refine button on Share screen instead
  if (isRefiningEmpathy) {
    return false;
  }

  // Local latch prevents flash during refetch
  if (hasSharedEmpathyLocal) {
    return false;
  }

  // If already consented, don't show
  if (empathyAlreadyConsented) {
    return false;
  }

  return hasEmpathyContent;
}
```

**Key insight:** `myStage` is derived from `sessionKeys.state(sessionId)` cache. If stage cache is stale, panels won't show correctly.

---

### Pattern 4: Centralized Query Keys (Verified Correct in Codebase)

**What:** All cache keys defined in single `queryKeys.ts` file to avoid circular dependencies and ensure consistency.

**When to use:** Always. Never inline cache keys.

**Example:**
```typescript
// Source: mobile/src/hooks/queryKeys.ts (inferred structure)
export const sessionKeys = {
  state: (id: string) => ['sessions', id, 'state'] as const,
  detail: (id: string) => ['sessions', id, 'detail'] as const,
  // ...
};

export const stageKeys = {
  empathyStatus: (id: string) => ['stages', id, 'empathy-status'] as const,
  empathyDraft: (id: string) => ['stages', id, 'empathy-draft'] as const,
  // ...
};

export const messageKeys = {
  infinite: (id: string, stage?: number) =>
    stage ? ['messages', id, 'infinite', stage] as const
          : ['messages', id, 'infinite'] as const,
  // ...
};
```

**Key insight:** Audit verified 100% match between cache writes and reads. No mismatched keys found.

---

### Anti-Patterns to Avoid

- **Local State Bridges:** Never use `useState` to hide panels after user action. Derive from cache.
  - Bad: `const [showPanel, setShowPanel] = useState(true); onClick={() => setShowPanel(false)}`
  - Good: `const showPanel = !data?.invitation?.messageConfirmed; // From cache`

- **Invalidate Instead of Set for Stage Transitions:** Stage transitions need immediate cache updates, not background refetches.
  - Bad: `queryClient.invalidateQueries({ queryKey: sessionKeys.state(id) })` (triggers refetch)
  - Good: `queryClient.setQueryData(sessionKeys.state(id), newState)` (immediate update)

- **Missing Stage Cache Updates:** When advancing stages, MUST update `progress.myProgress.stage` in cache.
  - Critical finding from audit: `useConfirmFeelHeard` correctly updates stage (lines 552, 594)
  - Previous bug: Only updated milestone timestamps, not stage enum → panels didn't show

- **Inline Cache Keys:** Never use string literals for cache keys. Always use centralized `queryKeys.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket connection management | Custom socket handling with reconnection logic | Ably SDK | Handles reconnection, presence, message ordering, backpressure automatically |
| Optimistic update rollback | Manual try/catch with state restoration | React Query `onMutate`/`onError` pattern | Atomic rollback on error, handles race conditions |
| UI state derivation | Scattered boolean flags in component state | Pure function in `chatUIState.ts` | Single source of truth, testable, no sync issues |
| Cache invalidation timing | Manual refetch calls after mutations | React Query `invalidateQueries` in `onSuccess` | Automatic stale-while-revalidate, prevents over-fetching |

**Key insight:** The codebase audit found zero cases where custom solutions were needed. React Query + Ably + pure derivation functions handle all requirements.

## Common Pitfalls

### Pitfall 1: Stage Cache Stale After Mutation

**What goes wrong:** User triggers stage transition mutation. Mutation succeeds. UI panels don't show/hide correctly because `myStage` cache value is stale.

**Why it happens:** Mutation only updates milestone timestamps (e.g., `feelHeardConfirmedAt`), not `progress.myProgress.stage` enum. Panel visibility checks `myStage === Stage.PERSPECTIVE_STRETCH` which reads stale value.

**How to avoid:**
1. In `onMutate`: Update both milestone timestamp AND `progress.myProgress.stage`
2. In `onSuccess`: Confirm stage value from server response
3. Verify panel visibility functions in `chatUIState.ts` use updated cache value

**Warning signs:**
- Panel doesn't appear after confirming action
- Panel visibility flashes on/off
- Console shows correct API response but UI doesn't update

**Example fix:**
```typescript
// In onMutate
queryClient.setQueryData(sessionKeys.state(sessionId), (old) => ({
  ...old,
  progress: {
    ...old.progress,
    milestones: { ...old.progress.milestones, feelHeardConfirmedAt: new Date().toISOString() },
    myProgress: { ...old.progress.myProgress, stage: Stage.PERSPECTIVE_STRETCH }, // MUST UPDATE
  },
}));
```

**Verification:** Audit 01-04 confirmed `useConfirmFeelHeard` now includes this fix (lines 552, 594).

---

### Pitfall 2: Partner Cache Not Updated on Ably Event

**What goes wrong:** User A triggers action (e.g., confirms feel-heard). Backend publishes Ably event. User B doesn't see update in UI.

**Why it happens:**
1. Event handler missing for this event type
2. Event handler writes to wrong cache key
3. Event payload missing required data
4. Event filtered out by `triggeredByUserId` check
5. UI derives from different cache key than event updates

**How to avoid:**
1. Backend MUST publish event with full payload (avoid extra HTTP round-trips)
2. Mobile handler MUST call `queryClient.setQueryData()` with correct key
3. Verify cache key matches what UI reads from (use `queryKeys.ts`)
4. Log all events in handler to debug filtering

**Warning signs:**
- Partner sees update only after manual refresh
- Partner sees update 5-10 seconds later (staleTime refetch)
- Event appears in backend logs but not mobile console

**Example from audit:**
```
MEDIUM ISSUE: No Ably event for compact signing
- When one user signs compact, partner doesn't get real-time notification
- Partner sees "Waiting for [Name] to sign compact" until next refetch
- Workaround: User-level refetch picks up changes within 5-10s
- Fix: Add compact.signed event or accept user-level refetch latency
```

**Verification:** Audit 01-04 Appendix A verified all 10 reconciler events have handlers in `UnifiedSessionScreen.tsx`.

---

### Pitfall 3: Race Condition Between Optimistic Update and Ably Event

**What goes wrong:**
1. User A clicks "Confirm feel-heard"
2. Optimistic update sets `feelHeardConfirmedAt` in cache
3. API request succeeds
4. Backend publishes `stage.progress` event
5. User A receives own event via Ably
6. Event handler overwrites cache, causes flash/rerender

**Why it happens:** Ably events are broadcast to all session members, including the user who triggered the action. Without filtering, the event triggers a redundant cache update.

**How to avoid:**
1. Backend includes `triggeredByUserId` in event payload
2. Mobile handler checks `if (data.triggeredByUserId === user?.id) return;`
3. Backend uses `excludeUserId` when publishing to skip actor

**Warning signs:**
- Panel flashes after user clicks button
- Double render in React DevTools
- Event appears in console for user who triggered action

**Example from codebase:**
```typescript
// Source: UnifiedSessionScreen.tsx lines 251-255
const triggeredBySelf = data.triggeredByUserId === user?.id;
if (triggeredBySelf) {
  console.log('[UnifiedSessionScreen] Skipping event triggered by self:', event);
  return;
}
```

**Verification:** Audit confirmed defense-in-depth: backend excludes actor AND mobile filters self-triggered events.

---

### Pitfall 4: Invalidate vs. SetQueryData for Immediate Updates

**What goes wrong:** Mutation uses `invalidateQueries()` which marks cache stale and triggers background refetch. UI updates only after refetch completes (100-500ms delay). User sees stale state briefly.

**Why it happens:** `invalidateQueries()` is async refetch, not immediate update. Stage transitions need instant feedback.

**How to avoid:**
1. Use `setQueryData()` in `onMutate` for immediate optimistic update
2. Use `setQueryData()` in `onSuccess` to replace optimistic with server response
3. Only use `invalidateQueries()` for data that doesn't need instant update (e.g., partner empathy after reveal)

**Warning signs:**
- Delay between button click and panel hiding
- Loading spinner appears briefly after action
- UI shows old state then jumps to new state

**Example from audit:**
```
CRITICAL FIX (commit 6c6504e): Changed from invalidateQueries to setQueryData
- Before: invalidateQueries caused race condition (refetch before mutation response)
- After: setQueryData immediately updates cache with optimistic value
- Applied consistently across all Stage 0-2 mutations
```

**Verification:** Audit 01-04 confirmed all Stage 0-2 mutations use `setQueryData` for `sessionKeys.state`.

---

### Pitfall 5: Local Latches Cause Navigation Issues

**What goes wrong:** User clicks "Share empathy". Local latch `hasSharedEmpathyLocal` prevents panel flash. User navigates away and back. Panel still hidden because latch persists in component state, even though cache shows `empathyAlreadyConsented: false`.

**Why it happens:** Local latches (`useState`, `useRef`) are component-scoped, not cache-scoped. They persist across re-renders but reset on unmount/remount.

**How to avoid:**
1. Prefer deriving from cache: `const showPanel = !data?.empathyAlreadyConsented`
2. If latch is needed for UX, store in cache: `queryClient.setQueryData(stageKeys.empathyDraft(id), { ...old, panelDismissed: true })`
3. Document why latch is necessary (e.g., prevent flash during specific race condition)

**Warning signs:**
- Panel behavior different after navigation
- Panel shows on initial load but not after refresh
- Test fails with "expected panel to show but it didn't"

**Example from audit:**
```
LOW ISSUE: Local latches should move to cache
- Files: UnifiedSessionScreen.tsx (hasSharedEmpathyLocal, hasRespondedToShareOfferLocal)
- Impact: Eliminates component state, fixes navigation issues
- Implementation: Store latch flags in React Query cache
```

**Verification:** Audit 01-04 identified this as low-priority optimization, not a blocker.

## Code Examples

Verified patterns from audit and codebase:

### Stage Transition with Cache Update
```typescript
// Source: mobile/src/hooks/useStages.ts:494-671
// Verified correct in audit 01-04

const useConfirmFeelHeard = (sessionId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return post(`/sessions/${sessionId}/confirm-feel-heard`, {});
    },

    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: sessionKeys.state(sessionId) });

      // Snapshot previous state for rollback
      const previousSessionState = queryClient.getQueryData(sessionKeys.state(sessionId));

      // OPTIMISTIC UPDATE: Set milestone AND advance stage
      queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => ({
        ...old,
        progress: {
          ...old.progress,
          milestones: {
            ...old.progress.milestones,
            feelHeardConfirmedAt: new Date().toISOString(),
          },
          myProgress: {
            ...old.progress.myProgress,
            stage: Stage.PERSPECTIVE_STRETCH, // CRITICAL: Update stage
          },
        },
      }));

      return { previousSessionState };
    },

    onSuccess: (data, _variables) => {
      // Replace optimistic with server response
      queryClient.setQueryData(sessionKeys.state(sessionId), (old: any) => ({
        ...old,
        progress: {
          ...old.progress,
          myProgress: {
            ...old.progress.myProgress,
            stage: Stage.PERSPECTIVE_STRETCH, // Confirm from server
          },
        },
      }));

      // Add transition message to cache
      if (data.transitionMessage) {
        queryClient.setQueryData(messageKeys.list(sessionId), (old: any) =>
          [...(old || []), data.transitionMessage]
        );
      }
    },

    onError: (error, _variables, context) => {
      // ROLLBACK: Restore previous cache state
      if (context?.previousSessionState) {
        queryClient.setQueryData(
          sessionKeys.state(sessionId),
          context.previousSessionState
        );
      }
    },
  });
};
```

---

### Ably Event Handler with Cache Update
```typescript
// Source: mobile/src/screens/UnifiedSessionScreen.tsx:245-360
// Verified correct in audit 01-04 Appendix A

const { partnerOnline, connectionStatus } = useRealtime({
  sessionId,
  enablePresence: true,

  onSessionEvent: (event, data) => {
    console.log('[UnifiedSessionScreen] Received realtime event:', event);

    // DEFENSE IN DEPTH: Skip self-triggered events
    const triggeredBySelf = data.triggeredByUserId === user?.id;
    if (triggeredBySelf) {
      console.log('[UnifiedSessionScreen] Skipping event triggered by self:', event);
      return;
    }

    // Handle empathy status updates
    if (event === 'empathy.status_updated') {
      console.log('[UnifiedSessionScreen] Empathy status updated');

      // PATTERN 1: Individual status (forUserId + empathyStatus)
      if (data.empathyStatus && data.forUserId === user?.id) {
        queryClient.setQueryData(
          stageKeys.empathyStatus(sessionId),
          data.empathyStatus
        );
      }

      // PATTERN 2: Broadcast (empathyStatuses for all users)
      else if (data.empathyStatuses && user?.id) {
        const empathyStatuses = data.empathyStatuses as Record<string, unknown>;
        if (empathyStatuses[user.id]) {
          queryClient.setQueryData(
            stageKeys.empathyStatus(sessionId),
            empathyStatuses[user.id]
          );
        }
      }

      // Show validation modal if our empathy was validated
      if (data.status === 'VALIDATED' && data.forUserId === user?.id) {
        showPartnerEventModal('empathy_validated');
      }
    }

    // Handle mutual reveal
    if (event === 'empathy.revealed' && data.forUserId === user?.id) {
      console.log('[UnifiedSessionScreen] Empathy revealed, updating cache');

      // Update empathy status cache
      queryClient.setQueryData(
        stageKeys.empathyStatus(sessionId),
        data.empathyStatus
      );

      // Refetch partner empathy (large payload)
      queryClient.refetchQueries({
        queryKey: stageKeys.partnerEmpathy(sessionId)
      });

      // Show validation modal only to SUBJECT (not guesser)
      if (data.guesserUserId && data.guesserUserId !== user?.id) {
        showPartnerEventModal('validation_needed');
      }
    }
  },
});
```

---

### UI State Derivation
```typescript
// Source: mobile/src/utils/chatUIState.ts:423-478
// Pure function - no side effects

export function computeChatUIState(inputs: ChatUIStateInputs): ChatUIState {
  // Step 1: Compute waiting status
  const waitingStatus = computeWaitingStatus(inputs);
  const waitingStatusConfig = getWaitingStatusConfig(waitingStatus);

  // Step 2: Compute individual panel visibility
  const showInvitationPanel = computeShowInvitationPanel(inputs);
  const showEmpathyPanel = computeShowEmpathyPanel(inputs);
  const showFeelHeardPanel = computeShowFeelHeardPanel(inputs);
  const showShareSuggestionPanel = computeShowShareSuggestionPanel(inputs);
  const showWaitingBanner = computeShouldShowWaitingBanner(waitingStatus);

  const panels = {
    showInvitationPanel,
    showEmpathyPanel,
    showFeelHeardPanel,
    showShareSuggestionPanel,
    showWaitingBanner,
  };

  // Step 3: Determine which single panel to show (priority order)
  const aboveInputPanel = computeAboveInputPanel(inputs, panels);

  // Step 4: Compute input visibility
  const shouldHideInput = computeShouldHideInput(
    waitingStatusConfig,
    aboveInputPanel,
    inputs
  );

  return {
    waitingStatus,
    waitingStatusConfig,
    aboveInputPanel,
    shouldHideInput,
    panels,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `invalidateQueries()` for stage transitions | `setQueryData()` for immediate updates | Commit 6c6504e (Phase 4) | Eliminated race condition where refetch returned before mutation response |
| Local state for panel visibility | Derive from cache via `computeChatUIState()` | Initial architecture | Single source of truth, no sync issues |
| Fire-and-forget AI responses via HTTP | SSE streaming with metadata | Recent (2026) | Reduced latency, improved UX |
| Symmetric reconciler (both users must share) | Asymmetric reconciler (per-direction) | Early 2026 | Unblocked one user from other's Stage 1 completion |

**Deprecated/outdated:**
- `useSendMessage` and `useAIMessageHandler`: Replaced by SSE streaming (audit 01-04 Low Issue #1)
- `NEEDS_WORK` empathy status: Replaced by `AWAITING_SHARING` / `REFINING` (audit 01-02 section 6.7)
- Stage-specific cache duplication: `messageKeys.list(sessionId, stage)` maintained separately from `messageKeys.list(sessionId)` (audit 01-04 Low Issue #2) - optimization target for v1.2

## Open Questions

1. **Should Stage 0 get real-time events for compact signing and invitation confirmation?**
   - What we know: Currently relies on user-level refetch (5-10s latency)
   - What's unclear: Is real-time feedback necessary for onboarding? User isn't actively waiting.
   - Recommendation: MEDIUM priority. Add in v1.1 if user feedback indicates confusion about partner status.

2. **How to handle HELD→ANALYZING transition when partner completes Stage 1 after empathy shared?**
   - What we know: No automatic retry. User must refresh to trigger reconciler.
   - What's unclear: Best UX - push notification, polling, or user-initiated retry?
   - Recommendation: MEDIUM priority. Add Ably listener for partner Stage 1 completion in v1.1.

3. **Should local latches move to cache or stay in component state?**
   - What we know: Local latches prevent flash during race conditions but cause navigation issues
   - What's unclear: Performance impact of cache writes vs. component state
   - Recommendation: LOW priority optimization. Current solution works, just not ideal for navigation edge cases.

## Sources

### Primary (HIGH confidence)
- **Codebase audit files:**
  - `.planning/phases/01-audit/01-04-AUDIT-CACHE-UPDATES.md` - Verified all 60+ cache updates correct
  - `.planning/phases/01-audit/01-02-AUDIT-RECONCILER.md` - Complete reconciler state machine documentation
  - `.planning/phases/01-audit/01-01-AUDIT-STAGE-0-1.md` - Stage 0-1 transition patterns
  - `.planning/phases/01-audit/01-03-AUDIT-STAGE-2.md` - Stage 2 empathy exchange patterns

- **Verified code files:**
  - `mobile/src/hooks/useStages.ts` - Stage transition mutations (lines 494-671 for useConfirmFeelHeard)
  - `mobile/src/hooks/useSessions.ts` - Session/invitation mutations
  - `mobile/src/screens/UnifiedSessionScreen.tsx` - Ably event handlers (lines 245-360)
  - `mobile/src/utils/chatUIState.ts` - UI derivation functions
  - `mobile/src/hooks/queryKeys.ts` - Centralized cache keys

- **Project documentation:**
  - `CLAUDE.md` - Cache-first architecture principles and patterns
  - `MEMORY.md` - Key learnings from past bugs and fixes

### Secondary (MEDIUM confidence)
- [TanStack Query Optimistic Updates Guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) - Official patterns for mutations
- [TanStack Query Caching Examples](https://tanstack.com/query/v4/docs/framework/react/guides/caching) - Cache invalidation strategies
- [Ably WebSockets with React Tutorial](https://ably.com/blog/websockets-react-tutorial) - Real-time integration best practices
- [Ably React Realtime Updates](https://ably.com/blog/react-realtime-updates) - React Hooks integration patterns

### Tertiary (LOW confidence - general concepts)
- [Cache Consistency Strategies](https://www.oreateai.com/blog/cache-consistency-strategies-why-deleting-is-preferred-over-updating-the-cache/c2e83e9f55176e269e16ab0ecf6bdc74) - Delete vs. update cache patterns
- [Facebook TAO Cache Consistency](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/) - Distributed cache challenges
- [Handling Race Conditions in Distributed Systems](https://www.geeksforgeeks.org/handling-race-condition-in-distributed-system/) - General strategies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are currently used and audited
- Architecture: HIGH - Audit verified 100% correct implementation of cache-first pattern
- Pitfalls: HIGH - All from documented bugs and audit findings in codebase

**Research date:** 2026-02-14
**Valid until:** 90 days (architecture is stable, patterns are mature)

**Key findings:**
1. Cache-first architecture is correctly implemented - no changes needed
2. All known issues are catalogued in audits with severity and fix recommendations
3. Critical issues are in reconciler backend (infinite loop, visibility race), not frontend cache patterns
4. Frontend patterns are mature and verified - use existing patterns for fixes
5. Two-browser E2E test infrastructure exists and works (Phase 4 completion)
