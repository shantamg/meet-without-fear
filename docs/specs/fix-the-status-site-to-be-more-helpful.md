# Specification: Typed LLM Event Display in Neural Monitor

**Created:** 2026-01-18
**Status:** Ready for Implementation

## Overview

The Neural Monitor dashboard (tools/status-dashboard) needs to properly display LLM events after the migration to tool calls and streaming. Each LLM call type should have a dedicated display component with appropriate visual treatment based on whether it's user-facing (Sonnet) or background processing (Haiku).

## Problem Statement

After migrating to tool calls and streaming, the dashboard isn't showing the right information:
- Analysis blocks from streaming responses aren't displayed separately
- Fire-and-forget Haiku calls (memories, facts, classifications) lack structured display
- No visual distinction between user-facing calls and background processing

## Solution

1. Add `callType` enum and `structuredOutput` jsonb fields to BrainActivity model
2. Update all AI services to populate these fields when logging brain activity
3. Create dedicated frontend components for each of 16 call types
4. Apply color accent system to distinguish Sonnet (warm) from Haiku (cool) calls

## Out of Scope

- Mobile app changes (dashboard only)
- Session Browser list view changes (keep current cost/token stats)
- Filtering or search functionality
- Animation for real-time updates

---

## User Stories

### US-1: Backend Schema Migration

**Description:** Add `callType` enum and `structuredOutput` field to BrainActivity table.

**Acceptance Criteria:**
- [ ] Prisma schema has `BrainActivityCallType` enum with all 16 values
- [ ] BrainActivity model has `callType BrainActivityCallType?` field
- [ ] BrainActivity model has `structuredOutput Json?` field
- [ ] Migration runs successfully: `npx prisma migrate dev`
- [ ] `npm run check` passes in backend workspace

**Call Type Enum Values:**
```prisma
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
}
```

---

### US-2: Update AI Orchestrator (ORCHESTRATED_RESPONSE)

**Description:** Update `getOrchestratedResponse()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'ORCHESTRATED_RESPONSE'`
- [ ] `structuredOutput` contains: `{ analysis: string, response: string, toolCalls?: any[] }`
- [ ] Existing tests pass: `npm run test -- --grep "ai-orchestrator"`

---

### US-3: Update Retrieval Planner (RETRIEVAL_PLANNING)

**Description:** Update `planRetrieval()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'RETRIEVAL_PLANNING'`
- [ ] `structuredOutput` contains the array of `RetrievalQuery` objects
- [ ] Circuit breaker fallback still works correctly

---

### US-4: Update Intent Detector (INTENT_DETECTION)

**Description:** Update `detectIntent()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'INTENT_DETECTION'`
- [ ] `structuredOutput` contains: `{ intent: string, confidence: number, personData?: any, missingInfo?: string[] }`

---

### US-5: Update Background Classifier (BACKGROUND_CLASSIFICATION)

**Description:** Update `runBackgroundClassifier()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'BACKGROUND_CLASSIFICATION'`
- [ ] `structuredOutput` contains: `{ memorySuggestions: any[], themes: string[], sessionMetadata: any }`

---

### US-6: Update Partner Session Classifier (PARTNER_SESSION_CLASSIFICATION)

**Description:** Update `runPartnerSessionClassifier()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'PARTNER_SESSION_CLASSIFICATION'`
- [ ] `structuredOutput` contains: `{ memorySuggestions: any[], notableFacts: string[] }`
- [ ] Notable facts array is properly captured (up to 15-20 items)

---

### US-7: Update Chat Router Response Generator (CHAT_ROUTER_RESPONSE)

**Description:** Update `generateWithAI()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'CHAT_ROUTER_RESPONSE'`
- [ ] `structuredOutput` contains: `{ response: string }`

---

### US-8: Update Reference Detector (REFERENCE_DETECTION)

**Description:** Update `detectReferences()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'REFERENCE_DETECTION'`
- [ ] `structuredOutput` contains array of `DetectedReference` objects

---

### US-9: Update People Extractor (PEOPLE_EXTRACTION)

**Description:** Update `extractNamesWithAI()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'PEOPLE_EXTRACTION'`
- [ ] `structuredOutput` contains: `{ names: any[], relationships: any[], matches: any[] }`

---

### US-10: Update Memory Detector (MEMORY_DETECTION)

**Description:** Update `detectMemoryIntents()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'MEMORY_DETECTION'`
- [ ] `structuredOutput` contains array of memory suggestions with categories

---

### US-11: Update Memory Validator (MEMORY_VALIDATION)

**Description:** Update `validateMemory()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'MEMORY_VALIDATION'`
- [ ] `structuredOutput` contains: `{ valid: boolean, reason?: string }`

---

### US-12: Update Reconciler (RECONCILER_ANALYSIS)

**Description:** Update `runReconciler()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'RECONCILER_ANALYSIS'`
- [ ] `structuredOutput` contains gap analysis, suggested share, recommendations

---

### US-13: Update Conversation Summarizer (SUMMARIZATION)

**Description:** Update `summarizeConversation()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'SUMMARIZATION'`
- [ ] `structuredOutput` contains: `{ themes: string[], emotionalJourney: string, currentFocus: string, userGoals: string[] }`

---

### US-14: Update Needs Extractor (NEEDS_EXTRACTION)

**Description:** Update `extractNeeds()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'NEEDS_EXTRACTION'`
- [ ] `structuredOutput` contains array of needs with category, evidence, confidence

---

### US-15: Update Witnessing Service (WITNESSING_RESPONSE)

**Description:** Update `getWitnessingResponse()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'WITNESSING_RESPONSE'`
- [ ] `structuredOutput` contains: `{ response: string, personMention?: string, emotionalTone?: string }`

---

### US-16: Update Memory Formatter (MEMORY_FORMATTING)

**Description:** Update `formatMemoryForPrompt()` to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'MEMORY_FORMATTING'`
- [ ] `structuredOutput` contains: `{ formattedMemories: string[] }`

---

### US-17: Update Theme Extractor (THEME_EXTRACTION)

**Description:** Update theme extraction in reconciler to log with callType and structured output.

**Acceptance Criteria:**
- [ ] Brain activity logs include `callType: 'THEME_EXTRACTION'`
- [ ] `structuredOutput` contains: `{ themes: string[] }`

---

### US-18: Dashboard Types and API Update

**Description:** Update dashboard types and API to handle new fields.

**Acceptance Criteria:**
- [ ] `BrainActivity` type in `tools/status-dashboard/src/types/activity.ts` includes `callType` and `structuredOutput`
- [ ] API response properly serializes new fields
- [ ] `npm run check` passes in status-dashboard workspace

---

### US-19: Event Component Registry

**Description:** Create component registry mapping callType to display component.

**Acceptance Criteria:**
- [ ] New directory: `tools/status-dashboard/src/components/events/`
- [ ] `EventRenderer.tsx` component that switches on callType
- [ ] Fallback for unknown/null callType (renders current generic view)

---

### US-20: Color Accent System

**Description:** Implement visual distinction between Sonnet (user-facing) and Haiku (background) calls.

**Acceptance Criteria:**
- [ ] CSS variables defined: `--accent-warm` (amber/orange), `--accent-cool` (blue/purple)
- [ ] Sonnet calls (ORCHESTRATED_RESPONSE, RECONCILER_ANALYSIS, NEEDS_EXTRACTION, WITNESSING_RESPONSE) use warm accent
- [ ] Haiku calls (all others) use cool accent
- [ ] Color applied to component border/header

---

### US-21: OrchestratedResponseEvent Component

**Description:** Display component for ORCHESTRATED_RESPONSE with collapsible analysis.

**Acceptance Criteria:**
- [ ] Shows response text (always visible)
- [ ] Shows analysis block collapsed by default with preview
- [ ] Click to expand full analysis
- [ ] Shows tool calls if present
- [ ] Uses warm accent color

---

### US-22: PartnerSessionClassificationEvent Component

**Description:** Display component for PARTNER_SESSION_CLASSIFICATION with chips.

**Acceptance Criteria:**
- [ ] Displays notable facts as compact chips/tags
- [ ] Displays memory suggestions as chips
- [ ] Uses cool accent color
- [ ] Chips are scannable at a glance

---

### US-23: Remaining 14 Event Components

**Description:** Create display components for all remaining call types.

**Acceptance Criteria:**
- [ ] `IntentDetectionEvent.tsx` - shows intent, confidence, person data
- [ ] `RetrievalPlanningEvent.tsx` - shows retrieval queries
- [ ] `BackgroundClassificationEvent.tsx` - shows themes, memories, metadata
- [ ] `ChatRouterResponseEvent.tsx` - shows response text
- [ ] `ReferenceDetectionEvent.tsx` - shows detected references as chips
- [ ] `PeopleExtractionEvent.tsx` - shows names/relationships as chips
- [ ] `MemoryDetectionEvent.tsx` - shows memory suggestions as chips
- [ ] `MemoryValidationEvent.tsx` - shows valid/invalid with reason
- [ ] `ReconcilerAnalysisEvent.tsx` - shows gap analysis (warm accent)
- [ ] `SummarizationEvent.tsx` - shows themes, journey, focus as sections
- [ ] `NeedsExtractionEvent.tsx` - shows needs array (warm accent)
- [ ] `WitnessingResponseEvent.tsx` - shows response (warm accent)
- [ ] `MemoryFormattingEvent.tsx` - shows formatted memories
- [ ] `ThemeExtractionEvent.tsx` - shows themes as chips
- [ ] All use appropriate accent color based on Sonnet/Haiku

---

### US-24: Integration and Testing

**Description:** Integrate new components into SessionDetail view.

**Acceptance Criteria:**
- [ ] SessionDetail uses EventRenderer for each brain activity
- [ ] Events display chronologically with color coding
- [ ] Real-time updates work (Ably subscription)
- [ ] `npm run check` passes in all workspaces
- [ ] `npm run test` passes in backend
- [ ] Manual test: Create session, see properly rendered events

---

## Technical Implementation Notes

### Prisma Schema Addition

```prisma
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
}

model BrainActivity {
  // ... existing fields ...
  callType         BrainActivityCallType?
  structuredOutput Json?
}
```

### Component Color Assignment

```typescript
const WARM_ACCENT_TYPES = [
  'ORCHESTRATED_RESPONSE',
  'RECONCILER_ANALYSIS',
  'NEEDS_EXTRACTION',
  'WITNESSING_RESPONSE',
];

const getAccentColor = (callType: string) =>
  WARM_ACCENT_TYPES.includes(callType) ? 'var(--accent-warm)' : 'var(--accent-cool)';
```

### CSS Variables

```css
:root {
  --accent-warm: #f59e0b;  /* amber-500 */
  --accent-cool: #8b5cf6;  /* violet-500 */
}
```

---

## Verification Commands

```bash
# Type checking
npm run check

# Backend tests
npm run test --workspace=backend

# Dashboard build
npm run build --workspace=tools/status-dashboard

# Run dashboard locally
npm run dev --workspace=tools/status-dashboard
```

## Success Criteria

1. All 16 call types have dedicated display components
2. Visual distinction between Sonnet (warm) and Haiku (cool) calls is clear
3. Orchestrated response shows analysis collapsed by default, response visible
4. Fire-and-forget results (facts, memories, themes) display as compact chips
5. Events display chronologically in session detail view
6. All existing functionality preserved (cost display, real-time updates)
