# Specification: Notable Facts Extraction for Partner Sessions

*Finalized: 2026-01-17*

## Overview

Create a "Notable Facts" system that runs alongside the existing Haiku analysis pipeline. For each user message, Haiku extracts and maintains a curated list of facts about the user's situation, emotions, and circumstances. These facts persist across the session and reduce the need for extensive chat history in prompts.

## Problem Statement

Currently, the AI needs extensive chat history (20-30 messages) to maintain context about each user's situation. This is token-expensive and can lead to context window issues. By extracting and maintaining a curated list of "notable facts" about each user, we can:
1. Reduce chat history tokens in prompts (from 20-30 to 8-10 messages)
2. Provide more consistent context across messages
3. Enable cross-session continuity (future enhancement)

## Key Design Decisions

- **Extends existing partner-session-classifier.ts**: Add fact extraction to the fire-and-forget Haiku call that already runs after each response
- **Facts are per-user within a session**: Each partner maintains their own facts list (stored in UserVessel)
- **Free-form text**: Simple strings, no categorization overhead
- **Full list output each time**: Haiku outputs complete facts list to avoid drift
- **N+1 timing**: Facts from message N are available starting from message N+1 (non-blocking)
- **Soft limit of 15-20 facts**: If exceeding, Haiku consolidates/merges similar facts

## Scope

### In Scope
- Extend `partner-session-classifier.ts` to extract notable facts alongside memory detection
- Store facts in `UserVessel.notableFacts` (new String[] field)
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

### US-1: Add notableFacts field to UserVessel model
**Description:** As a developer, I need the data model to store notable facts so they persist across messages.

**Acceptance Criteria:**
- [ ] UserVessel model has `notableFacts String[] @default([])` field
- [ ] Migration created with `npx prisma migrate dev --name add-notable-facts`
- [ ] `npm run check` passes in backend workspace
- [ ] Prisma client regenerated successfully

### US-2: Extend partner-session-classifier to extract facts
**Description:** As the AI system, I need to extract notable facts from each message so they can inform future responses.

**Acceptance Criteria:**
- [ ] `buildClassifierPrompt()` includes existing facts and asks for updated list
- [ ] Haiku prompt specifies fact types: emotional context, situational facts, people & relationships
- [ ] Haiku prompt excludes: meta-commentary, questions to AI, session preferences
- [ ] Haiku prompt includes soft limit guidance (15-20 facts, consolidate if more)
- [ ] `PartnerSessionClassifierResult` type includes `notableFacts?: string[]`
- [ ] `normalizeResult()` extracts and validates notableFacts array
- [ ] Facts saved to UserVessel after extraction
- [ ] Unit test: classifier returns expected facts for sample conversation
- [ ] `npm run test` passes in backend workspace

### US-3: Load facts in context-assembler
**Description:** As the AI system, I need to load existing facts when assembling context so they're available in the prompt.

**Acceptance Criteria:**
- [ ] `ContextBundle` type includes `notableFacts?: string[]`
- [ ] `assembleContextBundle()` queries UserVessel for notableFacts
- [ ] Facts loaded in parallel with other context (using Promise.all)
- [ ] Empty array returned if no facts exist yet
- [ ] Unit test: context bundle includes facts from UserVessel
- [ ] `npm run test` passes in backend workspace

### US-4: Format facts for Sonnet prompt
**Description:** As the AI system, I need facts formatted in the prompt so Sonnet can use them.

**Acceptance Criteria:**
- [ ] `formatContextForPrompt()` includes facts block when facts exist
- [ ] Format: `NOTED FACTS FROM THIS SESSION:\n- fact1\n- fact2`
- [ ] Empty facts list produces no output (no empty header)
- [ ] Unit test: formatted output matches expected format
- [ ] `npm run test` passes in backend workspace

### US-5: Reduce conversation history buffer
**Description:** As the AI system, I need to fetch fewer messages now that facts provide context.

**Acceptance Criteria:**
- [ ] `getTurnBufferSize()` in memory-intent.ts returns 4-5 (for 8-10 messages total)
- [ ] `buildConversationContext()` respects reduced buffer size
- [ ] Unit test: buffer size reduced appropriately
- [ ] `npm run test` passes in backend workspace

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
  "memoryIntent": { ... },
  "topicContext": "...",
  "notableFacts": [
    "User's daughter Emma is 14",
    "Partner works night shifts",
    "Feeling unheard about childcare decisions"
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

### Prompt Formatting

Facts appear in the Sonnet context as:
```
NOTED FACTS FROM THIS SESSION:
- User's daughter Emma is 14
- Partner works night shifts
- Feeling unheard about childcare decisions
```

### Integration Points

1. **partner-session-classifier.ts**: Add `notableFacts` extraction to existing Haiku call
2. **UserVessel model**: Add `notableFacts` String[] field
3. **context-assembler.ts**: Load facts from UserVessel, add to ContextBundle
4. **formatContextForPrompt()**: Format facts block for Sonnet
5. **memory-intent.ts**: Reduce `getTurnBufferSize()` to return 4-5 (8-10 messages)

## Requirements

### Functional Requirements
- FR-1: Facts extracted from each user message via Haiku (fire-and-forget)
- FR-2: Facts stored per-user per-session in UserVessel
- FR-3: Facts included in Sonnet context for subsequent messages
- FR-4: Conversation history reduced to 8-10 messages
- FR-5: Facts limited to 15-20 with consolidation when exceeding

### Non-Functional Requirements
- NFR-1: Fact extraction does not block AI response (fire-and-forget)
- NFR-2: Facts available from message N+1 onwards
- NFR-3: No additional API latency for user-facing responses

## Implementation Phases

### Phase 1: Data Model & Storage
- [ ] Add `notableFacts` field to UserVessel model
- [ ] Create and run migration
- [ ] Verify Prisma client regenerated
- **Verification:** `npm run check && npm run test` in backend

### Phase 2: Fact Extraction
- [ ] Update `buildClassifierPrompt()` with fact extraction instructions
- [ ] Update `PartnerSessionClassifierResult` type
- [ ] Update `normalizeResult()` to extract facts
- [ ] Save facts to UserVessel after extraction
- [ ] Add unit tests for classifier
- **Verification:** `npm run test` in backend (classifier tests pass)

### Phase 3: Context Integration
- [ ] Add `notableFacts` to `ContextBundle` type
- [ ] Load facts in `assembleContextBundle()`
- [ ] Format facts in `formatContextForPrompt()`
- [ ] Add unit tests for context assembly
- **Verification:** `npm run test` in backend (context tests pass)

### Phase 4: History Reduction
- [ ] Update `getTurnBufferSize()` to return 4-5
- [ ] Verify conversation context uses reduced size
- [ ] Add/update tests for buffer size
- **Verification:** `npm run check && npm run test` in backend

## Definition of Done

This feature is complete when:
- [ ] All acceptance criteria in user stories pass
- [ ] All implementation phases verified
- [ ] Tests pass: `npm run test` (backend)
- [ ] Types/lint check: `npm run check`
- [ ] Build succeeds: `npm run build`

## Edge Cases

- **Empty facts list**: First message has no facts - acceptable (N+1 timing)
- **Very short sessions**: May only accumulate 1-2 facts - that's fine
- **Conflicting facts**: Haiku should prefer newer information when consolidating
- **Partner-specific facts**: Each user's vessel stores their own facts - no cross-contamination
- **Haiku failure**: If Haiku times out, facts remain unchanged from previous message

## Ralph Loop Command

```bash
/ralph-loop "Implement Notable Facts Extraction per spec at docs/specs/notable-facts-extraction.md

PHASES:
1. Data Model: Add notableFacts to UserVessel, create migration - verify with npm run check
2. Fact Extraction: Update partner-session-classifier to extract facts - verify with npm run test
3. Context Integration: Load facts in context-assembler, format for prompt - verify with npm run test
4. History Reduction: Reduce getTurnBufferSize to 4-5 - verify with npm run check && npm run test

VERIFICATION (run after each phase):
- npm run check
- npm run test

ESCAPE HATCH: After 20 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 30 --completion-promise "COMPLETE"
```

## Open Questions

None - all questions resolved during interview.

## Progress Tracking

See [notable-facts-extraction.progress.md](./notable-facts-extraction.progress.md) for implementation progress.

## Implementation Notes

*To be filled during implementation*
