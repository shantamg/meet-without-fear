# Specification: Context Display Page for Neural Monitor

**Created:** 2026-01-18
**Status:** Ready for Implementation

## Overview

Add a dedicated page to the Neural Monitor status dashboard that displays the assembled AI context bundle for any session. This allows developers to see exactly what context is being injected into each prompt - the sliding window of recent messages, notable facts, summaries, emotional state, and all other context components.

Additionally, improve the Haiku classifier by passing Sonnet's analysis and response to it, enabling better fact extraction and summarization.

## Problem Statement

1. **No visibility into context**: The status dashboard shows brain activity events but there's no way to see the actual assembled context being passed to the AI. This context directly affects AI responses, so visibility is critical for debugging.

2. **Disconnected analysis**: Sonnet produces analysis of each conversation turn, but this analysis isn't being passed to the Haiku classifier. The classifier currently extracts facts independently, missing the opportunity to use Sonnet's deeper understanding.

## Scope

### In Scope
- New route `/session/:sessionId/context` accessible from session detail page
- Display full context bundle for all users in the session (side-by-side for partner sessions)
- Real-time updates via new Ably `context-updated` event
- All context bundle components displayed in formatted sections
- New backend API endpoint to assemble context on-demand
- Pass Sonnet analysis and response to Haiku classifier for improved fact extraction

### Out of Scope
- Raw prompt text display (formatContextForPrompt output)
- Editing context from the dashboard
- Historical context snapshots (only current state)
- Filtering or searching within context
- Export functionality

---

## User Stories

### US-1: Backend API Endpoint for Context Assembly
**Description:** As a dashboard user, I want an API endpoint that returns the assembled context bundle for a session so that I can view it on the dashboard.

**Acceptance Criteria:**
- [ ] `GET /api/v1/brain/sessions/:sessionId/context` endpoint exists
- [ ] Returns context bundle for all users in the session (array of `{userId, userName, context}`)
- [ ] API determines current stage from session/stageProgress records automatically
- [ ] Returns 404 if session not found
- [ ] Returns empty context gracefully for new sessions with no messages
- [ ] `npm run check` passes in backend workspace
- [ ] `npm run test` passes in backend workspace

### US-2: Ably Event for Context Updates
**Description:** As a dashboard user, I want to receive real-time updates when context changes so that the display stays current.

**Acceptance Criteria:**
- [ ] New Ably event type `context-updated` defined in shared types
- [ ] Backend publishes `context-updated` event after context assembly in AI orchestrator
- [ ] Event payload includes sessionId and userId whose context was updated
- [ ] Event published on existing session channel (`session:${sessionId}`)
- [ ] `npm run check` passes

### US-3: Dashboard Route and Navigation
**Description:** As a dashboard user, I want to navigate to the context page from the session detail page.

**Acceptance Criteria:**
- [ ] New route `/session/:sessionId/context` registered in App.tsx
- [ ] "View Context" link/button visible on SessionDetail page header
- [ ] Clicking link navigates to context page
- [ ] Context page has "Back to Session" link
- [ ] `npm run check` passes in status-dashboard workspace

### US-4: Context Page Layout for Partner Sessions
**Description:** As a dashboard user, I want to see both users' contexts side-by-side for partner sessions.

**Acceptance Criteria:**
- [ ] Page displays two-column layout for sessions with 2 users
- [ ] Each column shows user name at top
- [ ] Columns scroll independently
- [ ] Single-column layout for solo sessions (inner thoughts)
- [ ] Header shows session info and "assembled at [timestamp]"
- [ ] Empty state shows "No context assembled yet. Context will appear as conversation progresses."

### US-5: Recent Messages Section
**Description:** As a dashboard user, I want to see the sliding window of recent messages in list format.

**Acceptance Criteria:**
- [ ] Section titled "Recent Messages (Sliding Window)"
- [ ] Messages displayed as list with role labels: "USER: [message]" and "ASSISTANT: [message]"
- [ ] Messages in chronological order
- [ ] Turn count displayed (e.g., "6 turns")
- [ ] Empty state shows "No messages yet"

### US-6: Notable Facts Section
**Description:** As a dashboard user, I want to see notable facts with category badges.

**Acceptance Criteria:**
- [ ] Section titled "Notable Facts"
- [ ] Each fact displayed as text with colored category badge
- [ ] Categories use distinct colors:
  - People: blue
  - Logistics: gray
  - Conflict: red
  - Emotional: purple
  - History: amber
- [ ] Facts displayed as flat list
- [ ] Empty state shows "No facts extracted yet"

### US-7: Emotional Thread Section
**Description:** As a dashboard user, I want to see emotional state as a mini timeline.

**Acceptance Criteria:**
- [ ] Section titled "Emotional Thread"
- [ ] Custom SVG sparkline showing intensity changes over session
- [ ] Current intensity value displayed (e.g., "7/10")
- [ ] Trend indicator (escalating/stable/de-escalating)
- [ ] Notable shifts marked on timeline
- [ ] Empty state for no emotional data

### US-8: Session Summary Section
**Description:** As a dashboard user, I want to see session summary in compact cards.

**Acceptance Criteria:**
- [ ] Section titled "Session Summary"
- [ ] Key themes displayed in compact card (as chips/tags)
- [ ] Emotional journey displayed in compact card
- [ ] Current focus displayed in compact card
- [ ] Unresolved topics/goals displayed in compact card
- [ ] Cards are compact but clearly readable
- [ ] Empty state shows "No summary generated yet"

### US-9: User Memories Section
**Description:** As a dashboard user, I want to see global and session memories.

**Acceptance Criteria:**
- [ ] Section titled "User Memories"
- [ ] Global memories listed with category badges
- [ ] Session memories listed with category badges
- [ ] Visual distinction between global and session memories (e.g., different background)
- [ ] Empty state shows "No memories"

### US-10: Inner Thoughts Section
**Description:** As a dashboard user, I want to see inner thoughts as styled quote blocks.

**Acceptance Criteria:**
- [ ] Section titled "Inner Thoughts Context"
- [ ] Each reflection displayed as styled quote block (border-left or quotation marks)
- [ ] Similarity score shown as badge (e.g., "85% match")
- [ ] "Linked" indicator for reflections from linked sessions
- [ ] Empty state shows "No relevant inner thoughts"

### US-11: Prior Themes and Global Facts Sections
**Description:** As a dashboard user, I want to see prior themes from previous sessions and global facts.

**Acceptance Criteria:**
- [ ] Section titled "Prior Themes" showing themes from past sessions
- [ ] Last session date and session count displayed
- [ ] Section titled "Global Facts" showing cross-session facts grouped by category
- [ ] Empty states for no data

### US-12: Real-time Updates Integration
**Description:** As a dashboard user, I want the context page to update automatically when context changes.

**Acceptance Criteria:**
- [ ] Dashboard subscribes to `context-updated` Ably event on session channel
- [ ] When event received, re-fetch context via API
- [ ] UI updates smoothly without full page refresh
- [ ] Unsubscribe from channel when leaving page

### US-13: Pass Sonnet Analysis to Haiku Classifier
**Description:** As a developer, I want the Haiku classifier to receive Sonnet's analysis and response so it can extract better facts.

**Acceptance Criteria:**
- [ ] `PartnerSessionClassifierInput` interface extended with `sonnetAnalysis?: string` and `sonnetResponse?: string` fields
- [ ] Classifier prompt includes Sonnet's analysis when available
- [ ] Classifier runs fire-and-forget AFTER Sonnet response completes (not in parallel)
- [ ] Message controller passes analysis and response to classifier
- [ ] Existing tests updated to cover new flow
- [ ] `npm run check` passes
- [ ] `npm run test` passes in backend workspace

---

## Technical Design

### API Endpoint

**GET /api/v1/brain/sessions/:sessionId/context**

Response:
```typescript
interface ContextResponse {
  sessionId: string;
  sessionType: 'partner' | 'inner_thoughts';
  assembledAt: string;
  users: Array<{
    userId: string;
    userName: string;
    context: ContextBundle;
  }>;
}
```

### Ably Event

**Channel:** `session:${sessionId}`
**Event:** `context-updated`
**Payload:**
```typescript
interface ContextUpdatedEvent {
  sessionId: string;
  userId: string;
  assembledAt: string;
}
```

### Classifier Input Changes

```typescript
export interface PartnerSessionClassifierInput {
  // ... existing fields ...

  /** Sonnet's analysis of the conversation (when available) */
  sonnetAnalysis?: string;
  /** Sonnet's response to the user (when available) */
  sonnetResponse?: string;
}
```

### Classifier Prompt Addition

```
SONNET'S ANALYSIS (use this to inform your fact extraction):
${sonnetAnalysis}

SONNET'S RESPONSE:
${sonnetResponse}

Use the analysis above to help identify facts. The analysis contains Sonnet's
interpretation of the user's situation, which can help you extract accurate facts.
```

### Component Structure

```
tools/status-dashboard/src/
├── components/
│   └── context/
│       ├── ContextPage.tsx          # Main page component
│       ├── ContextColumn.tsx        # Single user's context column
│       ├── RecentMessagesSection.tsx
│       ├── NotableFactsSection.tsx
│       ├── EmotionalThreadSection.tsx
│       ├── SessionSummarySection.tsx
│       ├── UserMemoriesSection.tsx
│       ├── InnerThoughtsSection.tsx
│       ├── PriorThemesSection.tsx
│       ├── GlobalFactsSection.tsx
│       ├── EmotionalSparkline.tsx   # Custom SVG sparkline
│       └── index.ts
├── hooks/
│   └── useContextBundle.ts          # Hook for fetching/subscribing to context
```

---

## Implementation Phases

### Phase 1: Backend API and Event
- [ ] Create `GET /api/v1/brain/sessions/:sessionId/context` endpoint
- [ ] Define `context-updated` Ably event type in shared
- [ ] Publish event after context assembly in AI orchestrator
- **Verification:**
  - `npm run check` passes
  - `npm run test --workspace=backend` passes
  - Manual test: curl endpoint returns context bundle

### Phase 2: Dashboard Route and Layout
- [ ] Add route `/session/:sessionId/context` in App.tsx
- [ ] Create ContextPage component with side-by-side layout
- [ ] Add navigation link from SessionDetail
- [ ] Create useContextBundle hook for data fetching
- **Verification:**
  - `npm run check --workspace=tools/status-dashboard` passes
  - Manual test: Navigate to context page, see layout

### Phase 3: Context Section Components
- [ ] RecentMessagesSection (list format)
- [ ] NotableFactsSection (flat list with category badges)
- [ ] EmotionalThreadSection (custom SVG sparkline)
- [ ] SessionSummarySection (compact cards)
- [ ] UserMemoriesSection
- [ ] InnerThoughtsSection (quote blocks)
- [ ] PriorThemesSection
- [ ] GlobalFactsSection
- **Verification:**
  - `npm run check --workspace=tools/status-dashboard` passes
  - Manual test: All sections render with sample data

### Phase 4: Real-time Updates
- [ ] Subscribe to `context-updated` Ably event in useContextBundle
- [ ] Re-fetch context when event received
- [ ] Unsubscribe on unmount
- **Verification:**
  - Manual test: Context updates when conversation progresses

### Phase 5: Sonnet Analysis to Haiku Classifier
- [ ] Extend PartnerSessionClassifierInput with sonnetAnalysis and sonnetResponse
- [ ] Update classifier prompt to include analysis
- [ ] Move classifier call to after Sonnet completion in message controller
- [ ] Pass analysis and response to classifier
- [ ] Update tests
- **Verification:**
  - `npm run check` passes
  - `npm run test --workspace=backend` passes
  - Manual test: Facts reflect analysis insights

---

## Definition of Done

This feature is complete when:
- [ ] All acceptance criteria in user stories pass
- [ ] All implementation phases verified
- [ ] Tests pass: `npm run test`
- [ ] Types/lint check: `npm run check`
- [ ] Build succeeds: `npm run build --workspace=tools/status-dashboard`
- [ ] Manual verification: Context page shows all components with real data
- [ ] Manual verification: Context updates in real-time during conversation

---

## Ralph Loop Command

```bash
/ralph-loop "Implement context display page per spec at docs/specs/add-dedicated-display-to-status-site-for-context.md

PHASES:
1. Backend API and Event: Create GET endpoint, define Ably event, publish after assembly - verify with npm run check && npm run test --workspace=backend
2. Dashboard Route and Layout: Add route, ContextPage, navigation, useContextBundle hook - verify with npm run check --workspace=tools/status-dashboard
3. Context Section Components: Build all 8 section components with styling - verify with npm run check --workspace=tools/status-dashboard
4. Real-time Updates: Subscribe to Ably event, re-fetch on update - verify manually
5. Sonnet Analysis to Classifier: Extend input, update prompt, reorder calls - verify with npm run check && npm run test --workspace=backend

VERIFICATION (run after each phase):
- npm run check
- npm run test --workspace=backend
- npm run build --workspace=tools/status-dashboard

ESCAPE HATCH: After 20 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 40 --completion-promise "COMPLETE"
```

---

## Open Questions

*None - all questions resolved during interview.*

---

## Implementation Notes

*To be filled during implementation.*
