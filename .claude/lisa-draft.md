# Lisa Draft: Fix the Status Site to be More Helpful

**Feature:** Improve the status dashboard (tools/status-dashboard)
**Started:** 2026-01-18

## Current State Understanding

The status dashboard is a React/Vite app called "Neural Monitor" that:
- Lists sessions from the backend `/api/brain/sessions` endpoint
- Shows session details including brain activity, users, turns
- Displays cost/token summaries
- Uses Ably for real-time updates
- Has split view for two-user sessions (initiator/invitee)

### Current Pages:
1. **Session Browser** (`/`) - Lists all sessions with pagination
2. **Session Detail** (`/session/:sessionId`) - Shows activity for a specific session

### Current Data Displayed:
- Session list with status, type, relationship members
- Brain activity (AI calls) with cost/token info
- Turn-based conversation view
- Real-time connection status

---

## Interview Notes

### Pain Point (2026-01-18)
The current dashboard isn't showing the right information after migrating to tool calls and streaming:
- Need to show the **analysis block** separately (what the AI "thought")
- Need to show the **response text** (what the AI said to the user)
- For **fire-and-forget Haiku calls**, need structured display of results
- **Solution approach**: Type each LLM call based on the prompt/function used, then have type-specific frontend components for proper display

### Core Insight
Each LLM event should have a "type" that determines how it renders. The frontend should have a component per event type.

### LLM Call Types Identified (from codebase analysis)

| Call Type | Model | Purpose | Flow | Fire-and-Forget |
|-----------|-------|---------|------|-----------------|
| Orchestrated Response | Sonnet | Main conversation | Blocking | No |
| Retrieval Planning | Haiku | Query planning | Blocking w/ fallback | No |
| Intent Detection | Haiku | Message classification | Blocking | No |
| Background Classification | Haiku | Inner Thoughts analysis | Background | Yes |
| Partner Session Classification | Haiku | Memory + facts detection | Background | Yes |
| Chat Router Response | Haiku | Fallback template responses | Blocking | No |
| Reference Detection | Haiku | Past content references | Parallel | No |
| People Extraction | Haiku | Entity extraction | Fire-and-forget | Yes |
| Memory Detection | Haiku | Explicit memory requests | Fire-and-forget | Yes |
| Memory Validation | Haiku | Memory appropriateness | Fire-and-forget | Yes |
| Reconciler Analysis | Sonnet | Empathy gap analysis | Blocking | No |
| Summarization | Haiku | Conversation summary | Parallel during context | No |
| Needs Extraction | Sonnet | Psychological needs | Blocking (Stage 3) | No |
| Witnessing Response | Sonnet | Pre-session listening | Blocking | No |
| Memory Formatting | Haiku | Memory presentation | Fire-and-forget | Yes |
| Theme Extraction | Haiku | Topic extraction | Parallel/blocking | No |

#### Key Observations
- **Two-Model Stratification**: Haiku for fast mechanics, Sonnet for empathetic user-facing responses
- **Circuit Breaker Protection**: Haiku calls use `withHaikuCircuitBreaker` (2-second timeout)
- **Fire-and-Forget Pattern**: Background tasks don't block user response
- **Streaming Support**: Main orchestrator uses SSE with analysis blocks

### Display Requirements

**All 16 call types get dedicated display components**

**Visual Distinction (Color Accent System):**
- **Sonnet/user-facing calls**: Warm accent (amber/orange) - these are the ones that become user responses
- **Haiku/background calls**: Cool accent (blue/purple) - these build metadata and don't face users

**Orchestrated Response Display:**
- Analysis block: Collapsed by default, show summary/preview, click to expand
- Response text: Always visible below analysis

**Fire-and-Forget Structured Outputs (Facts, Memories, Themes):**
- Display as compact tags/chips for space-efficient quick scanning

**Event Ordering:**
- Chronological (all types interleaved by timestamp)
- Color coding distinguishes types
- No filtering controls needed

**Real-time Updates:**
- Keep current behavior (append to list, no special animation)

### Backend Changes

**Add `callType` enum field to BrainActivity table:**
- Explicit enum populated at creation time
- Enables cleaner queries and explicit typing
- Migration required

**Add `structuredOutput` jsonb field to BrainActivity table:**
- Store parsed/structured results alongside raw response
- Frontend doesn't need to parse - just render the structured data
- Each call type has a different structure

### Architecture Decisions

**Frontend-only rendering logic:**
- Backend provides `callType` + `structuredOutput`
- Dashboard has dedicated component per call type in `src/components/events/`
- Clean separation of concerns

**Session Browser (list view):**
- Keep current stats (cost/token summary)
- No additional call type breakdown needed

### Scope & Phasing

**Scope:**
- Dashboard only (tools/status-dashboard) - no mobile app changes
- This is a developer/debug tool

**Components:**
- Dedicated component for ALL 16 call types (no generic fallback)
- Consistent and future-proof

**Phasing:**
- Single implementation (one PR covering backend + frontend)

### Naming Convention

**Enum names: SCREAMING_CASE**

```
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
```

