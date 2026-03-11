# Inner Thoughts Retrieval Specification

## Overview

Add retrieval capabilities to Inner Thoughts sessions so the AI can remember things from other sessions - both other Inner Thoughts sessions AND partner sessions. This creates cross-pollination of insights between solo reflection and partner conversations.

## Goals

1. **Enable memory across Inner Thoughts sessions** - If user processed something in one Inner Thoughts session, that context should be available in future sessions
2. **Enable cross-session retrieval** - If user talked about a topic with their partner, that context should surface in Inner Thoughts (and vice versa)
3. **Optimize performance** - Fix existing blocking issues and ensure retrieval doesn't add significant latency

## Technical Decisions

### Retrieval Scope
Search BOTH the `Message` table (partner sessions) AND `InnerWorkMessage` table (Inner Thoughts sessions).

### Detection Strategy
**Skip Haiku-based reference detection** - always perform semantic search with a high threshold.

Rationale:
- Reduces latency (no LLM call before search)
- Better recall (vector search captures implicit semantic connections)
- Use similarity threshold (0.75) to filter noise instead of LLM gating
- Vector search (~$0.0001, ~100ms) is cheaper and faster than Haiku gate (~$0.001, ~200-400ms)

### Linked Session Boost
When Inner Thoughts is linked to a partner session (via `linkedPartnerSessionId`), messages from that session get a ~30% similarity boost. This makes reflection more contextually relevant to what triggered the Inner Thoughts session.

### Context Formatting
Use consistent formatting with partner sessions:
- Partner sessions: `[Session with Sarah, a few days ago]`
- Inner Thoughts: `[Your reflections, a few days ago]`

### Retrieval Limits
- **15 combined results** across both tables, sorted purely by relevance
- No separate per-table limits - let relevance determine what surfaces
- Higher threshold (0.75) compared to partner sessions (0.5) since no LLM gating

### Current Session Handling
Exclude the current Inner Thoughts session from search results. The current conversation is already in context via conversation history.

### Trigger Timing
Run retrieval **after user's first message** (not on session creation). This ensures we have user content to search against for relevant results.

### Consolidated Background Classifier
Run a **single Haiku call** for all background classification tasks instead of multiple separate calls. This single non-blocking call handles:

1. **Memory intent detection** - Is the user requesting that a memory be saved?
2. **Theme extraction** - Find themes for embedding/categorization
3. **Session metadata update** - Title, mood, topics
4. **Summary update** - Condensed session summary

The output is a structured JSON object with all results:

```typescript
interface BackgroundClassifierResult {
  memoryIntent: {
    detected: boolean;
    suggestedMemory?: string;
    confidence: number;
  };
  themes: string[];
  sessionMetadata: {
    title?: string;
    mood?: string;
    topics?: string[];
  };
  summary?: string;
}
```

Rationale:
- **Lower latency** - One round-trip instead of 3-4
- **Lower cost** - Single prompt with shared context vs. repeated context in each call
- **Atomic processing** - All background work happens together, easier to reason about
- **Better coherence** - Single model call sees full context for all decisions

## Architecture

### Extend `retrieveContext()` in `context-retriever.ts`

Add new options to the existing retrieval function:

```typescript
interface RetrievalOptions {
  // ... existing options ...

  /** Include InnerWorkMessage search (for Inner Thoughts sessions) */
  includeInnerThoughts?: boolean;

  /** Current Inner Thoughts session ID to exclude from search */
  excludeInnerThoughtsSessionId?: string;

  /** Linked partner session ID for similarity boost */
  linkedPartnerSessionId?: string;

  /** Skip reference detection - always search (for Inner Thoughts) */
  skipDetection?: boolean;
}
```

### New function: `searchInnerWorkMessages()`

Add to `context-retriever.ts`:

```typescript
async function searchInnerWorkMessages(
  userId: string,
  queryEmbedding: number[],
  excludeSessionId?: string,
  linkedPartnerSessionId?: string,
  boostFactor: number = 1.3,
  limit: number = 15,
  threshold: number = 0.75
): Promise<RelevantMessage[]>
```

### Update `sendInnerWorkMessage` in `inner-work.ts`

Call the extended `retrieveContext()` function and inject results into the prompt.

## Performance Optimization

### Current Issues (to fix in same PR)

1. **`detectMemoryIntent()` is BLOCKING** - adds 200-500ms after AI response is ready
2. **Pre-LLM operations are sequential** - could be parallelized

### Optimized Flow

```
1. Save user message (DB)
                              │
2. PARALLEL PRE-LLM:          │ ~150ms (longest op wins)
   ├─ getEmbedding + vectorSearch (retrieval)
   ├─ getInnerThoughtsSummary (DB)
   ├─ getRecentThemes (DB)
   └─ fetchLinkedPartnerSessionContext (DB)
                              │
3. Build prompt with retrieved context
                              │
4. MAIN LLM CALL (Sonnet)     │ ~1-3s
                              │
5. Save AI message + update timestamp (DB)
                              │
6. SEND RESPONSE TO USER ◄──── USER SEES RESPONSE HERE
                              │
7. FIRE-AND-FORGET (non-blocking):
   ├─ embedInnerWorkMessage x2 (Titan)
   ├─ runBackgroundClassifier (Haiku) ← SINGLE CONSOLIDATED CALL
   │   ├─ detectMemoryIntent (was blocking)
   │   ├─ extractThemesForEmbedding
   │   ├─ updateSessionMetadata
   │   └─ updateInnerThoughtsSummary
   └─ Push suggestion via Ably when ready
```

### Net Latency Impact
- +100-150ms for retrieval (runs parallel with existing DB queries)
- -200-500ms from fixing memory detection blocking
- **Net: slight improvement in user-perceived latency**

## User Stories

### US-1: Basic Retrieval
**As a user**, when I mention something in Inner Thoughts that I discussed before (in any session), the AI should have awareness of that context.

**Acceptance Criteria:**
- When user sends a message in Inner Thoughts, system performs vector search
- Results with similarity > 0.75 are injected into prompt
- AI response demonstrates awareness of relevant past content
- Retrieval adds < 200ms to response time

### US-2: Linked Session Boost
**As a user** who started Inner Thoughts from a partner session, the AI should prioritize context from that partner session.

**Acceptance Criteria:**
- When `linkedPartnerSessionId` is set, messages from that session get 30% similarity boost
- Linked session content surfaces more readily than unrelated content
- Boost is applied after base similarity calculation

### US-3: Cross-Session Context
**As a user**, insights from my Inner Thoughts should inform partner session conversations (and vice versa).

**Acceptance Criteria:**
- Partner session retrieval can find relevant InnerWorkMessage content
- Inner Thoughts retrieval can find relevant Message content
- Both directions work without explicit user action

### US-4: Performance - Non-blocking Memory Detection
**As a user**, I should not wait for memory detection before seeing the AI response.

**Acceptance Criteria:**
- `detectMemoryIntent` runs after response is sent
- Memory suggestion is pushed via Ably when ready
- Response latency decreased by 200-500ms

### US-5: Performance - Parallel Pre-LLM Operations
**As a user**, retrieval should not significantly increase response time.

**Acceptance Criteria:**
- Retrieval runs in parallel with existing DB queries (Promise.all)
- Total pre-LLM time is bounded by slowest operation (~150ms)
- No sequential bottleneck for pre-LLM work

## Files to Modify

1. **`backend/src/services/context-retriever.ts`**
   - Add `searchInnerWorkMessages()` function
   - Extend `retrieveContext()` with new options
   - Add `RelevantMessage.source` field for formatting

2. **`backend/src/controllers/inner-work.ts`**
   - Import and call `retrieveContext()` in `sendInnerWorkMessage`
   - Parallelize pre-LLM operations with Promise.all
   - Replace multiple Haiku calls with single `runBackgroundClassifier()`
   - Inject retrieved context into prompt

3. **`backend/src/services/context-retriever.ts` (formatting)**
   - Update `formatRetrievedContext()` to handle Inner Thoughts source label

4. **`backend/src/services/background-classifier.ts`** (new file)
   - Create `runBackgroundClassifier()` function
   - Single Haiku call with structured JSON output
   - Consolidates: memory detection, theme extraction, metadata update, summary

## Out of Scope

- User preferences UI for controlling retrieval settings
- Proactive surfacing ("I remember you said...") - only passive context in prompt
- Haiku-based detection for Inner Thoughts (using threshold instead)
- Changes to partner session retrieval flow

## Verification

### Manual Testing
1. Create Inner Thoughts session, discuss topic X
2. Create new Inner Thoughts session, mention topic X
3. Verify AI response shows awareness of prior discussion
4. Check server logs for `[ContextRetriever]` output

### Automated Testing
1. Integration test: create messages, verify retrieval returns them
2. Performance test: measure response latency before/after changes
3. Threshold test: verify low-similarity results are filtered

### Commands
```bash
npm run test        # Run all tests
npm run check       # Type checking
```

---

# Hamburger Drawer Navigation

## Overview

Replace bottom tab navigation with a hamburger menu drawer. The drawer provides access to Inner Thoughts and Partner Sessions lists, while the Home screen remains the primary landing page with quick actions.

## Goals

1. **Simplify navigation** - Remove bottom tabs, single entry point (Home)
2. **Unified session access** - Both session types in one drawer with tabs
3. **Seamless chat transition** - Home chat input → Inner Thoughts feels like one continuous experience
4. **Unread visibility** - Badge on hamburger shows unread partner session count

## Navigation Structure

### Home Screen Header
- **Left**: Hamburger icon (☰) with badge showing unread partner session count
- **Right**: Gear icon (⚙) → Settings

### Home Screen Content (unchanged)
- Logo
- "Hi [name]" greeting
- "What can I help you work through today?"
- Quick actions: Continue with [partner], New Session, Inner Work
- Pending invitation CTA (if applicable)
- Chat input at bottom ("What's on your mind?")

### Drawer
- Slides from left, covers ~90% of screen width
- **Segmented control at top**: "Inner Thoughts" | "Partner Sessions"
- **Session list below**: Scrollable, sorted by `updatedAt` descending
- **Unread indicators**: Only on partner sessions (existing `hasUnread` field)
- **Swipe-to-delete**: Existing behavior preserved
- **Empty states**: Per-tab prompts to start new session
- **New session button**: "+" in drawer header
  - Inner Thoughts tab: Creates new Inner Thoughts session
  - Partner Sessions tab: Navigates to `/session/new`

## Technical Decisions

### Unread Tracking
- **Partner sessions**: Use existing `hasUnread` field and `useUnreadSessionCount` hook
- **Inner Thoughts**: No unread indicators (solo sessions, self-driven)
- **Hamburger badge**: Partner session unread count only

### Drawer State
- Managed via context/hook (`useSessionDrawer`)
- Remembers last selected tab within session
- Closes on session selection

### Routing Changes
- Remove tab-based routing
- Settings moves from tab to `/settings/index.tsx`
- Inner Work button still navigates to Inner Work hub (`/inner-work`)

### Home → Inner Thoughts Transition
When user types in Home chat input and sends:
- **Fades out (~200ms)**: Header, logo, greeting, question, quick action buttons
- **Fades in (~200ms)**: Inner Thoughts header (back button, title), AI response message
- Two identical `ChatInput` components positioned identically at bottom
- Custom fade transition (no horizontal slide)
- Keyboard dismisses on send (normal behavior)
- Creates illusion of continuous conversation

## User Stories

### US-6: Hamburger Menu Access
**As a user**, I can tap the hamburger icon to open a drawer with all my sessions.

**Acceptance Criteria:**
- Hamburger icon appears in top left of Home screen
- Tapping opens drawer that covers ~90% of screen width
- Drawer has segmented control: "Inner Thoughts" | "Partner Sessions"
- Sessions listed by most recent activity
- Tapping a session navigates to it and closes drawer

### US-7: Unread Badge
**As a user**, I can see how many partner sessions have unread messages from the hamburger icon.

**Acceptance Criteria:**
- Badge appears on hamburger icon when unread count > 0
- Badge shows count (or "99+" if > 99)
- Badge updates in real-time via Ably
- Only partner sessions count toward badge (not Inner Thoughts)

### US-8: Settings Access
**As a user**, I can access settings from a gear icon on the Home screen.

**Acceptance Criteria:**
- Gear icon appears in top right of Home screen
- Tapping navigates to Settings
- Bottom tab bar is removed

### US-9: Seamless Chat Transition
**As a user**, when I type in the Home chat input and send, it feels like I'm already in a conversation.

**Acceptance Criteria:**
- Chat input stays visually anchored at bottom
- Home content fades out, Inner Thoughts content fades in
- No horizontal slide animation
- AI response appears in the new chat context

### US-10: Session List Features
**As a user**, I can manage my sessions from within the drawer.

**Acceptance Criteria:**
- Swipe-to-delete works on both Inner Thoughts and Partner Sessions
- "+" button in drawer header creates new session (type depends on active tab)
- Empty states show per-tab prompts
- Partner sessions show unread indicator dot

## Files to Create

1. **`mobile/src/components/SessionDrawer.tsx`**
   - Main drawer component
   - Segmented control for tab switching
   - Header with title and new session button

2. **`mobile/src/components/SessionDrawer/SessionList.tsx`**
   - Shared list component for both tabs
   - Handles loading, empty states, swipe-to-delete
   - Receives session type as prop

3. **`mobile/src/hooks/useSessionDrawer.ts`**
   - Drawer open/close state
   - Selected tab state
   - Exposed via context

## Files to Modify

1. **`mobile/app/(auth)/(tabs)/_layout.tsx`**
   - Remove `Tabs` component
   - Replace with simple stack/slot layout
   - Configure fade transition for Home → Inner Thoughts

2. **`mobile/app/(auth)/(tabs)/index.tsx`**
   - Add hamburger icon (left) with badge
   - Add gear icon (right)
   - Integrate drawer component
   - Keep all existing content

3. **`mobile/app/(auth)/(tabs)/sessions.tsx`**
   - Delete file (functionality moved to drawer)

4. **`mobile/app/(auth)/(tabs)/settings.tsx`**
   - Move to `mobile/app/(auth)/settings/index.tsx`

5. **`mobile/app/(auth)/inner-work/self-reflection/[id].tsx`**
   - Configure fade-in transition when coming from Home

## Files to Delete

1. `mobile/app/(auth)/(tabs)/sessions.tsx` - Replaced by drawer
2. `mobile/app/(auth)/inner-thoughts/index.tsx` - Replaced by drawer (keep [id].tsx)

## Out of Scope

- Unread tracking for Inner Thoughts sessions
- Changes to Inner Work hub navigation
- Changes to partner session chat screens
- Gesture-based drawer opening (hamburger tap only for v1)

## Verification

### Manual Testing
1. Tap hamburger → drawer opens with Inner Thoughts tab
2. Switch to Partner Sessions tab → list shows with unread dots
3. Tap session → navigates to chat, drawer closes
4. Type in Home chat input, send → fades to Inner Thoughts chat
5. Back button → returns to Home
6. Gear icon → Settings screen
7. Badge updates when partner sends message (via Ably)

### Edge Cases
- Empty states for both tabs
- Swipe-to-delete works in drawer
- Deep links still work
- Pending invitation flow unchanged
