# Neural Monitor Status Dashboard - Deep-Dive Analysis

**Date:** February 22, 2026
**Analyzed By:** Codebase Analyst
**Scope:** Complete Neural Monitor dashboard architecture, data flow, and current implementation

---

## Executive Summary

The Neural Monitor is a real-time web dashboard that visualizes:
- **Session browser** - List of all partner/inner-work sessions with stats
- **Session detail view** - Brain activity (AI processing steps) organized by turns
- **Context page** - Assembled AI context bundles showing what data the AI receives
- **16+ typed event components** - Specialized visualizations for each AI processing type

**Key Architecture:** React + React Router frontend, Ably for real-time updates, Express backend serving session/activity data via REST + Ably events. Uses Prisma ORM for data access.

---

## Part 1: Directory Structure & Component Organization

### Frontend Structure
```
tools/status-dashboard/src/
├── components/
│   ├── browser/           # Session list view
│   │   ├── SessionBrowser.tsx       # Main container
│   │   ├── SessionBrowserHeader.tsx # Top bar with connection status
│   │   ├── SessionList.tsx          # Infinite-scroll list
│   │   ├── SessionItem.tsx          # Single session card
│   │   └── SessionListHeader.tsx
│   ├── session/           # Session detail view
│   │   ├── SessionDetail.tsx        # Main detail container
│   │   ├── SessionDetailHeader.tsx  # Header with cost/token stats
│   │   ├── SplitView.tsx            # Two-column view for partner sessions
│   │   ├── TurnView.tsx             # Single turn (user message + AI activities)
│   │   ├── ActivityItem.tsx         # Activity row renderer (dispatches to EventRenderer or legacy)
│   │   ├── DetailBlock.tsx          # Expandable JSON viewer
│   │   ├── FormattedPrice.tsx       # Price component with formatting
│   │   └── SmartDataViewer.tsx      # Generic data viewer
│   ├── events/            # Typed event display components (16 types)
│   │   ├── EventRenderer.tsx        # Dispatcher to specific event components
│   │   ├── BaseEventWrapper.tsx     # Shared wrapper for all events
│   │   ├── OrchestratedResponseEvent.tsx
│   │   ├── PartnerSessionClassificationEvent.tsx
│   │   ├── IntentDetectionEvent.tsx
│   │   ├── RetrievalPlanningEvent.tsx
│   │   ├── BackgroundClassificationEvent.tsx
│   │   ├── ChatRouterResponseEvent.tsx
│   │   ├── ReferenceDetectionEvent.tsx
│   │   ├── PeopleExtractionEvent.tsx
│   │   ├── MemoryValidationEvent.tsx
│   │   ├── ReconcilerAnalysisEvent.tsx
│   │   ├── SummarizationEvent.tsx
│   │   ├── NeedsExtractionEvent.tsx
│   │   ├── WitnessingResponseEvent.tsx
│   │   ├── MemoryFormattingEvent.tsx
│   │   ├── ThemeExtractionEvent.tsx
│   │   └── GenericActivityEvent.tsx  # Fallback for unknown types
│   └── context/           # Context bundle page
│       ├── ContextPage.tsx
│       ├── ContextColumn.tsx
│       ├── RecentMessagesSection.tsx
│       ├── NotableFactsSection.tsx
│       ├── EmotionalThreadSection.tsx
│       ├── SessionSummarySection.tsx
│       ├── UserMemoriesSection.tsx
│       ├── InnerThoughtsSection.tsx
│       ├── PriorThemesSection.tsx
│       └── GlobalFactsSection.tsx
├── hooks/
│   ├── useAblyConnection.ts    # Manages Ably real-time connection
│   ├── useSessions.ts          # Fetches session list with pagination
│   ├── useSessionActivity.ts   # Fetches activities for a session
│   └── useContextBundle.ts     # Fetches context bundle
├── services/
│   ├── api.ts                  # REST API client
│   └── index.ts
├── types/
│   ├── activity.ts             # BrainActivity types and call types
│   ├── session.ts              # Session, User, Relationship types
│   ├── context.ts              # ContextBundle types
│   └── index.ts
├── utils/
│   ├── activityDisplay.ts      # Activity preview/icon extraction
│   ├── turnGrouping.ts         # Groups activities into turns
│   ├── formatters.ts           # Price, duration, model name formatting
│   ├── dataParsing.ts          # Deep JSON parsing
│   └── json.ts
├── constants/
│   └── ably.ts                 # Ably channel names and event types
├── App.tsx                     # Main router
└── main.tsx

Backend Integration:
backend/
├── src/
│   ├── routes/
│   │   └── brain.ts            # 3 endpoints: /activity/:sessionId, /sessions/:sessionId/context, /sessions
│   ├── services/
│   │   └── brain-service.ts    # Activity lifecycle + Ably broadcasting
│   └── ...
└── prisma/
    └── schema.prisma           # BrainActivity model + enums
```

---

## Part 2: Data Types & Contracts

### Activity Types (From `types/activity.ts`)

**16 BrainActivity Call Types** (for specialized event display):
1. `ORCHESTRATED_RESPONSE` - User-facing AI response (Sonnet - warm accent)
2. `RETRIEVAL_PLANNING` - Decides if memory retrieval needed
3. `INTENT_DETECTION` - Detects if user message references past sessions
4. `BACKGROUND_CLASSIFICATION` - Classifies user's emotional background
5. `PARTNER_SESSION_CLASSIFICATION` - Classifies partner's session context
6. `CHAT_ROUTER_RESPONSE` - Routes conversation to appropriate handler
7. `REFERENCE_DETECTION` - Detects references to people/facts
8. `PEOPLE_EXTRACTION` - Extracts mentioned people from conversation
9. `MEMORY_VALIDATION` - Validates retrieved memories for relevance
10. `RECONCILER_ANALYSIS` - Analyzes conflicts between partner perspectives
11. `SUMMARIZATION` - Summarizes conversation/context
12. `NEEDS_EXTRACTION` - Extracts unmet needs from conversation
13. `WITNESSING_RESPONSE` - Generates witnessing/empathy response (Sonnet - warm accent)
14. `MEMORY_FORMATTING` - Formats memories for storage
15. `THEME_EXTRACTION` - Extracts themes from conversation
16. `GLOBAL_MEMORY_CONSOLIDATION` - Consolidates global memories (Prisma schema only)

**Activity Status:** `PENDING | COMPLETED | FAILED`

**Activity Type:** `LLM_CALL | EMBEDDING | RETRIEVAL | TOOL_USE`

### Sonnet vs Haiku Classification
```typescript
// Sonnet (warm accent) = 4 user-facing calls
const SONNET_CALL_TYPES = [
  'ORCHESTRATED_RESPONSE',     // Main response to user
  'RECONCILER_ANALYSIS',       // Empathy partner reconciliation
  'NEEDS_EXTRACTION',          // Identify user needs
  'WITNESSING_RESPONSE'        // Witness/empathy response
];

// Haiku (cool accent) = 12 supporting calls
// All others are supporting/analysis calls
```

### BrainActivity Model (Prisma)
```prisma
model BrainActivity {
  id: String @id @default(cuid())
  sessionId: String
  turnId?: String                           // Groups activities into turns
  activityType: ActivityType                // LLM_CALL, EMBEDDING, RETRIEVAL, TOOL_USE
  model: String                             // Model identifier (e.g., "claude-3-5-sonnet")
  input: Json?                              // Prompt, query, etc.
  output: Json?                             // Response, retrieved items, etc.
  metadata: Json?                           // Reasoning, confidence, errors
  callType: BrainActivityCallType?          // Specific call type for dashboard
  structuredOutput: Json?                   // Typed output for display components
  tokenCountInput: Int
  tokenCountOutput: Int
  cost: Float
  durationMs: Int
  status: ActivityStatus                    // PENDING, COMPLETED, FAILED
  createdAt: DateTime
  completedAt?: DateTime
  // Indices: sessionId, turnId, activityType, createdAt
}
```

### Session Types
```typescript
interface Session {
  id: string;
  type: 'PARTNER' | 'INNER_WORK';
  status: SessionStatus;
  relationship?: Relationship;              // PARTNER sessions
  user?: User;                              // INNER_WORK sessions
  stats?: {
    totalCost: number;
    totalTokens: number;
    activityCount: number;
    turnCount: number;
  };
}

interface SessionStatus =
  | 'CREATED' | 'INVITED' | 'ACTIVE' | 'WAITING' | 'PAUSED'
  | 'ABANDONED' | 'RESOLVED' | 'COMPLETED' | 'ARCHIVED';
```

---

## Part 3: Data Flow Architecture

### 1. Session List View (`/`)

**Component:** `SessionBrowser` (tools/status-dashboard/src/components/browser/SessionBrowser.tsx)

**Data Flow:**
```
SessionBrowser
└── useSessions()
    ├── Fetch: GET /api/brain/sessions?cursor=...&limit=20
    ├── Ably Subscribe: 'session-created' event
    └── Emit: onSessionCreated callback

Result: {
  sessions: Session[],
  nextCursor?: string,
  connectionStatus: 'connecting'|'connected'|'error'|'disconnected'
}
```

**Pagination:** Cursor-based using `updatedAt` timestamp (ISO format)

**Real-time Updates:**
- Ably channel: `ai-audit-stream`
- Event: `session-created`
- Action: Refetch first page to show new session

---

### 2. Session Detail View (`/session/:sessionId`)

**Component:** `SessionDetail` (tools/status-dashboard/src/components/session/SessionDetail.tsx)

**Data Flow - Initial Load:**
```
SessionDetail
└── useSessionActivity(sessionId)
    ├── 1. Fetch: GET /api/brain/activity/:sessionId
    │   Returns: {
    │     activities: BrainActivity[],
    │     messages: Message[],          // USER-role messages
    │     notableFacts: [],
    │     summary: { totalCost, totalTokens, count }
    │   }
    ├── 2. Fetch: GET /api/brain/sessions (filtered) to get session data
    ├── 3. Process Activities:
    │   ├── groupActivitiesIntoTurns()  - Group by turnId
    │   ├── matchMessagesToTurns()      - Match messages by timestamp
    │   └── splitTurnsByUser()          - Initiator vs Invitee columns
    ├── 4. Ably Subscribe:
    │   ├── 'brain-activity' event → handleBrainActivity()
    │   │   - Updates activity state
    │   │   - Recalculates summary
    │   └── 'new-message' event → handleNewMessage()
    │       - Only adds USER-role messages
    └── Result: {
        activities, messages, summary,
        users: { initiator, invitee },
        turns: Turn[],
        initiatorTurns, inviteeTurns,
        hasTwoUsers: boolean
    }
```

**Turn Grouping Logic** (tools/status-dashboard/src/utils/turnGrouping.ts:21-69):
- Groups activities by `activity.turnId`
- Fallback: Groups by `activity.metadata.turnId` or timestamp (minute-based)
- Unassigned activities → orphan turns grouped by timestamp
- Tries to extract userId from metadata or turnId pattern matching

**Turn-Message Matching** (tools/status-dashboard/src/utils/turnGrouping.ts:74-130):
- Two passes: First match "Real" turns (with valid IDs), then orphan turns
- Matches messages within 30-second window of turn timestamp
- Selects closest message by timestamp

**Display Layout:**
- **Partner Sessions:** `SplitView` component (two columns: initiator + invitee)
- **Inner Work Sessions:** Single column with all turns

---

### 3. Session Context Page (`/session/:sessionId/context`)

**Component:** `ContextPage` (tools/status-dashboard/src/components/context/ContextPage.tsx)

**Data Flow:**
```
ContextPage
└── useContextBundle(sessionId)
    ├── Fetch: GET /api/brain/sessions/:sessionId/context
    │   Returns ContextResponse: {
    │     sessionId,
    │     sessionType: 'partner' | 'inner_thoughts',
    │     assembledAt: ISO timestamp,
    │     users: ContextUserData[]  // One per session user
    │   }
    │
    │   Each ContextUserData: {
    │     userId, userName,
    │     context: ContextBundle {
    │       conversationContext: { recentTurns[], turnCount, sessionDurationMinutes },
    │       emotionalThread: { initialIntensity, currentIntensity, trend, notableShifts[] },
    │       priorThemes?: { themes[], lastSessionDate, sessionCount },
    │       globalFacts?: { category, fact }[],
    │       sessionSummary?: { keyThemes[], emotionalJourney, currentFocus, userStatedGoals[] },
    │       innerThoughtsContext?: { relevantReflections[], hasLinkedSession },
    │       userMemories?: { global[], session[] },
    │       notableFacts?: { category, fact }[],
    │       stageContext: { stage, gatesSatisfied },
    │       userName, partnerName,
    │       intent: { intent, depth, reason, threshold, ... },
    │       assembledAt
    │     }
    │   }
    │
    ├── Ably Subscribe: session-specific channel `meetwithoutfear:session:${sessionId}`
    │   Event: 'context.updated' → handleContextUpdated()
    │   Action: Refetch context data
    │
    └── Display:
        ├── Partner sessions: ContextColumn side-by-side
        └── Inner work: Single ContextColumn
```

**Backend Context Assembly** (backend/src/routes/brain.ts:92-255):
- For partner sessions:
  1. Find session + relationship members
  2. For each user:
     - Get latest stage progress
     - Get emotional intensity from latest `emotionalReading`
     - Determine memory intent (complex logic in `determineMemoryIntent`)
     - Call `assembleContextBundle()` service
     - Map to ContextUserData
- For inner work sessions:
  - Return minimal/placeholder context (different flow, not fully assembled)

---

### 4. Real-Time Updates (Ably Events)

**Ably Configuration:**
```typescript
// Channel: 'ai-audit-stream' (broadcast channel)
// Events:
// - 'session-created' → payload: undefined
// - 'brain-activity' → payload: BrainActivity object
// - 'new-message' → payload: Message object

// Session-specific channel: 'meetwithoutfear:session:${sessionId}'
// Events:
// - 'context.updated' → payload: { sessionId, userId, assembledAt }
```

**Broadcasting From Backend** (backend/src/services/brain-service.ts:134-170):
- Only if `ENABLE_AUDIT_STREAM=true`
- When activity created/updated/failed → broadcast 'brain-activity' event
- When message created → broadcast 'new-message' event

---

## Part 4: Component Responsibilities

### Top-Level Components

| Component | File | Responsibility |
|-----------|------|-----------------|
| `App` | App.tsx | Main router, nav bar with "Neural Monitor" title and "Sessions" link |
| `SessionBrowser` | components/browser/SessionBrowser.tsx | Container for session list view |
| `SessionDetail` | components/session/SessionDetail.tsx | Container for session detail (activity timeline) |
| `ContextPage` | components/context/ContextPage.tsx | Container for context bundle page |

### Session Browser Components

| Component | File | Responsibility |
|-----------|------|-----------------|
| `SessionBrowserHeader` | components/browser/SessionBrowserHeader.tsx | Shows connection status, refresh button |
| `SessionList` | components/browser/SessionList.tsx | Infinite-scroll list container with loading state |
| `SessionItem` | components/browser/SessionItem.tsx | Single session card (title, type, participants, stats) |

### Session Detail Components

| Component | File | Responsibility |
|-----------|------|-----------------|
| `SessionDetailHeader` | components/session/SessionDetailHeader.tsx | Title, total cost, token count, "View Context" link |
| `SplitView` | components/session/SplitView.tsx | Two-column layout for partner sessions |
| `TurnView` | components/session/TurnView.tsx | Single turn container (user message + activities) |
| `ActivityItem` | components/session/ActivityItem.tsx | Dispatches to EventRenderer (if callType) or LegacyActivityItem |
| `DetailBlock` | components/session/DetailBlock.tsx | Expandable JSON viewer for raw data |
| `FormattedPrice` | components/session/FormattedPrice.tsx | $X.YY formatted price with styled decimals |
| `SmartDataViewer` | components/session/SmartDataViewer.tsx | Generic data viewer (not heavily used) |

### Event Display Components (16 Specialized + 1 Generic)

**Each event component is responsible for:**
- Extracting relevant `structuredOutput` data
- Rendering domain-specific visualizations
- Wrapping with `BaseEventWrapper` for consistent header/footer

| Event Type | Component | Display Style |
|-----------|-----------|---|
| ORCHESTRATED_RESPONSE | OrchestratedResponseEvent | User-facing response + optional thinking block (warm accent) |
| RETRIEVAL_PLANNING | RetrievalPlanningEvent | Whether retrieval is needed, query count |
| INTENT_DETECTION | IntentDetectionEvent | Detected intent flags, confidence |
| BACKGROUND_CLASSIFICATION | BackgroundClassificationEvent | Emotional background categories with chips |
| PARTNER_SESSION_CLASSIFICATION | PartnerSessionClassificationEvent | Session category, memory detection status |
| CHAT_ROUTER_RESPONSE | ChatRouterResponseEvent | Routing decision, selected handler |
| REFERENCE_DETECTION | ReferenceDetectionEvent | Detected references (people, events, etc.) |
| PEOPLE_EXTRACTION | PeopleExtractionEvent | Extracted person objects with relationships |
| MEMORY_VALIDATION | MemoryValidationEvent | Validation status, relevance scores |
| RECONCILER_ANALYSIS | ReconcilerAnalysisEvent | Conflicts found, proposed resolutions |
| SUMMARIZATION | SummarizationEvent | Summary content, key points |
| NEEDS_EXTRACTION | NeedsExtractionEvent | Identified needs with categories |
| WITNESSING_RESPONSE | WitnessingResponseEvent | Witness statement, empathy markers (warm accent) |
| MEMORY_FORMATTING | MemoryFormattingEvent | Formatted memory, category tags |
| THEME_EXTRACTION | ThemeExtractionEvent | Extracted themes, intensity levels |
| GenericActivityEvent | GenericActivityEvent | Fallback: raw activity preview (used for unknown/deprecated types) |

**All event components use `BaseEventWrapper`:**
- Header: Title, icon, model name, duration, cost, status
- Body: Typed content from subcomponent + raw data blocks (optional)
- Footer: Token counts, status indicator

---

### Context Page Components

| Component | File | Responsibility |
|-----------|------|---|
| `ContextColumn` | components/context/ContextColumn.tsx | Container for one user's context (used side-by-side) |
| `RecentMessagesSection` | components/context/RecentMessagesSection.tsx | Recent turns in conversation |
| `NotableFactsSection` | components/context/NotableFactsSection.tsx | Session-specific facts by category |
| `EmotionalThreadSection` | components/context/EmotionalThreadSection.tsx | Emotional arc visualization |
| `SessionSummarySection` | components/context/SessionSummarySection.tsx | Key themes, journey, current focus |
| `UserMemoriesSection` | components/context/UserMemoriesSection.tsx | Global + session memories |
| `InnerThoughtsSection` | components/context/InnerThoughtsSection.tsx | Linked session reflections |
| `PriorThemesSection` | components/context/PriorThemesSection.tsx | Themes from previous sessions |
| `GlobalFactsSection` | components/context/GlobalFactsSection.tsx | Cross-session facts |

---

## Part 5: Cost & Token Display Patterns

### Cost Display
**File:** tools/status-dashboard/src/components/session/FormattedPrice.tsx (17 lines)

```typescript
export function FormattedPrice({ value }: FormattedPriceProps) {
  const { intPart, primaryDec, secondaryDec, full } = formatPrice(value);
  return (
    <span className="price-component" title={full}>
      ${intPart}.{primaryDec}
      <span style={{ color: '#888' }}>{secondaryDec}</span>
    </span>
  );
}
```

**Formatter:** tools/status-dashboard/src/utils/formatters.ts:25-41

```typescript
export function formatPrice(value?: number): {
  intPart: string;
  primaryDec: string;
  secondaryDec: string;
  full: string;
} {
  if (value === undefined || value === null) {
    return { intPart: '0', primaryDec: '00', secondaryDec: '', full: '$0.00' };
  }

  const str = value.toFixed(5);
  const [intPart, decPart] = str.split('.');
  const primaryDec = decPart ? decPart.substring(0, 2) : '00';      // Bold 2 decimals
  const secondaryDec = decPart ? decPart.substring(2) : '';        // Gray 3 more decimals

  return {
    intPart,
    primaryDec,
    secondaryDec,
    full: `$${str}`,
  };
}
```

**Display Locations:**
1. `SessionDetailHeader` - Total session cost (tools/status-dashboard/src/components/session/SessionDetailHeader.tsx:31)
   ```
   Total Cost: $0.00XXX (token count)
   ```

2. `BaseEventWrapper` - Individual activity cost (tools/status-dashboard/src/components/events/BaseEventWrapper.tsx:66-70)
   ```
   Right side of activity header: $0.00XXX
   ```

3. `SessionItem` (session browser list) - Session total cost

**Pattern:** Primary decimal (hundredths) in bold, secondary decimal (thousandths) in gray

### Token Display
**Locations:**
1. `SessionDetailHeader` - Total tokens (formatted with commas)
   ```typescript
   ({summary?.totalTokens?.toLocaleString()} tokens)
   ```

2. `BaseEventWrapper` - Per-activity tokens
   ```typescript
   Tokens In: {activity.tokenCountInput}
   Tokens Out: {activity.tokenCountOutput}
   ```

**Summary Calculation** (tools/status-dashboard/src/hooks/useSessionActivity.ts:77-83):
```typescript
setSummary(prev => ({
  totalCost: (prev?.totalCost || 0) + activity.cost,
  totalTokens: (prev?.totalTokens || 0) + activity.tokenCountInput + activity.tokenCountOutput,
}));
```

---

## Part 6: Current Views & Pages

### View 1: Session Browser (`/`)
**Purpose:** Overview of all sessions with pagination

**Features:**
- ✅ Session list with infinite scroll (cursor-based pagination)
- ✅ Session cards showing:
  - Type (PARTNER or INNER_WORK)
  - Participants (PARTNER) or title (INNER_WORK)
  - Created/Updated timestamps
  - Stats: total cost, tokens, activity count, turn count
- ✅ Real-time connection status indicator (● Live / ○ Offline)
- ✅ Ably integration for session-created events

**Limitations:**
- No filtering by session type, status, cost, or date range
- No search capability
- Cards don't show session status (ACTIVE, COMPLETED, etc.)
- No way to bulk export session data

---

### View 2: Session Detail (`/session/:sessionId`)

**Purpose:** Browse all AI activities (brain events) for a single session

**Features:**
- ✅ Header shows total cost, total tokens, session type, connection status
- ✅ "View Context" link to context page
- ✅ **Partner sessions:** Split view (two columns, one per user)
  - Activities grouped into turns
  - Turns split by initiator/invitee via userId matching
- ✅ **Inner work sessions:** Single column view
- ✅ Activities organized by turn with timestamps
- ✅ Real-time activity streaming (new activities appear immediately)

**Activity Display:**
- Each activity shows:
  - Icon (🤖 LLM, 🧠 Embedding, 🔍 Retrieval, 🛠️ Tool)
  - Operation name (pretty-formatted)
  - Preview text (first 100 chars of response/detection)
  - Model name (Haiku/Sonnet/Opus/Titan)
  - Duration (ms or seconds)
  - Cost ($X.YY with hidden decimals)
  - Status (✓ COMPLETED, ✕ FAILED, ↻ PENDING)
- Expand to show:
  - **For typed events:** Domain-specific visualization (response text, detected conflicts, etc.)
  - **For legacy events:** Raw JSON input/output/metadata blocks
  - **All activities:** Token counts (input + output)

**Typed Event Rendering (EventRenderer):**
- 16 call types → specialized components
- Generic fallback for unknown types
- Sonnet calls get warm accent (user-facing), Haiku get cool accent (supporting)

**Limitations:**
- No filtering/search within session
- No way to jump to specific turn
- No comparison of partner responses side-by-side
- No export of activity data
- Backward compatibility: activities without `callType` use legacy rendering

---

### View 3: Context Bundle Page (`/session/:sessionId/context`)

**Purpose:** Display assembled AI context (what data the AI receives before responding)

**Features:**
- ✅ Header shows:
  - Session type (partner / inner_thoughts)
  - Assembled timestamp
  - Connection status
  - Refresh button
- ✅ **Partner sessions:** Side-by-side columns (one per user)
- ✅ **Inner work sessions:** Single column
- ✅ For each user, displays 8 context sections:
  1. **Recent Messages** - Recent conversation turns
  2. **Notable Facts** - Session-specific facts by category
  3. **Emotional Thread** - Emotional arc (initial/current intensity, trend, shifts)
  4. **Session Summary** - Key themes, journey, focus, stated goals
  5. **User Memories** - Global memories + session memories (by category)
  6. **Inner Thoughts** - Linked session reflections (cross-session continuity)
  7. **Prior Themes** - Themes from previous sessions
  8. **Global Facts** - Cross-session facts by category
- ✅ Stage badge shows current stage (0-4)
- ✅ Memory intent badge shows intent (emotional_validation, stage_enforcement, etc.)
- ✅ Real-time updates: listens for `context.updated` events

**Context Data Source:**
- Backend assembles on-demand using `assembleContextBundle()` service
- Pulls from: stage progress, messages, UserVessel, emotional readings, memories, etc.

**Limitations:**
- Inner work sessions return minimal/placeholder context
- No way to compare context between two session timepoints
- No visualization of memory intent decision logic
- Can't see which context items were actually used by AI

---

## Part 7: What Works Well vs. What's Broken/Missing

### ✅ What Works Well

1. **Component Modularity**
   - Each event type has dedicated component
   - BaseEventWrapper provides consistent UI pattern
   - Clear separation between typed and generic rendering

2. **Real-Time Streaming**
   - Ably integration provides live activity updates
   - Activities appear immediately without page refresh
   - Proper subscription cleanup on unmount

3. **Turn Grouping Logic**
   - Activities grouped by turnId with smart fallback
   - Messages matched to turns by timestamp
   - Handles orphan activities gracefully
   - User assignment via metadata + pattern matching

4. **Cost/Token Formatting**
   - Clean visual design with bold vs. gray decimals
   - Per-activity and session-level aggregation
   - Proper rounding and display precision

5. **Type Safety**
   - TypeScript throughout frontend and backend
   - Discriminated unions for activity types
   - No any-type abuse

6. **Session List Pagination**
   - Cursor-based (scalable, can handle large datasets)
   - Loads on scroll
   - Proper deduplication

### ⚠️ Limitations/Issues

1. **Backward Compatibility Burden**
   - `ActivityItem` has dual rendering: typed (EventRenderer) + legacy
   - 1 event type (MEMORY_DETECTION) is deprecated but still mapped to GenericActivityEvent
   - Legacy rendering still used for activities without callType

2. **Turn Matching Fragility**
   - Message-to-turn matching relies on 30-second timestamp window
   - Orphan turn grouping by minute is coarse (could group unrelated activities)
   - No explicit message-turn association in schema (DB level)

3. **Missing Turnid in Activities**
   - Many activities may not have `activity.turnId` set
   - Falls back to metadata lookup and timestamp-based grouping
   - Makes turn grouping unreliable without good data

4. **Inner Work Sessions Under-Supported**
   - Context page returns placeholder context (not fully assembled)
   - Single-column view only (no split, but that's OK for single user)
   - Different message table (InnerWorkMessage vs. Message)

5. **No Session Filtering/Search**
   - Can't filter sessions by status, type, cost, date
   - Can't search for specific users or session titles
   - Must scroll through list to find target session

6. **No Activity Search/Filter Within Session**
   - Can't filter by activity type, call type, cost, duration
   - Can't search activity content
   - Can't jump to specific turn

7. **Cost/Token Display Incomplete**
   - Total cost aggregation works
   - But no breakdown by call type (e.g., how much was Sonnet vs Haiku?)
   - No way to see cost trends (most expensive activities, slowest operations)

8. **Context Visualization Limited**
   - No visual diff between two users' context
   - No timeline of how context evolves over conversation
   - No way to see which memories were retrieved vs. which weren't
   - Memory intent decision logic not visible

9. **Ably Connection Status Not Recovered**
   - If Ably disconnects, reconnection is not automatic in some cases
   - No retry logic visible
   - User sees "● Live" → "○ Offline" with no way to manually reconnect

10. **No Error Boundaries**
    - If a component crashes, entire view fails
    - No graceful degradation for failed activities
    - No retry mechanism for failed API calls

11. **Mobile Responsiveness**
    - Split view (partner sessions) may not work well on small screens
    - No mobile-optimized layout

12. **Performance Issues**
    - No virtualization for large activity lists (could lag with 1000+ activities)
    - No pagination for context data (all context loaded at once)
    - All activities loaded into memory (no lazy loading)

---

## Part 8: Backend API Endpoints

### Endpoint 1: Get Session Activities
**Route:** `GET /api/brain/activity/:sessionId`
**File:** backend/src/routes/brain.ts:28-87

**Response:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "cuid",
        "sessionId": "...",
        "turnId": "...",
        "activityType": "LLM_CALL",
        "model": "claude-3-5-sonnet",
        "input": { ... },
        "output": { ... },
        "metadata": { ... },
        "callType": "ORCHESTRATED_RESPONSE",
        "structuredOutput": { ... },
        "tokenCountInput": 1000,
        "tokenCountOutput": 500,
        "cost": 0.003,
        "durationMs": 2500,
        "status": "COMPLETED",
        "createdAt": "2026-02-22T10:30:00Z",
        "completedAt": "2026-02-22T10:30:02.5Z"
      }
    ],
    "messages": [
      {
        "id": "msg-123",
        "content": "User message text",
        "timestamp": "2026-02-22T10:30:00Z",
        "senderId": "user-id"
      }
    ],
    "notableFacts": [ ... ],
    "summary": {
      "totalCost": 0.042,
      "totalTokens": 15000,
      "count": 42
    }
  }
}
```

**Data Fetching Logic:**
1. All activities for session ordered by createdAt ASC
2. USER-role messages (partner sessions) OR InnerWorkMessage (inner work)
3. Notable facts from all UserVessel records
4. Calculate totals

---

### Endpoint 2: Get Session Context Bundle
**Route:** `GET /api/brain/sessions/:sessionId/context`
**File:** backend/src/routes/brain.ts:92-255

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "sessionType": "partner",
    "assembledAt": "2026-02-22T10:45:00Z",
    "users": [
      {
        "userId": "user-1",
        "userName": "Alice",
        "context": {
          "conversationContext": {
            "recentTurns": [
              { "role": "user", "content": "...", "timestamp": "..." },
              { "role": "assistant", "content": "...", "timestamp": "..." }
            ],
            "turnCount": 5,
            "sessionDurationMinutes": 15
          },
          "emotionalThread": {
            "initialIntensity": 7,
            "currentIntensity": 5,
            "trend": "de-escalating",
            "notableShifts": [
              { "turn": 2, "from": 7, "to": 6, "triggerSummary": "..." }
            ]
          },
          "priorThemes": {
            "themes": ["conflict", "communication"],
            "lastSessionDate": "2026-02-15T...",
            "sessionCount": 3
          },
          "globalFacts": [
            { "category": "relationships", "fact": "..." }
          ],
          "sessionSummary": {
            "keyThemes": ["trust", "listening"],
            "emotionalJourney": "...",
            "currentFocus": "...",
            "userStatedGoals": ["improve communication"]
          },
          "innerThoughtsContext": {
            "relevantReflections": [
              { "content": "...", "similarity": 0.92, "isFromLinkedSession": true }
            ],
            "hasLinkedSession": true
          },
          "userMemories": {
            "global": [
              { "content": "...", "category": "about-user" }
            ],
            "session": [
              { "content": "...", "category": "session-specific" }
            ]
          },
          "notableFacts": [
            { "category": "relationships", "fact": "..." }
          ],
          "stageContext": {
            "stage": 2,
            "gatesSatisfied": { "understood": true, "ready": true }
          },
          "userName": "Alice",
          "partnerName": "Bob",
          "intent": {
            "intent": "emotional_validation",
            "depth": "full",
            "reason": "User is at stage 2 with high emotional intensity",
            "threshold": 0.7,
            "maxCrossSession": 3,
            "allowCrossSession": true,
            "surfaceStyle": "explicit"
          },
          "assembledAt": "2026-02-22T10:45:00Z"
        }
      }
    ]
  }
}
```

**Assembly Process (for each user):**
1. Find their latest stage progress
2. Get emotional intensity from latest EmotionalReading
3. Call `determineMemoryIntent()` (complex logic)
4. Call `assembleContextBundle()` service (fetches & arranges all context data)
5. Return ContextUserData

---

### Endpoint 3: Get Sessions List
**Route:** `GET /api/brain/sessions?cursor=...&limit=20`
**File:** backend/src/routes/brain.ts:258-411

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "sess-123",
        "type": "PARTNER",
        "status": "ACTIVE",
        "createdAt": "2026-02-20T...",
        "updatedAt": "2026-02-22T...",
        "relationship": {
          "id": "rel-123",
          "members": [
            {
              "id": "mem-1",
              "userId": "user-1",
              "user": { "id": "user-1", "name": "Alice", "email": "..." },
              "role": "initiator",
              "nickname": null,
              "createdAt": "..."
            },
            {
              "id": "mem-2",
              "userId": "user-2",
              "user": { "id": "user-2", "name": "Bob", "email": "..." },
              "role": "invitee",
              "nickname": null,
              "createdAt": "..."
            }
          ]
        },
        "title": null,
        "stats": {
          "totalCost": 0.042,
          "totalTokens": 15000,
          "activityCount": 42,
          "turnCount": 10
        }
      },
      {
        "id": "iw-sess-456",
        "type": "INNER_WORK",
        "status": "COMPLETED",
        "createdAt": "2026-02-21T...",
        "updatedAt": "2026-02-22T...",
        "relationship": null,
        "title": "Reflection on boundaries",
        "user": { "id": "user-3", "name": "Carol", "email": "..." },
        "stats": {
          "totalCost": 0.008,
          "totalTokens": 3000,
          "activityCount": 12,
          "turnCount": 3
        }
      }
    ],
    "nextCursor": "2026-02-22T09:00:00Z"
  }
}
```

**Pagination Logic:**
1. Fetch partner sessions with limit+1 (detect next page)
2. Fetch inner work sessions with limit+1
3. Fetch stats via groupBy for all sessions (single batch query)
4. Merge, sort by updatedAt DESC
5. If > limit items, take top limit and set nextCursor to last item's updatedAt

**Two-Source Complexity:**
- Partner and inner work sessions are in different tables
- Fetches limit+1 from EACH source (could end up with 2*limit before sorting)
- nextCursor is based on combined sort, not per-source pagination

---

## Part 9: Ably Channel Structure

### Broadcast Channel: `ai-audit-stream`
**Purpose:** Stream all new sessions and activities to subscribed clients

**Events:**
| Event | Payload | Source | When |
|-------|---------|--------|------|
| `session-created` | (none/undefined) | BrainService (unclear) | New session created |
| `brain-activity` | BrainActivity object | BrainService.broadcastUpdate() | Activity created/completed/failed |
| `new-message` | Message object (filtered) | BrainService.broadcastMessage() | USER-role message created |

**Payload Details (brain-activity):**
```typescript
{
  id: string;
  sessionId: string;
  turnId?: string;
  activityType: ActivityType;
  model: string;
  input: any;
  output: any;
  metadata: any;
  callType?: BrainActivityCallType;
  structuredOutput?: any;
  tokenCountInput: number;
  tokenCountOutput: number;
  cost: number;
  durationMs: number;
  status: ActivityStatus;
  createdAt: string;
  completedAt?: string;
}
```

**Payload Details (new-message):**
```typescript
{
  id: string;
  sessionId: string;
  senderId: string;
  role: string;             // Usually 'USER'
  content: string;
  stage?: number;
  timestamp: string;
}
```

---

### Session-Specific Channel: `meetwithoutfear:session:${sessionId}`
**Purpose:** Notify subscribed clients when context is assembled for a session

**Events:**
| Event | Payload | Source | When |
|-------|---------|--------|------|
| `context.updated` | { sessionId, userId?, assembledAt } | Context assembler? | Context reassembled (after stage advance, etc.) |

**Frontend Subscription** (tools/status-dashboard/src/hooks/useAblyConnection.ts:81-90):
```typescript
if (options.sessionId) {
  const sessionChannelName = `meetwithoutfear:session:${options.sessionId}`;
  const sessionChannel = client.channels.get(sessionChannelName);
  sessionChannelRef.current = sessionChannel;

  sessionChannel.subscribe('context.updated', (msg) => {
    callbacksRef.current.onContextUpdated?.(msg.data);
  });
}
```

---

## Part 10: Type Definitions & Schemas

### Prisma Models (Relevant Excerpts)

**BrainActivity Model:**
```prisma
model BrainActivity {
  id              String           @id @default(cuid())
  sessionId       String
  turnId          String?
  activityType    ActivityType
  model           String
  input           Json?
  output          Json?
  metadata        Json?
  callType        BrainActivityCallType?
  structuredOutput Json?
  tokenCountInput Int              @default(0)
  tokenCountOutput Int              @default(0)
  cost            Float            @default(0.0)
  durationMs      Int              @default(0)
  status          ActivityStatus   @default(PENDING)
  createdAt       DateTime         @default(now())
  completedAt     DateTime?

  @@index([sessionId])
  @@index([turnId])
  @@index([activityType])
  @@index([createdAt])
}

enum BrainActivityCallType {
  ORCHESTRATED_RESPONSE
  RETRIEVAL_PLANNING
  INTENT_DETECTION
  BACKGROUND_CLASSIFICATION
  PARTNER_SESSION_CLASSIFICATION
  CHAT_ROUTER_RESPONSE
  REFERENCE_DETECTION
  PEOPLE_EXTRACTION
  MEMORY_DETECTION
  MEMORY_VALIDATION
  RECONCILER_ANALYSIS
  SUMMARIZATION
  NEEDS_EXTRACTION
  WITNESSING_RESPONSE
  MEMORY_FORMATTING
  THEME_EXTRACTION
  GLOBAL_MEMORY_CONSOLIDATION
}

enum ActivityType {
  LLM_CALL
  EMBEDDING
  RETRIEVAL
  TOOL_USE
}

enum ActivityStatus {
  PENDING
  COMPLETED
  FAILED
}
```

### Frontend Types

**Session & User Types** (types/session.ts):
```typescript
type SessionStatus = 'CREATED' | 'INVITED' | 'ACTIVE' | 'WAITING' | 'PAUSED' | 'ABANDONED' | 'RESOLVED' | 'COMPLETED' | 'ARCHIVED';

interface User {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
}

interface RelationshipMember {
  id: string;
  userId: string;
  user: User;
  role: string;
  nickname?: string | null;
  createdAt?: string;
}

interface Relationship {
  id: string;
  members: RelationshipMember[];
}

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  type: string; // 'PARTNER' | 'INNER_WORK'
  relationship?: Relationship;
  title?: string | null;
  user?: User;
  stats?: SessionStats;
}
```

**Context Types** (types/context.ts):
- ContextBundle (main type with all context sections)
- EmotionalThread (with intensity tracking)
- SessionSummaryContext
- PriorThemes
- InnerThoughtsContext
- UserMemoriesContext
- MemoryIntentResult
- etc.

**Activity Types** (types/activity.ts):
- BrainActivity (frontend mirror of Prisma model)
- ActivityType
- ActivityStatus
- BrainActivityCallType
- Sonnet vs Haiku classification

---

## Part 11: Unused Features & Stubs

### 1. MEMORY_DETECTION Call Type
**Status:** Deprecated
**File:** tools/status-dashboard/src/components/events/EventRenderer.tsx:43

```typescript
MEMORY_DETECTION: GenericActivityEvent, // Deprecated - memory detection removed
```

**Issue:** Still defined in Prisma schema and activity types, but dashboard maps it to generic fallback.

---

### 2. InnerWorkMessage Table Support
**Status:** Partially implemented
**File:** backend/src/routes/brain.ts:45-56

```typescript
// If no messages found, it might be an Inner Work session
if (messages.length === 0) {
  const innerMessages = await prisma.innerWorkMessage.findMany({
    where: { sessionId, role: 'USER' },
    ...
  });
}
```

**Issue:** Inner work sessions use different message table, but frontend doesn't distinguish them after fetch.

---

### 3. Placeholder Context for Inner Work
**Status:** Unfinished
**File:** backend/src/routes/brain.ts:212-241

```typescript
// For inner work sessions, create a minimal context bundle
// This could be enhanced later if needed
context: {
  conversationContext: { ... },
  emotionalThread: { ... },
  stageContext: { stage: 0, gatesSatisfied: {} },
  userName: innerWorkSession.user.name || 'Unknown',
  intent: { ... },
  assembledAt: new Date().toISOString(),
},
```

**Issue:** Inner work context is hardcoded placeholder, not fully assembled like partner sessions.

---

### 4. SmartDataViewer Component
**Status:** Defined but unused
**File:** tools/status-dashboard/src/components/session/SmartDataViewer.tsx

**Issue:** Not imported or used anywhere in codebase (grep shows no references).

---

### 5. Session Context Stage 0 Default
**Status:** Bug/Limitation
**File:** backend/src/routes/brain.ts:227

```typescript
stageContext: {
  stage: 0,  // Always 0 for inner work
  gatesSatisfied: {},
},
```

**Issue:** Inner work sessions always report stage 0, even if they have stage progress.

---

### 6. Notable Facts in Activity Response
**Status:** Fetched but not used
**File:** backend/src/routes/brain.ts:59-66

```typescript
// Fetch notable facts from UserVessel for this session
const userVessels = await prisma.userVessel.findMany({
  where: { sessionId },
  select: { userId: true, notableFacts: true }
});

const notableFacts = userVessels.flatMap(v => v.notableFacts);
```

**Issue:** Endpoint returns `notableFacts` but frontend `ActivityResponse` type includes it as unused field.

---

### 7. GLOBAL_MEMORY_CONSOLIDATION Call Type
**Status:** Enum defined but no display component
**File:** backend/prisma/schema.prisma

```prisma
enum BrainActivityCallType {
  ...
  GLOBAL_MEMORY_CONSOLIDATION  // Defined in schema, not in types/activity.ts
}
```

**Issue:** Defined in Prisma but not in activity types, would fall back to generic.

---

## Part 12: Brain Service Architecture

### BrainService Class (backend/src/services/brain-service.ts)

**Purpose:** Lifecycle management of brain activities + Ably broadcasting

**Methods:**

1. **startActivity(params: ActivityInput): Promise<BrainActivity>**
   - Creates PENDING record in database
   - Broadcasts via Ably immediately
   - Called at start of LLM call, embedding, retrieval, etc.

2. **completeActivity(activityId: string, result: {...}): Promise<BrainActivity | null>**
   - Updates record: PENDING → COMPLETED
   - Fills in output, token counts, cost, duration
   - Sets completedAt timestamp
   - Broadcasts updated activity
   - Called after LLM response received, embedding calculated, etc.

3. **failActivity(activityId: string, error: any): Promise<BrainActivity | null>**
   - Updates record: PENDING → FAILED
   - Stores error in metadata
   - Sets completedAt timestamp
   - Broadcasts failed activity

4. **broadcastUpdate(activity: BrainActivity): void** (private)
   - Only if `ENABLE_AUDIT_STREAM=true`
   - Publishes 'brain-activity' event to Ably `ai-audit-stream` channel
   - Suppresses errors (logs as warnings)

5. **broadcastMessage(message: any): void** (public)
   - Only if `ENABLE_AUDIT_STREAM=true`
   - Normalizes message payload (id, sessionId, senderId, role, content, stage, timestamp)
   - Publishes 'new-message' event to Ably `ai-audit-stream` channel
   - Used for USER-role messages only

**Integration Pattern:**
```typescript
// At start of operation
const activity = await brainService.startActivity({
  sessionId, turnId,
  activityType: 'LLM_CALL',
  model: 'claude-3-5-sonnet',
  input: { messages: [...], system: '...' },
  callType: 'ORCHESTRATED_RESPONSE'
});

// ... call API, get response ...

// On completion
await brainService.completeActivity(activity.id, {
  output: response,
  tokenCountInput: usage.input_tokens,
  tokenCountOutput: usage.output_tokens,
  cost: calculateCost(usage),
  durationMs: endTime - startTime,
  structuredOutput: { response: ... },
  metadata: { model, callType, ... }
});
```

---

## Part 13: Key Files Summary

| File | LOC | Purpose |
|------|-----|---------|
| tools/status-dashboard/src/App.tsx | 31 | Main router |
| tools/status-dashboard/src/components/browser/SessionBrowser.tsx | 28 | Session list container |
| tools/status-dashboard/src/components/session/SessionDetail.tsx | 54 | Session detail container |
| tools/status-dashboard/src/components/session/ActivityItem.tsx | 88 | Activity dispatcher (typed → EventRenderer or legacy) |
| tools/status-dashboard/src/components/events/EventRenderer.tsx | 86 | Maps call type to component + accent color |
| tools/status-dashboard/src/components/events/BaseEventWrapper.tsx | 106 | Shared event header/body/footer |
| tools/status-dashboard/src/components/context/ContextPage.tsx | 84 | Context page container |
| tools/status-dashboard/src/components/context/ContextColumn.tsx | 56 | Single user's context display |
| tools/status-dashboard/src/hooks/useSessionActivity.ts | 174 | Fetches activities, real-time updates, turn grouping |
| tools/status-dashboard/src/hooks/useSessions.ts | 92 | Fetches session list with pagination |
| tools/status-dashboard/src/hooks/useAblyConnection.ts | 126 | Ably connection management |
| tools/status-dashboard/src/hooks/useContextBundle.ts | 63 | Fetches context, listens for updates |
| tools/status-dashboard/src/utils/turnGrouping.ts | 154 | Groups activities by turn, matches messages |
| tools/status-dashboard/src/utils/activityDisplay.ts | 271 | Activity preview/icon extraction |
| tools/status-dashboard/src/services/api.ts | 97 | REST API client |
| tools/status-dashboard/src/types/activity.ts | 70 | Activity type definitions + Sonnet/Haiku classification |
| tools/status-dashboard/src/types/session.ts | 47 | Session type definitions |
| tools/status-dashboard/src/types/context.ts | 182 | Context bundle type definitions |
| backend/src/routes/brain.ts | 413 | 3 endpoints: activity, context, sessions |
| backend/src/services/brain-service.ts | 173 | Activity lifecycle + Ably broadcasting |

---

## Part 14: Critical Observations & Data Flow Bottlenecks

### 1. Turn Identification Unreliability
**Problem:** Activities grouped into turns using unreliable methods:
- Primary: `activity.turnId` (if populated)
- Secondary: `activity.metadata.turnId` (fallback)
- Tertiary: Timestamp-based grouping by minute (orphan turns)

**Impact:** Turn boundaries may be incorrect if turnId is not set consistently by backend.

**Solution Needed:** Backend should ensure every activity has explicit turnId set.

---

### 2. Message-Activity Sync
**Problem:** Messages and activities are in different DB tables with loose coupling:
- Message lifecycle separate from activity tracking
- Matching done by timestamp (±30 seconds)
- No message → activity association in schema

**Impact:** Messages may be matched to wrong turn if timestamps collide; no guarantee of matching.

**Solution Needed:** Backend should emit user messages as part of turn start (via metadata or explicit message-activity link).

---

### 3. Session Context Assembly Latency
**Problem:** Context assembled on-demand per request:
- Fetches from multiple tables (messages, memories, facts, readings, etc.)
- Calls `assembleContextBundle()` per user per request
- Multiple database queries

**Impact:** Context page slow to load, especially for long sessions.

**Solution Needed:** Pre-assemble and cache context, invalidate on specific events.

---

### 4. Ably Event Reliability
**Problem:** No guarantee of event delivery:
- Network drops → missed updates
- Browser refresh → reconnect and catch up (by re-fetch, not replay)
- No event deduplication

**Impact:** Frontend may miss intermediate states if connection drops.

**Solution Needed:** Local caching strategy, cursor-based recovery on reconnect.

---

### 5. Cost Aggregation Accuracy
**Problem:** Session stats calculated via simple sum in activity endpoint:
```typescript
const totalCost = activities.reduce((sum, a) => sum + (a.cost || 0), 0);
```

**Impact:** No rounding/precision handling; floating-point errors possible.

**Solution Needed:** Aggregate costs at database level (using DECIMAL type, not Float).

---

## Part 15: Performance Characteristics

### Load Times (Estimated)

| Operation | Expected Time | Bottleneck |
|-----------|---------------|-----------|
| Load session list (20 items) | 500ms | 2 DB queries (sessions + stats) + network |
| Load session activities (100 items) | 1s | 3 DB queries (activities + messages + facts) |
| Load context (partner, 8 sections) | 2-3s | Per-user context assembly (2 calls in parallel) |
| Stream activity in real-time | <100ms | Ably latency + DOM render |
| Refresh context page | 2-3s | Refetch all data |

### Memory Usage

| Component | Estimate | Issue |
|-----------|----------|-------|
| Session list (1000 sessions) | ~50MB | No virtualization, all in memory |
| Session detail (500 activities) | ~100MB | All activities loaded, no pagination |
| Context page (full bundle) | ~10MB per user | Single load, not streamed |

### N+1 Queries Risk

**Session List Endpoint:**
- ✓ Aggregates stats in single groupBy query (good)
- ✗ But fetches both Partner AND InnerWork tables separately, then sorts (suboptimal)

**Context Assembly:**
- ✗ Per-user context assembly creates multiple queries per user
- ✗ Could be optimized with better batching

---

## Part 16: Security & Data Sensitivity

### Exposed Data

**Activity Endpoint (`/api/brain/activity/:sessionId`):**
- ✅ All input/output/metadata exposed (needed for debugging)
- ⚠️ Contains full user messages and AI responses
- ⚠️ Cost data visible (may be sensitive)
- ⚠️ Token counts visible (inference behavior)

**Context Endpoint (`/api/brain/sessions/:sessionId/context`):**
- ✅ Full context bundles exposed (needed for debugging)
- ⚠️ Contains memories, emotional data, stage progress
- ⚠️ Personal facts and reflections visible
- ⚠️ No redaction or anonymization

**Sessions Endpoint (`/api/brain/sessions`):**
- ✅ Basic session info + aggregated stats
- ⚠️ Relationship members (user names, IDs) exposed
- ⚠️ No filtering by user access level

### Potential Issues

1. **No Access Control Verification**
   - Dashboard assumes authenticated user can see all sessions
   - No per-session authorization checks visible
   - Anyone with access to dashboard can see all user data

2. **Real-Time Data Exposure**
   - Ably broadcasts activities to `ai-audit-stream` (global channel)
   - Assumes only authorized clients subscribe
   - No per-session channel for sensitive activities (activities go to global)

3. **Timestamp Precision**
   - Timestamps expose exact timing of activities
   - Could be used to infer session behavior patterns

---

## Part 17: Testing & Test Data

### Test Infrastructure
- **Backend:** Jest tests in `backend/src/routes/__tests__/`
- **Frontend:** No visible test files (or in .env/.config)
- **E2E:** `backend/src/routes/__tests__/e2e.test.ts` exists but not status-dashboard specific

### Test Coverage (Estimated)
- ✅ Backend routes tested (brain.ts tests visible in listing)
- ⚠️ Frontend components untested (no jest/vitest config visible)
- ⚠️ Integration tests limited

### Database Snapshots
- **Save:** `cd backend && source .env && npx tsx snapshots/create-snapshot.ts`
- **Restore:** `cd backend && source .env && npx tsx snapshots/reset-to-snapshot.ts [file]`

---

## Part 18: Configuration & Environment

### Frontend Environment Variables
```
VITE_ABLY_KEY  // Required for real-time updates
```

### Backend Environment Variables
```
ENABLE_AUDIT_STREAM=true  // Required to broadcast events
DATABASE_URL              // Prisma connection string
```

### Build & Deployment
- **Frontend:** Vite + React, builds to `dist/`
- **Backend:** Express + Prisma, no build (TS directly via tsx/ts-node)
- **Real-time:** Ably (external service)
- **Database:** Prisma ORM (supports PostgreSQL, MySQL, SQLite, etc.)

---

## Part 19: Future Enhancement Opportunities

### High Priority
1. **Add Session Search & Filtering**
   - By session type, status, cost range, date range
   - By participant names
   - Would improve discoverability significantly

2. **Fix Turn-Activity Coupling**
   - Ensure every activity has explicit turnId from backend
   - Add message-activity association at schema level
   - Would improve reliability of turn grouping

3. **Activity Search Within Session**
   - Filter by call type, activity type, cost, duration
   - Search activity content/output
   - Would improve debugging speed

4. **Performance: Virtualization**
   - Add virtual scrolling for large activity lists
   - Add lazy-loading for context data
   - Would enable sessions with 1000+ activities

### Medium Priority
5. **Context Evolution Timeline**
   - Show how context changes as conversation progresses
   - Highlight memories retrieved/added
   - Visual diff between users' context

6. **Cost Analytics**
   - Breakdown by call type (Sonnet vs Haiku)
   - Most expensive activities, slowest operations
   - Cost trends over session lifetime

7. **Error Recovery**
   - Error boundaries for component crashes
   - Retry mechanism for failed API calls
   - Manual Ably reconnect button

8. **Mobile Optimization**
   - Responsive split view
   - Touch-friendly components
   - Optimized for smaller screens

### Nice-to-Have
9. **Activity Export**
   - Export session activities as CSV/JSON
   - Export context bundles for analysis

10. **Dark Mode**
    - Reduce eye strain for long debugging sessions

11. **Activity Bookmarking**
    - Save important activities for review
    - Create notes on specific activities

---

## Part 20: Conclusion & Summary

The Neural Monitor is a well-architected, feature-rich dashboard for visualizing AI processing pipelines and assembled context.

**Strengths:**
- Modular component design with 16+ specialized event viewers
- Real-time updates via Ably
- Comprehensive context visualization
- Type-safe frontend and backend
- Clean separation of concerns

**Weaknesses:**
- Fragile turn grouping (relies on unreliable turnId)
- No session-level search/filter
- Performance limitations for large sessions
- Inner work sessions incomplete
- Backward compatibility burden

**Architecture:**
- React + React Router frontend
- Express + Prisma backend
- Ably for real-time events
- Turn-based grouping of activities
- Per-user context assembly

**Ready for:**
- Inspection/debugging of session behavior
- Real-time monitoring of AI processing
- Context verification & QA
- Cost/token tracking

**Needs Work:**
- Search and filtering
- Performance optimization (virtualization)
- Error handling and recovery
- Mobile responsiveness
- Turn-activity coupling fix

---

**Document End**
**Total Analysis Scope:** 16 call types, 28+ components, 3 API endpoints, Ably integration, Prisma schema, 2 session types, 3 main views
