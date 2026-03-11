# Chat Display Refactoring Specification

## Progress Tracking

Implementation progress is tracked in: [`implementation/chat-item-refactor-progress.md`](../../implementation/chat-item-refactor-progress.md)

## Overview

Refactor chat data for display so that each item is a first-class element with a distinct type, corresponding data structure, and component renderer. This refactor introduces a type registry pattern, unified ChatItem types in shared/, a backend timeline aggregator endpoint, and fixes known display bugs (infinite scroll issues, unwanted redraws).

## Architecture

### 1. Unified ChatItem Type System

All timeline items conform to a base interface with type discrimination:

```typescript
// shared/src/dto/chat-item.ts

interface BaseChatItem {
  type: ChatItemType;
  id: string;
  timestamp: string;
}

type ChatItemType =
  | 'ai-message'
  | 'user-message'
  | 'empathy-statement'
  | 'shared-context'
  | 'share-suggestion'
  | 'system-message'
  | 'indicator'
  | 'emotion-change'; // Hidden from display for now

type ChatItem =
  | AIMessageItem
  | UserMessageItem
  | EmpathyStatementItem
  | SharedContextItem
  | ShareSuggestionItem
  | SystemMessageItem
  | IndicatorItem
  | EmotionChangeItem;
```

### 2. Type Registry Pattern

Central registry maps type strings to React components:

```typescript
// mobile/src/components/chat/itemRegistry.ts

interface ChatItemRendererProps<T extends ChatItem> {
  item: T;
  animationState: 'animating' | 'complete' | 'hidden';
  onAnimationComplete?: () => void;
}

const itemRenderers: Record<ChatItemType, React.ComponentType<ChatItemRendererProps<any>>> = {
  'ai-message': AIMessageRenderer,
  'user-message': UserMessageRenderer,
  'empathy-statement': EmpathyStatementRenderer,
  'shared-context': SharedContextRenderer,
  'share-suggestion': ShareSuggestionRenderer,
  'system-message': SystemMessageRenderer,
  'indicator': IndicatorRenderer,
  'emotion-change': EmotionChangeRenderer, // Renders null for now
};
```

### 3. Aggregator Pattern

**Backend Aggregator**: New `GET /sessions/:id/timeline` endpoint:
- Queries messages, indicators (derived from timestamps), and emotion changes
- Returns unified `ChatItem[]` sorted by timestamp descending (newest first)
- Supports cursor-based pagination: `?before=<timestamp>&limit=20`
- Paginates by message count, includes all indicators/events within timestamp range
- Returns `{ items: ChatItem[], hasMore: boolean }`

**Client Aggregator**: Same transformation logic for:
- Optimistic updates (immediately add new items to cache)
- Real-time Ably events (insert/update items in cache)
- Shared code in `shared/` directory where possible

### 4. Data Flow

```
[Database: messages, invitations, compacts, emotionalReading, etc.]
       ↓
[Backend Aggregator] → queries → transforms → [ChatItem[]]
       ↓
[API: GET /sessions/:id/timeline]
       ↓
[React Query Cache]
       ↓
[useAnimationQueue hook] → adds animationState → [ChatItem with animation]
       ↓
[ChatInterface] → registry lookup → [Rendered Components]
```

## Item Type Definitions

### AIMessageItem

```typescript
interface AIMessageItem extends BaseChatItem {
  type: 'ai-message';
  content: string;
  status: 'streaming' | 'sent' | 'delivered' | 'read' | 'error';
}
```

### UserMessageItem

```typescript
interface UserMessageItem extends BaseChatItem {
  type: 'user-message';
  content: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  canRetry?: boolean; // Set when status is 'error'
}
```

### EmpathyStatementItem

```typescript
interface EmpathyStatementItem extends BaseChatItem {
  type: 'empathy-statement';
  content: string;
  deliveryStatus: 'sending' | 'pending' | 'delivered' | 'seen' | 'superseded';
}
```

### SharedContextItem

```typescript
interface SharedContextItem extends BaseChatItem {
  type: 'shared-context';
  content: string;
  deliveryStatus: 'sending' | 'pending' | 'delivered' | 'seen' | 'superseded';
}
```

### ShareSuggestionItem

```typescript
interface ShareSuggestionItem extends BaseChatItem {
  type: 'share-suggestion';
  content: string;
}
```

### SystemMessageItem

```typescript
interface SystemMessageItem extends BaseChatItem {
  type: 'system-message';
  content: string;
}
```

### IndicatorItem

```typescript
interface IndicatorItem extends BaseChatItem {
  type: 'indicator';
  indicatorType: 'invitation-sent' | 'invitation-accepted' | 'compact-signed' | 'feel-heard' | 'stage-transition' | 'session-start';
  metadata?: Record<string, unknown>;
}
```

### EmotionChangeItem

```typescript
interface EmotionChangeItem extends BaseChatItem {
  type: 'emotion-change';
  intensity: number;
  previousIntensity?: number;
}
```

Note: `EmotionChangeItem` is included in the timeline for data completeness but its renderer returns `null` (not displayed).

## Ably Integration

### Event Format

Update Ably to send ChatItem-shaped events:

```typescript
// New item
{ event: 'chat-item:new', data: ChatItem }

// Update existing item (partial)
{ event: 'chat-item:update', data: { id: string, changes: Partial<ChatItem> } }
```

### Streaming AI Messages

AI message streaming sends:
1. Initial: `{ type: 'ai-message', id, timestamp, content: '', status: 'streaming' }`
2. Updates: `{ id, changes: { content: 'partial text...' } }`
3. Complete: `{ id, changes: { content: 'full text', status: 'sent' } }`

## Animation System

### useAnimationQueue Hook

Dedicated hook manages animation sequencing:

```typescript
function useAnimationQueue(items: ChatItem[]): ChatItemWithAnimation[] {
  // Tracks which items have animated
  // Returns items with animationState: 'animating' | 'complete' | 'hidden'
  // One item animates at a time (oldest unananimated first)
  // History items (loaded via pagination) skip animation
}
```

### Component Animation Props

Each renderer receives:
- `animationState`: Current animation state
- `onAnimationComplete`: Callback when animation finishes (triggers next in queue)

Components render based on `animationState`, don't control sequencing.

## Pagination

### Request

```
GET /sessions/:id/timeline?before=2024-01-17T10:00:00Z&limit=20
```

### Response

```typescript
{
  items: ChatItem[],      // Sorted newest first
  hasMore: boolean        // More items available before oldest returned
}
```

### Pagination Logic

1. Count messages (ai-message, user-message) up to limit
2. Include all non-message items (indicators, empathy, etc.) within the timestamp range of returned messages
3. `hasMore` = true if more messages exist before the oldest returned message

## UI Behavior

### Typing Indicator

- Remains a derived UI state, NOT a ChatItem
- Shows at bottom when last message is user-message (waiting for AI)
- Hidden when AI message arrives or is streaming

### Empty State (Compact Display)

- NOT a ChatItem in the timeline
- Shown when timeline is empty (no messages yet)
- CompactChatItem component renders onboarding compact

### Removed Features

- **New messages divider**: Remove `lastSeenChatItemId` separator functionality entirely

## Bug Fixes (Included in Refactor)

### 1. Infinite Scroll Divider Issue

**Current bug**: Divider lines always show and messages fill in between during infinite scroll.

**Fix**: With unified ChatItem array, pagination returns complete ordered items. No separate indicator injection that could cause ordering issues.

### 2. Old AI Messages Redraw

**Current bug**: All old AI messages redraw one-at-a-time when new message arrives.

**Fix**:
- `useAnimationQueue` only animates NEW items (not in previous render)
- Items already marked 'complete' stay complete
- Only newly arrived items enter animation queue

### 3. Indicator Disappear/Redraw

**Current bug**: Feel-heard/invitation-sent indicators disappear and redraw when AI message arrives.

**Fix**:
- Stable item identity by ID in React Query cache
- Partial Ably updates don't replace existing items
- Indicators have stable IDs that don't change

## Files to Create/Modify

### Shared (shared/)

- `src/dto/chat-item.ts` - All ChatItem type definitions
- `src/dto/index.ts` - Export ChatItem types
- `src/aggregators/timeline-aggregator.ts` - Shared transformation logic (if feasible)

### Backend (backend/)

- `src/routes/timeline.ts` - New timeline route
- `src/controllers/timeline.ts` - Timeline controller
- `src/services/timeline-aggregator.ts` - Backend aggregator implementation
- `src/services/ably-publisher.ts` - Update to send ChatItem format

### Mobile (mobile/)

- `src/dto/chat-item.ts` - Re-export from shared or local types
- `src/components/chat/itemRegistry.ts` - Type registry
- `src/components/chat/renderers/` - Individual item renderers
  - `AIMessageRenderer.tsx`
  - `UserMessageRenderer.tsx`
  - `EmpathyStatementRenderer.tsx`
  - `SharedContextRenderer.tsx`
  - `ShareSuggestionRenderer.tsx`
  - `SystemMessageRenderer.tsx`
  - `IndicatorRenderer.tsx`
  - `EmotionChangeRenderer.tsx`
- `src/hooks/useAnimationQueue.ts` - Animation sequencing hook
- `src/hooks/useTimeline.ts` - Timeline data fetching with React Query
- `src/components/ChatInterface.tsx` - Refactor to use registry

## User Stories

### US-1: Define ChatItem Types

**Description**: Create all ChatItem type definitions in shared/ directory.

**Acceptance Criteria**:
- [ ] `shared/src/dto/chat-item.ts` exports `ChatItem` discriminated union
- [ ] All 8 item types defined with proper TypeScript interfaces
- [ ] Types are exported from `shared/src/dto/index.ts`
- [ ] `npm run check` passes in shared workspace

### US-2: Create Item Renderers

**Description**: Create individual renderer components for each ChatItem type.

**Acceptance Criteria**:
- [ ] Each item type has corresponding renderer in `mobile/src/components/chat/renderers/`
- [ ] Renderers accept `ChatItemRendererProps` with animationState
- [ ] EmotionChangeRenderer returns null
- [ ] Renderers preserve existing visual styles from ChatBubble
- [ ] `npm run check` passes in mobile workspace

### US-3: Implement Type Registry

**Description**: Create central registry mapping types to components.

**Acceptance Criteria**:
- [ ] `itemRegistry.ts` exports registry object
- [ ] Registry covers all ChatItemType values
- [ ] TypeScript ensures exhaustive coverage
- [ ] ChatInterface uses registry for renderItem

### US-4: Implement useAnimationQueue Hook

**Description**: Extract animation sequencing logic to dedicated hook.

**Acceptance Criteria**:
- [ ] Hook accepts ChatItem[] and returns ChatItemWithAnimation[]
- [ ] Only NEW items (not in previous render) enter animation queue
- [ ] One item animates at a time, oldest first
- [ ] History items (from pagination) skip animation
- [ ] Old messages do NOT re-animate when new message arrives

### US-5: Create Backend Timeline Endpoint

**Description**: Implement `GET /sessions/:id/timeline` aggregator endpoint.

**Acceptance Criteria**:
- [ ] Endpoint returns `{ items: ChatItem[], hasMore: boolean }`
- [ ] Items sorted by timestamp descending
- [ ] Cursor pagination: `?before=<timestamp>&limit=20`
- [ ] Messages, indicators, empathy statements, etc. all included
- [ ] Indicators derived from existing timestamps (no schema change)
- [ ] `npm run test` passes in backend

### US-6: Update Ably Event Format

**Description**: Change Ably to send ChatItem-shaped events.

**Acceptance Criteria**:
- [ ] New events use `chat-item:new` with full ChatItem
- [ ] Updates use `chat-item:update` with `{ id, changes }`
- [ ] Streaming AI messages send incremental content updates
- [ ] Client correctly handles new event format

### US-7: Implement useTimeline Hook

**Description**: Create React Query hook for timeline data.

**Acceptance Criteria**:
- [ ] Hook fetches from `/sessions/:id/timeline`
- [ ] Supports infinite scroll with cursor pagination
- [ ] Handles optimistic updates for new items
- [ ] Processes Ably events (new and update)
- [ ] Partial updates merge correctly by ID

### US-8: Refactor ChatInterface

**Description**: Update ChatInterface to use new system.

**Acceptance Criteria**:
- [ ] Uses registry for renderItem instead of inline logic
- [ ] Consumes useTimeline hook
- [ ] Consumes useAnimationQueue hook
- [ ] Removes lastSeenChatItemId / new messages divider
- [ ] Typing indicator remains derived from last item type
- [ ] Empty state (compact) handled outside timeline

### US-9: Verify Bug Fixes

**Description**: Confirm all three display bugs are fixed.

**Acceptance Criteria**:
- [ ] Infinite scroll: Items load in correct order, no divider-then-fill behavior
- [ ] New message arrival: Old messages do NOT re-animate
- [ ] Indicator stability: Indicators don't disappear/redraw when AI responds

## QA Checklist

### Message Flows

- [ ] Send user message → appears immediately with 'sending' status
- [ ] User message status updates to 'sent' via Ably
- [ ] AI response streams in with typewriter animation
- [ ] AI message status updates to 'sent' when complete
- [ ] Load session with 50+ messages → infinite scroll works correctly
- [ ] Scroll up → older messages load without visual glitches

### Sharing Flows

- [ ] Share empathy statement → appears with 'sending' status
- [ ] Empathy statement updates to 'delivered' when partner receives
- [ ] Empathy statement updates to 'seen' when partner views
- [ ] Share context → appears and updates correctly
- [ ] Receive share suggestion → renders correctly

### Indicator Flows

- [ ] Sign compact → 'compact-signed' indicator appears at correct position
- [ ] Confirm feel-heard → 'feel-heard' indicator appears
- [ ] Accept invitation → 'invitation-accepted' indicator appears
- [ ] Indicators remain stable when new messages arrive (no redraw)

### Animation Behavior

- [ ] New messages animate one at a time, oldest first
- [ ] History messages (scrolled into view) do NOT animate
- [ ] Returning to session → existing messages shown without animation
- [ ] New message during session → only that message animates

## Out of Scope

- Database schema changes
- Message input component changes
- Stage-specific panels (FeelHeardPanel, EmpathyPanel, etc.) - unless interface standardization needed
- Compact display internals (remains empty state, not timeline item)

## Verification Commands

```bash
# Type checking
npm run check

# Run tests
npm run test

# Manual verification in iOS Simulator
npm run ios
```
