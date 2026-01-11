# Meet Without Fear Development

## Development Practices

### Test-Driven Development

- Write tests first, then implementation
- Run `npm run test` in the relevant workspace before considering work complete
- Run `npm run check` to verify types before committing
- Backend tests run in silent mode by default; use `--verbose` flag to see console output when debugging

### Code Organization

- **Shared types in `shared/`** - All DTOs, contracts, and cross-workspace types
- **Small, testable functions** - Each function does one thing
- **Logic separate from views** - Mobile: hooks/services for logic, components for UI
- **Reusable code** - Extract common patterns to shared or workspace-level utilities

### Verification Before Completion

Always run before considering a task done:

```bash
npm run check   # Type checking across all workspaces
npm run test    # Tests across all workspaces
```

### Git Workflow

- Commit and push often (small, focused commits)
- Each commit should pass check and test

### Database Migrations

- **Never use `prisma db push`** - Always create proper migrations
- Use `npx prisma migrate dev --name <description>` to create migrations
- Migration files are tracked in git and applied consistently across environments

### Database Queries

To run ad-hoc Prisma queries, create a temp file in `backend/src/` that imports from `./lib/prisma` and run with `npx ts-node`.

## Project Structure

- `shared/` - Types, DTOs, contracts shared between backend and mobile
- `backend/` - Express API, Prisma, business logic
- `mobile/` - Expo React Native app
- `implementation/` - Executable implementation plans (not deployed)
- `docs/mvp-planning/` - Planning docs (deployed to docs site)

## State Management Architecture

The mobile app follows a **Cache-First** (Single Source of Truth) pattern using React Query. This architecture ensures consistent UI behavior and eliminates bugs caused by state synchronization issues.

### Golden Rule: If It's on Screen, It's in Cache

All UI state should be derived from the React Query cache. Never use local state (`useState`, `useRef`) to bridge the gap between user actions and server responses.

### Core Principles

1. **Optimistic Updates**: Use `onMutate` in mutations to immediately write expected results to cache
2. **Rollback on Error**: The `onError` handler restores previous cache state if the API call fails
3. **Derive UI State**: Compute UI visibility/state from cached data, not local variables
4. **Indicators are Data**: Timeline indicators (e.g., "Invitation Sent") are derived from timestamps in cache

### Mutation Pattern

```typescript
useMutation({
  mutationFn: async (params) => {
    return post('/api/endpoint', params);
  },

  // 1. OPTIMISTIC UPDATE: Write to cache immediately
  onMutate: async (params) => {
    await queryClient.cancelQueries({ queryKey: someKeys.data(id) });
    const previousData = queryClient.getQueryData(someKeys.data(id));

    // Write optimistic result to cache
    queryClient.setQueryData(someKeys.data(id), (old) => ({
      ...old,
      someField: true,
      someFieldTimestamp: new Date().toISOString(),
    }));

    return { previousData };
  },

  // 2. REPLACE: Server response overwrites optimistic data
  onSuccess: (data, params) => {
    queryClient.invalidateQueries({ queryKey: someKeys.data(id) });
  },

  // 3. ROLLBACK: Restore previous state on error
  onError: (error, params, context) => {
    if (context?.previousData) {
      queryClient.setQueryData(someKeys.data(id), context.previousData);
    }
  },
});
```

### Deriving UI State

```typescript
// BAD: Local state bridging user action to server response
const [showPanel, setShowPanel] = useState(true);
const handleConfirm = () => {
  setShowPanel(false); // Local state → out of sync on reload
  mutate();
};

// GOOD: Derive from cache
const { data } = useSessionState(sessionId);
const showPanel = !data?.invitation?.messageConfirmed; // Derived from cache
const handleConfirm = () => {
  mutate(); // onMutate sets messageConfirmed: true in cache → panel hides
};
```

### Timeline Indicators

Indicators (e.g., "Invitation Sent", "Compact Signed") are derived from timestamps in the cache using `deriveIndicators()` in `chatListSelector.ts`:

```typescript
// Indicators appear based on cached timestamps
if (invitation?.messageConfirmedAt) {
  indicators.push({
    type: 'indicator',
    indicatorType: 'invitation-sent',
    timestamp: invitation.messageConfirmedAt,
  });
}
```

### Typing Indicator (Ghost Dots)

The typing indicator is derived from the last message role, not a boolean state:

```typescript
// In ChatInterface.tsx
const isWaitingForAI = messages.length > 0 &&
  messages[messages.length - 1]?.role === MessageRole.USER;
```

- When user sends message → added to cache → last message is USER → dots show
- When AI response arrives (via Ably) → added to cache → last message is AI → dots hide

### Query Key Organization

Query keys are centralized in `mobile/src/hooks/queryKeys.ts` to avoid circular dependencies. All hooks import keys from there:

```typescript
// In queryKeys.ts
export const sessionKeys = {
  state: (id: string) => ['sessions', id, 'state'] as const,
  // ...
};

// In hooks
import { sessionKeys } from './queryKeys';
```

### Key Files

- `mobile/src/hooks/queryKeys.ts` - Centralized query key definitions
- `mobile/src/utils/chatListSelector.ts` - Pure functions for deriving indicators
- `mobile/src/hooks/useChatUIState.ts` - Derives UI visibility from cache data
- `mobile/src/hooks/useMessages.ts` - Message mutations with optimistic updates
- `mobile/src/hooks/useSessions.ts` - Session/invitation mutations
- `mobile/src/hooks/useStages.ts` - Stage-specific mutations (compact, feel-heard)
