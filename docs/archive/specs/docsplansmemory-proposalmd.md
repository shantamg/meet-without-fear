# Session Isolation Specification

*Finalized: 2026-01-18*

## Overview
Implement session isolation by preventing cross-session memory injection while maintaining the existing fact extraction and consolidation pipeline for future use.

## Problem Statement
Currently, sessions receive cross-session context including Global Facts (from previous sessions) and potentially cross-session RAG retrieval. This violates the principle that each session should be a "clean slate" where the AI only knows what the user shares in that specific session, plus basic profile info (name, partner nickname).

## Scope

### In Scope
- Block Global Facts injection for ALL stages (until consent UI is built)
- Block cross-session RAG retrieval for ALL stages (until consent UI is built)
- Keep same-session memory working (summary, notable facts, recent messages)
- Keep Inner Work linked session access working (same-relationship context, not cross-session)
- Keep fact extraction and consolidation pipelines running (write-only, for future use)

### Out of Scope (Future Work)
- Consent-based "Context Handshake" UI (pre-mediation modal for selecting which facts to bring in)
- User-gated approval flow for summaries before persistence
- "Draft & Review" loop for post-session fact approval
- Prior Themes population (already returns empty, leave as-is)

## User Stories

### US-1: Disable Global Facts Injection
**Description:** As a user in any stage, I want the AI to NOT receive "ABOUT THIS USER (from previous sessions)" context so that each session is isolated until I opt-in via future consent UI.

**Acceptance Criteria:**
- [ ] `assembleContextBundle()` does NOT call `loadGlobalFacts()`
- [ ] `formatContextForPrompt()` does NOT include "ABOUT THIS USER" section
- [ ] Unit test verifies globalFacts is undefined/empty in returned bundle
- [ ] `npm run check` passes
- [ ] `npm run test` passes

### US-2: Disable Cross-Session RAG for All Stages
**Description:** As a user, I want the AI to NOT search other sessions' content so that memory is isolated to the current session.

**Acceptance Criteria:**
- [ ] `allowCrossSession` defaults to `false` for ALL stages (not just Stage 1)
- [ ] `searchAcrossSessionsContent()` is never called (or returns empty)
- [ ] Explicit reference patterns ("we agreed last time") do NOT trigger cross-session search
- [ ] Unit test verifies `allowCrossSession: false` for stages 2, 3, 4
- [ ] `npm run check` passes
- [ ] `npm run test` passes

### US-3: Preserve Inner Work Linked Session Access
**Description:** As a user doing Inner Work, I want to still see context from the partner session this Inner Work is linked to, since that's same-relationship context, not cross-session.

**Acceptance Criteria:**
- [ ] Inner Work session can still access linked partner session content
- [ ] Inner Work does NOT access OTHER partner sessions (just the linked one)
- [ ] Existing Inner Work tests still pass
- [ ] `npm run check` passes
- [ ] `npm run test` passes

## Technical Design

### Data Model
No schema changes required. Existing columns remain:
- `User.globalFacts` (JSONB) - still written to, just not read
- `UserVessel.notableFacts` (JSONB) - unchanged, still used

### Code Changes

**1. context-assembler.ts (line ~206)**
```typescript
// BEFORE:
loadGlobalFacts(userId),

// AFTER:
// Global facts disabled until consent UI is implemented
// loadGlobalFacts(userId),
Promise.resolve(undefined),
```

**2. memory-intent.ts - getStageConfig()**
Change stages 2, 3, 4 to `allowCrossSession: false`:
```typescript
// Stage 2: disable cross-session
case 2:
  return {
    threshold: 0.55,
    maxCrossSession: 0,  // was 5
    allowCrossSession: false,  // was true
    surfaceStyle: 'tentative',
  };
// Similar for stages 3 and 4
```

**3. context-retriever.ts (line ~518)**
Remove the override that allows cross-session on explicit reference:
```typescript
// BEFORE:
const shouldSearchCrossSession =
  (memoryIntent?.allowCrossSession ?? true) ||
  referenceDetection.needsRetrieval ||
  (effectiveUserPrefs?.crossSessionRecall ?? false);

// AFTER:
// Cross-session disabled until consent UI is implemented
const shouldSearchCrossSession = false;
```

### What Stays the Same
- Notable facts extraction (per-session) - unchanged
- Session summarization - unchanged
- Global facts consolidation on Stage 1 completion - unchanged (write-only)
- Inner Work linked session access - unchanged
- Within-session context (recent messages, emotional thread) - unchanged

## User Experience

### User Flows
No user-facing changes. This is a backend-only change to disable cross-session memory injection.

### Edge Cases
- **Long sessions (30+ messages)**: Still get same-session summary - no change
- **Explicit memory references ("we agreed last time")**: AI will NOT retrieve cross-session content. It may acknowledge it doesn't have that context.
- **Inner Work linked to partner session**: Still works - linked session context is preserved

## Requirements

### Functional Requirements
- FR-1: Global Facts must NOT be injected into any stage's context
- FR-2: Cross-session RAG search must NOT occur for any stage
- FR-3: Same-session context (notable facts, summary, recent messages) must continue working
- FR-4: Inner Work must retain access to linked partner session content
- FR-5: Global facts consolidation must continue running on Stage 1 completion

### Non-Functional Requirements
- NFR-1: No performance regression - removing data should be faster if anything
- NFR-2: All existing tests must pass (update tests that expect cross-session behavior)

## Implementation Phases

### Phase 1: Disable Global Facts Injection
- [ ] Comment out `loadGlobalFacts(userId)` call in `context-assembler.ts`
- [ ] Replace with `Promise.resolve(undefined)` to maintain Promise.all structure
- [ ] Add unit test verifying `globalFacts` is undefined in bundle for all stages
- **Verification:** `npm run test -- backend/src/services/__tests__/context-assembler.test.ts`

### Phase 2: Disable Cross-Session RAG
- [ ] Update `getStageConfig()` in `memory-intent.ts` to set `allowCrossSession: false` for stages 2, 3, 4
- [ ] Update `shouldSearchCrossSession` in `context-retriever.ts` to always be `false`
- [ ] Update unit tests that expect `allowCrossSession: true` for stages 2-4
- **Verification:** `npm run test -- backend/src/services/__tests__/memory-intent.test.ts`

### Phase 3: Verify Inner Work and Final Tests
- [ ] Verify Inner Work linked session access still works (check `buildInnerThoughtsContext`)
- [ ] Run full test suite to catch any regressions
- [ ] Run typecheck
- **Verification:** `npm run check && npm run test`

## Definition of Done

This feature is complete when:
- [ ] Global Facts are NOT injected into any stage's context bundle
- [ ] Cross-session RAG search is disabled for all stages
- [ ] Same-session memory (notable facts, summary, recent messages) works unchanged
- [ ] Inner Work linked session access works unchanged
- [ ] All unit tests pass: `npm run test`
- [ ] Types check: `npm run check`

## Ralph Loop Command

```bash
/ralph-loop "Implement session isolation per spec at docs/specs/docsplansmemory-proposalmd.md

PHASES:
1. Disable Global Facts: Comment out loadGlobalFacts() in context-assembler.ts, add unit test - verify with npm run test -- backend/src/services/__tests__/context-assembler.test.ts
2. Disable Cross-Session RAG: Set allowCrossSession: false for all stages in memory-intent.ts, update shouldSearchCrossSession in context-retriever.ts, update tests - verify with npm run test -- backend/src/services/__tests__/memory-intent.test.ts
3. Final verification: Run full test suite and typecheck - verify with npm run check && npm run test

VERIFICATION (run after each phase):
- npm run test (for specific test file)
- npm run check (after all phases)

ESCAPE HATCH: After 15 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 20 --completion-promise "COMPLETE"
```

## Open Questions
None - scope is clear.

## Implementation Notes
- This is a "disable" change, not a "remove" change. Code paths remain for future consent UI.
- Global facts consolidation continues running (write path) so data accumulates for future use.
- The changes are intentionally minimal: ~10 lines of code changes + test updates.

## Future Work (When Consent UI is Built)
- Add `contextConfig` parameter to session creation
- Add "Context Handshake" modal in mobile app
- Re-enable Global Facts injection when user opts in
- Re-enable cross-session RAG when user opts in
