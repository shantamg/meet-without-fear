# Specification Draft: create list of notable info for each user in a partner session so we can include that in every prompt and reduce the number of chat history we include

*Interview in progress - Started: 2026-01-17*

## Overview
Create a "Notable Facts" system that runs alongside the existing Haiku analysis pipeline. For each user message, Haiku extracts/updates/removes structured facts about the user's situation, emotions, and circumstances. These facts persist across the session and reduce the need for extensive chat history in prompts.

## Problem Statement
Currently, the AI needs extensive chat history to maintain context about each user's situation. This is token-expensive and can lead to context window issues. By extracting and maintaining a curated list of "notable facts" about each user, we can:
1. Reduce chat history tokens in prompts
2. Provide more consistent context across messages
3. Enable cross-session continuity (future enhancement)

## Key Design Decisions
- **Extends existing partner-session-classifier.ts**: Add fact extraction to the fire-and-forget Haiku call that already runs after each response
- **Facts are per-user within a session**: Each partner maintains their own facts list (stored in UserVessel)
- **Append-only within session**: Facts accumulate, no updates/removes needed for short sessions
- **Free-form text**: Simple strings, no categorization overhead
- **Full list output each time**: Haiku outputs complete facts list to avoid drift
- **Focus on feeling-heard context**: Facts especially important for validating the user's experience
- **Exclusions**: No meta-info about the process/session style, only substantive user content

## Scope

### In Scope
- Extend `partner-session-classifier.ts` to extract notable facts alongside memory detection
- Store facts in `UserVessel.notableFacts` (new JSON field)
- Load facts via `context-assembler.ts` and include in `ContextBundle`
- Format facts in `formatContextForPrompt()` for Sonnet
- Reduce conversation history from 20-30 messages to 8-10 messages
- Facts persist for session duration only (within UserVessel)

### Out of Scope
- Cross-session fact persistence (future enhancement)
- Fact categorization or structured data
- Fact editing/removal UI
- Blocking fact extraction (N+1 timing is acceptable)
- Dynamic history reduction based on facts count

## User Stories

<!--
IMPORTANT: Each story must be small enough to complete in ONE focused coding session.
If a story is too large, break it into smaller stories.

Format each story with VERIFIABLE acceptance criteria:

### US-1: [Story Title]
**Description:** As a [user type], I want [action] so that [benefit].

**Acceptance Criteria:**
- [ ] [Specific, verifiable criterion - e.g., "API returns 200 for valid input"]
- [ ] [Another verifiable criterion - e.g., "Error message displayed for invalid email"]
- [ ] Typecheck/lint passes
- [ ] [If UI] Verify in browser

BAD criteria (too vague): "Works correctly", "Is fast", "Handles errors"
GOOD criteria: "Response time < 200ms", "Returns 404 for missing resource", "Form shows inline validation"
-->

[To be filled during interview]

## Technical Design

### Data Model

**UserVessel** (existing model - add new field):
```prisma
model UserVessel {
  // ... existing fields ...
  notableFacts    String[]   @default([])  // Array of free-form fact strings
}
```

### Haiku Extraction Prompt

**Input to Haiku:**
- User's latest message
- Last 2-3 conversation exchanges (for context)
- Current list of notable facts

**Output from Haiku:**
```json
{
  "memoryIntent": { ... },  // existing
  "topicContext": "...",     // existing
  "notableFacts": [          // NEW
    "User's daughter Emma is 14",
    "Partner works night shifts",
    "Feeling unheard about childcare decisions",
    ...
  ]
}
```

**Fact types to extract:**
- Emotional context (feelings, frustrations, fears, hopes)
- Situational facts (events, circumstances, timeline)
- People & relationships (names, roles, relationships mentioned)

**Exclusions:**
- Meta-commentary about the session/process
- Questions to the AI
- Session style preferences

**Soft limit:** 15-20 facts. If exceeding, Haiku should consolidate/merge similar facts.

### API Endpoints
No new endpoints - facts are internal to the AI context pipeline.

### Integration Points

1. **partner-session-classifier.ts**: Add `notableFacts` extraction to existing Haiku call
2. **UserVessel model**: Add `notableFacts` String[] field
3. **context-assembler.ts**: Load facts from UserVessel, add to ContextBundle
4. **formatContextForPrompt()**: Format facts block for Sonnet
5. **memory-intent.ts**: Reduce `getTurnBufferSize()` to return 8-10 messages

## User Experience

### User Flows
This feature is invisible to users - it's an internal AI context optimization. Users will experience:
- More consistent AI responses that remember details from earlier in conversation
- Potentially faster responses (less context = faster processing)
- No UI changes

### Prompt Formatting
Facts appear in the Sonnet context as:
```
NOTED FACTS FROM THIS SESSION:
- User's daughter Emma is 14
- Partner works night shifts
- Feeling unheard about childcare decisions
```

### Edge Cases
- **Empty facts list**: First message has no facts - acceptable (N+1 timing)
- **Very short sessions**: May only accumulate 1-2 facts - that's fine
- **Conflicting facts**: Haiku should prefer newer information when consolidating
- **Partner-specific facts**: Each user's vessel stores their own facts - no cross-contamination

## Requirements

### Functional Requirements
<!--
Use FR-IDs for each requirement:
- FR-1: [Requirement description]
- FR-2: [Requirement description]
-->
[To be filled during interview]

### Non-Functional Requirements
<!--
Performance, security, scalability requirements:
- NFR-1: [Requirement - e.g., "Response time < 500ms for 95th percentile"]
- NFR-2: [Requirement - e.g., "Support 100 concurrent users"]
-->
[To be filled during interview]

## Implementation Phases

<!-- Break work into 2-4 incremental milestones Ralph can complete one at a time -->

### Phase 1: [Foundation/Setup]
- [ ] [Task 1]
- [ ] [Task 2]
- **Verification:** `[command to verify phase 1]`

### Phase 2: [Core Implementation]
- [ ] [Task 1]
- [ ] [Task 2]
- **Verification:** `[command to verify phase 2]`

### Phase 3: [Integration/Polish]
- [ ] [Task 1]
- [ ] [Task 2]
- **Verification:** `[command to verify phase 3]`

<!-- Add Phase 4 if needed for complex features -->

## Definition of Done

This feature is complete when:
- [ ] All acceptance criteria in user stories pass
- [ ] All implementation phases verified
- [ ] Tests pass: `[verification command]`
- [ ] Types/lint check: `[verification command]`
- [ ] Build succeeds: `[verification command]`

## Ralph Loop Command

<!-- Generated at finalization with phases and escape hatch -->

```bash
/ralph-loop "Implement create list of notable info for each user in a partner session so we can include that in every prompt and reduce the number of chat history we include per spec at docs/specs/create-list-of-notable-info-for-each-user-in-a-partner-session-so-we-can-include-that-in-every-prompt-and-reduce-the-number-of-chat-history-we-include.md

PHASES:
1. [Phase 1 name]: [tasks] - verify with [command]
2. [Phase 2 name]: [tasks] - verify with [command]
3. [Phase 3 name]: [tasks] - verify with [command]

VERIFICATION (run after each phase):
- [test command]
- [lint/typecheck command]
- [build command]

ESCAPE HATCH: After 20 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 30 --completion-promise "COMPLETE"
```

## Open Questions
[To be filled during interview]

## Implementation Notes
[To be filled during interview]

---
*Interview notes will be accumulated below as the interview progresses*
---

