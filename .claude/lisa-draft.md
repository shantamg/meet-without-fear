# Specification Draft: docs/plans/prompt-optimization-plan.md

*Interview in progress - Started: 2026-01-19*

## Overview
Optimize AI prompts to reduce token usage by ~1,200 tokens per turn while maintaining conversation quality. This is a pre-release optimization - no production monitoring needed.

## Problem Statement
Current prompts include redundant guidance (COMMUNICATION_PRINCIPLES, MEMORY_GUIDANCE) and verbose formatting (emotional state blocks) that inflate token costs without proportional quality benefit.

## Key Decisions Made
- **Rollout strategy:** All at once + local testing (pre-release, no A/B needed)
- **Validation approach:** Manual local testing, no production metrics yet
- **Risk tolerance:** High - can iterate quickly since not released

## Memory Intent Removal Scope

Based on codebase investigation, "memory intent" refers to:
1. **Detection:** Haiku classifier detects when user says "remember X" (TASK 1 in `partner-session-classifier.ts`)
2. **Validation:** Checks if memory is appropriate to save (TASK 2 in `partner-session-classifier.ts`)
3. **UI Popup:** Publishes event to mobile to show "Save Memory?" UI

**User's intent:** Remove ALL of this. Keep only notable facts extraction (TASK 3).

Files affected by memory intent removal:
- `backend/src/services/partner-session-classifier.ts` - remove TASK 1 & 2 from prompt
- `backend/src/services/memory-intent.ts` - entire file may be removable (need to check usage)
- `backend/src/controllers/messages.ts` - likely references memoryIntent
- `backend/src/services/ai-orchestrator.ts` - references memoryIntent
- `tools/status-dashboard/src/components/events/MemoryDetectionEvent.tsx` - can delete

## Scope

### In Scope
- Densify emotional state block in context-assembler.ts
- Remove COMMUNICATION_PRINCIPLES from stage-prompts.ts
- Remove MEMORY_GUIDANCE from stage-prompts.ts
- Condense PROCESS_OVERVIEW in stage-prompts.ts
- Remove memory intent detection (TASK 1) from partner-session-classifier.ts
- Remove memory validation (TASK 2) from partner-session-classifier.ts
- Keep notable facts extraction (TASK 3) in partner-session-classifier.ts

### Out of Scope
- Mobile app changes (backend only)
- Database schema changes
- Changes to `memory-intent.ts` retrieval logic (keep stage/emotion-aware depth)
- New Haiku classifier tasks

## Additional Decisions
- **PROCESS_OVERVIEW:** Condense to 2-line summary, inject only when keyword match detects process questions
- **HUD format:** Minimal - intensity and turn count only, no topic context
- **Token measurement:** Add logging of prompt size before each AI call
- **Memory intent UI:** Remove entirely (popup feature), keep retrieval depth logic

## User Stories

### US-1: Add Token Logging Infrastructure
**Description:** As a developer, I want prompt token counts logged before each AI call so that I can measure baseline and verify optimization savings.

**Acceptance Criteria:**
- [ ] `context-assembler.ts` logs assembled prompt character count (proxy for tokens)
- [ ] Log format includes session ID, turn count, and character count
- [ ] Existing tests pass: `npm run test -w backend`
- [ ] Typecheck passes: `npm run check`

### US-2: Simplify Haiku Classifier (Remove Memory Intent)
**Description:** As a developer, I want to remove memory intent detection from the classifier so that we reduce Haiku input/output tokens by ~45%.

**Acceptance Criteria:**
- [ ] `partner-session-classifier.ts` prompt removes TASK 1 (memory intent detection)
- [ ] `partner-session-classifier.ts` prompt removes TASK 2 (memory validation)
- [ ] `PartnerSessionClassifierResult` type no longer includes `memoryIntent` field
- [ ] All callers updated: `messages.ts`, `ai-orchestrator.ts`, `context-retriever.ts`, `context-assembler.ts`
- [ ] Related test files updated to not expect `memoryIntent`
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

### US-3: Remove Redundant Stage Prompt Guidance
**Description:** As a developer, I want to remove COMMUNICATION_PRINCIPLES and MEMORY_GUIDANCE from stage-prompts so that we save ~350 tokens per turn.

**Acceptance Criteria:**
- [ ] `stage-prompts.ts` no longer contains COMMUNICATION_PRINCIPLES section
- [ ] `stage-prompts.ts` no longer contains MEMORY_GUIDANCE section
- [ ] PRIVACY_GUIDANCE and INVALID_MEMORY_GUIDANCE are preserved
- [ ] New test asserts "COMMUNICATION_PRINCIPLES" string does NOT appear in built prompts
- [ ] New test asserts "MEMORY_GUIDANCE" string does NOT appear in built prompts
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

### US-4: Condense PROCESS_OVERVIEW with Keyword Detection
**Description:** As a developer, I want PROCESS_OVERVIEW to only appear when the user asks about the process, so that we save ~100 tokens on most turns.

**Acceptance Criteria:**
- [ ] `stage-prompts.ts` has a function to detect process questions via keyword matching
- [ ] Keywords include: "how does this work", "what's the process", "what are the stages", "how do you work"
- [ ] PROCESS_OVERVIEW is condensed to 2 lines max
- [ ] PROCESS_OVERVIEW only injected when keyword match returns true
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

### US-5: Densify Emotional State HUD
**Description:** As a developer, I want the emotional state block compressed to a single-line HUD format so that we save ~40 tokens per turn and place user input at the top of context.

**Acceptance Criteria:**
- [ ] `context-assembler.ts` replaces verbose emotional block with HUD format
- [ ] HUD format: `[User Intensity: X/10 (Stable|Changed: Was Y)]`
- [ ] HUD is inserted as the first line of assembled prompt
- [ ] "Stable" shown if intensity change < 2
- [ ] "Changed: Was Y" shown if intensity change >= 2
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

### US-6: Verify Token Savings and Quality
**Description:** As a developer, I want to verify token savings are realized and conversation quality is maintained.

**Acceptance Criteria:**
- [ ] Run local conversation and observe logged token counts are lower than baseline
- [ ] Manual test: have 3-5 turn conversation, responses still feel appropriate
- [ ] `npm run test` passes (all workspaces)
- [ ] `npm run check` passes

## Technical Design

### Data Model
[To be filled during interview]

### API Endpoints
[To be filled during interview]

### Integration Points
[To be filled during interview]

## User Experience

### User Flows
[To be filled during interview]

### Edge Cases
[To be filled during interview]

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
/ralph-loop "Implement docs/plans/prompt-optimization-plan.md per spec at docs/specs/docsplansprompt-optimization-planmd.md

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

