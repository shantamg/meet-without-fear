# Specification: Notable Facts Extraction for Partner Sessions

*Finalized: 2026-01-17*
*Updated: 2026-01-18 - Fact-Ledger Architecture (Categorized Facts + Global Facts)*

> **IMPLEMENTATION STATUS: ✅ COMPLETE**
>
> This spec has been implemented with enhancements beyond the original design:
> - ✅ Categorized facts (`{ category, fact }` format instead of plain strings)
> - ✅ Five fact categories: People, Logistics, Conflict, Emotional, History
> - ✅ Global facts consolidation (cross-session user profile)
> - ✅ Session-level embeddings
> - ✅ Applies to both Partner Sessions and Inner Thoughts

## Overview

The "Notable Facts" system (Fact-Ledger Architecture) runs alongside the existing Haiku analysis pipeline. For each user message, Haiku extracts and maintains a curated list of **categorized facts** about the user's situation, emotions, and circumstances. These facts persist across the session and reduce the need for extensive chat history in prompts.

## Problem Statement

Currently, the AI needs extensive chat history (20-30 messages) to maintain context about each user's situation. This is token-expensive and can lead to context window issues. By extracting and maintaining a curated list of "notable facts" about each user, we can:
1. Reduce chat history tokens in prompts (from 20-30 to 8-10 messages)
2. Provide more consistent context across messages
3. Enable cross-session continuity via Global Facts consolidation

## Key Design Decisions

- **Extends existing partner-session-classifier.ts**: Add fact extraction to the fire-and-forget Haiku call that already runs after each response
- **Facts are per-user within a session**: Each partner maintains their own facts list (stored in UserVessel)
- **Categorized facts**: Facts have `{ category, fact }` format with five categories
- **Categories**: People, Logistics, Conflict, Emotional, History
- **Full list output each time**: Haiku outputs complete facts list to avoid drift
- **N+1 timing**: Facts from message N are available starting from message N+1 (non-blocking)
- **Soft limit of 15-20 facts**: If exceeding, Haiku consolidates/merges similar facts
- **Global facts consolidation**: Session facts merged into user profile on Stage 1 completion

## Scope

### In Scope (✅ Implemented)
- Extend `partner-session-classifier.ts` to extract categorized notable facts alongside memory detection
- Store facts in `UserVessel.notableFacts` (JSONB column with `CategorizedFact[]`)
- Load facts via `context-assembler.ts` and include in `ContextBundle`
- Format facts in `formatContextForPrompt()` for Sonnet (grouped by category)
- Reduce conversation history from 20-30 messages to 8-10 messages
- Facts persist for session duration (within UserVessel)
- **Global facts consolidation** - cross-session user profile in `User.globalFacts`
- **Session-level embeddings** - triggered after classification
- **Inner Thoughts support** - same system via `background-classifier.ts`

### Out of Scope
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

**UserVessel** (existing model - updated field):
```prisma
model UserVessel {
  // ... existing fields ...
  notableFacts    Json?    // JSONB: CategorizedFact[] - array of { category, fact }
  contentEmbedding  Unsupported("vector(1024)")?  // Session-level embedding
}
```

**User** (for global facts):
```prisma
model User {
  // ... existing fields ...
  globalFacts     Json?    // JSONB: GlobalFacts - consolidated user profile
}
```

### Categorized Fact Format

```typescript
interface CategorizedFact {
  category: string;  // People, Logistics, Conflict, Emotional, History
  fact: string;      // 1 sentence max
}

interface GlobalFacts {
  facts: CategorizedFact[];  // Max 50 facts
  consolidatedAt: string;    // ISO timestamp
  sessionCount: number;      // Sessions contributing
}
```

### Haiku Extraction Prompt

**Input to Haiku:**
- User's latest message
- Last 2-3 conversation exchanges (for context)
- Current list of notable facts (categorized)

**Output from Haiku:**
```json
{
  "memoryIntent": { ... },
  "topicContext": "...",
  "notableFacts": [
    { "category": "People", "fact": "User's daughter Emma is 14" },
    { "category": "Logistics", "fact": "Partner works night shifts" },
    { "category": "Emotional", "fact": "Feeling unheard about childcare decisions" }
  ]
}
```

**Fact Categories:**
- **People:** names, roles, relationships (e.g., "daughter Emma is 14")
- **Logistics:** scheduling, location, practical circumstances
- **Conflict:** specific disagreements, triggers, patterns
- **Emotional:** feelings, frustrations, fears, hopes
- **History:** past events, relationship timeline, backstory

**Exclusions:**
- Meta-commentary about the session/process
- Questions to the AI
- Session style preferences

**Soft limit:** 15-20 facts per session. If exceeding, Haiku should consolidate/merge similar facts.

### Prompt Formatting

**Session facts** appear as:
```
NOTED FACTS FROM THIS SESSION:
[People]
- User's daughter Emma is 14
- Partner is named Alex
[Logistics]
- Partner works night shifts
[Emotional]
- Feeling unheard about childcare decisions
```

**Global facts** appear at TOP of context:
```
ABOUT THIS USER (from previous sessions):
[People]
- Has partner named Alex
- Daughter Emma is 14
[History]
- Together for 5 years
```

### Integration Points

1. **partner-session-classifier.ts**: Extract `notableFacts` as categorized array
2. **background-classifier.ts**: Same for Inner Thoughts sessions
3. **UserVessel model**: `notableFacts` JSONB field (not String[])
4. **User model**: `globalFacts` JSONB field for cross-session profile
5. **context-assembler.ts**: Load facts from UserVessel + global facts from User
6. **formatContextForPrompt()**: Format facts grouped by category
7. **memory-intent.ts**: Buffer size already reduced to 4-5 turns
8. **global-memory.ts**: Consolidate session facts into user profile
9. **messages.ts**: Trigger global consolidation on Stage 1 completion

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
