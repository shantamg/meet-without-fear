# Specification: Prompt Optimization & Token Reduction

*Finalized: 2026-01-19*

## Overview

Optimize AI prompts to reduce token usage by ~1,200 tokens per turn while maintaining conversation quality. This is a pre-release optimization focused on backend prompt engineering.

## Problem Statement

Current prompts include:
- Redundant guidance (COMMUNICATION_PRINCIPLES, MEMORY_GUIDANCE) that Sonnet 3.5 handles natively
- Verbose formatting (emotional state blocks) that can be densified
- Unused memory intent detection that adds ~45% overhead to Haiku classifier

## Scope

### In Scope
- Densify emotional state block in `context-assembler.ts`
- Remove COMMUNICATION_PRINCIPLES from `stage-prompts.ts`
- Remove MEMORY_GUIDANCE from `stage-prompts.ts`
- Condense PROCESS_OVERVIEW in `stage-prompts.ts` (conditional injection)
- Condense INVALID_MEMORY_GUIDANCE to 1-2 lines
- Remove memory intent detection (TASK 1) from `partner-session-classifier.ts`
- Remove memory validation (TASK 2) from `partner-session-classifier.ts`
- Keep notable facts extraction (TASK 3) in `partner-session-classifier.ts`
- Add token count logging
- Delete `MemoryDetectionEvent.tsx` from status dashboard

### Out of Scope
- Mobile app changes (backend only)
- Database schema changes
- Changes to `memory-intent.ts` retrieval logic (keep stage/emotion-aware depth)
- New Haiku classifier tasks

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rollout strategy | All at once | Pre-release, can iterate quickly |
| Validation approach | Manual local testing | No production metrics yet |
| PROCESS_OVERVIEW detection | Keyword matching | Simple, no classifier overhead |
| HUD format | Intensity + turn only | Minimal, high-signal data |
| Memory intent type | Remove field entirely | Clean break, update all callers |
| Quality verification | Manual feel check | 3-5 turn conversations |
| Null intensity handling | Show "Unknown" | Graceful degradation |

---

## User Stories

### US-1: Add Token Logging Infrastructure
**Description:** As a developer, I want prompt token counts logged before each AI call so that I can measure baseline and verify optimization savings.

**Acceptance Criteria:**
- [ ] `context-assembler.ts` logs assembled prompt character count (proxy for tokens)
- [ ] Log format includes session ID, turn count, and character count
- [ ] Existing tests pass: `npm run test -w backend`
- [ ] Typecheck passes: `npm run check`

---

### US-2: Simplify Haiku Classifier (Remove Memory Intent)
**Description:** As a developer, I want to remove memory intent detection from the classifier so that we reduce Haiku input/output tokens by ~45%.

**Acceptance Criteria:**
- [ ] `partner-session-classifier.ts` prompt removes TASK 1 (memory intent detection)
- [ ] `partner-session-classifier.ts` prompt removes TASK 2 (memory validation)
- [ ] `PartnerSessionClassifierResult` type no longer includes `memoryIntent` field
- [ ] All callers updated: `messages.ts`, `ai-orchestrator.ts`, `context-retriever.ts`, `context-assembler.ts`
- [ ] Related test files updated to not expect `memoryIntent`
- [ ] Delete `tools/status-dashboard/src/components/events/MemoryDetectionEvent.tsx`
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

**Files to modify:**
- `backend/src/services/partner-session-classifier.ts` - remove TASK 1 & 2, update types
- `backend/src/controllers/messages.ts` - remove memoryIntent handling
- `backend/src/services/ai-orchestrator.ts` - remove memoryIntent handling
- `backend/src/services/context-retriever.ts` - remove memoryIntent handling
- `backend/src/services/context-assembler.ts` - remove memoryIntent handling
- `backend/src/services/__tests__/partner-session-classifier.test.ts` - update tests
- `tools/status-dashboard/src/components/events/MemoryDetectionEvent.tsx` - DELETE

---

### US-3: Remove Redundant Stage Prompt Guidance
**Description:** As a developer, I want to remove COMMUNICATION_PRINCIPLES and MEMORY_GUIDANCE from stage-prompts so that we save ~350 tokens per turn.

**Acceptance Criteria:**
- [ ] `stage-prompts.ts` no longer contains COMMUNICATION_PRINCIPLES section
- [ ] `stage-prompts.ts` no longer contains MEMORY_GUIDANCE section
- [ ] PRIVACY_GUIDANCE preserved
- [ ] INVALID_MEMORY_GUIDANCE condensed to 1-2 lines: "If user asks to remember something, redirect to Profile > Things to Remember"
- [ ] New test asserts "COMMUNICATION_PRINCIPLES" string does NOT appear in built prompts
- [ ] New test asserts "MEMORY_GUIDANCE" string does NOT appear in built prompts
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

---

### US-4: Condense PROCESS_OVERVIEW with Keyword Detection
**Description:** As a developer, I want PROCESS_OVERVIEW to only appear when the user asks about the process, so that we save ~100 tokens on most turns.

**Acceptance Criteria:**
- [ ] `stage-prompts.ts` has a function `isProcessQuestion(message: string): boolean`
- [ ] Keywords include: "how does this work", "what's the process", "what are the stages", "how do you work", "what's happening", "explain the process"
- [ ] PROCESS_OVERVIEW condensed to 2 lines max
- [ ] PROCESS_OVERVIEW only injected when `isProcessQuestion()` returns true
- [ ] Test for keyword detection function
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

---

### US-5: Densify Emotional State HUD
**Description:** As a developer, I want the emotional state block compressed to a single-line HUD format so that we save ~40 tokens per turn and place user input at the top of context.

**Acceptance Criteria:**
- [ ] `context-assembler.ts` replaces verbose emotional block with HUD format
- [ ] HUD format: `[User Intensity: X/10 (Stable)]` or `[User Intensity: X/10 (Changed: Was Y)]`
- [ ] HUD is inserted as the FIRST line of assembled prompt parts
- [ ] "Stable" shown if intensity change < 2
- [ ] "Changed: Was Y/10" shown if intensity change >= 2
- [ ] If intensity is null/undefined, show `[User Intensity: Unknown]`
- [ ] `npm run test -w backend` passes
- [ ] `npm run check` passes

**HUD Logic:**
```typescript
const { currentIntensity, initialIntensity } = bundle.emotionalThread;
const delta = (currentIntensity !== null && initialIntensity !== null)
  ? currentIntensity - initialIntensity
  : 0;

let emotionalStatus: string;
if (currentIntensity === null || currentIntensity === undefined) {
  emotionalStatus = '[User Intensity: Unknown]';
} else if (Math.abs(delta) >= 2) {
  emotionalStatus = `[User Intensity: ${currentIntensity}/10 (Changed: Was ${initialIntensity}/10)]`;
} else {
  emotionalStatus = `[User Intensity: ${currentIntensity}/10 (Stable)]`;
}

parts.unshift(emotionalStatus);
```

---

### US-6: Verify Token Savings and Quality
**Description:** As a developer, I want to verify token savings are realized and conversation quality is maintained.

**Acceptance Criteria:**
- [ ] Run local conversation and observe logged token counts are lower than baseline
- [ ] Manual test: have 3-5 turn conversation, responses still feel appropriate
- [ ] `npm run test` passes (all workspaces)
- [ ] `npm run check` passes

---

## Implementation Phases

### Phase 0: Token Logging Baseline
- [ ] Implement US-1 (token logging)
- [ ] Run a baseline conversation and record token counts
- **Verification:** `npm run test -w backend && npm run check`

### Phase 1: Classifier Simplification
- [ ] Implement US-2 (remove memory intent)
- **Verification:** `npm run test -w backend && npm run check`

### Phase 2: Stage Prompt Optimization
- [ ] Implement US-3 (remove redundant guidance)
- [ ] Implement US-4 (condense PROCESS_OVERVIEW)
- **Verification:** `npm run test -w backend && npm run check`

### Phase 3: Context Assembly Optimization
- [ ] Implement US-5 (densify HUD)
- **Verification:** `npm run test -w backend && npm run check`

### Phase 4: Final Verification
- [ ] Implement US-6 (verify savings and quality)
- [ ] Compare token counts to baseline
- **Verification:** `npm run test && npm run check`

---

## Expected Token Savings

| Change | Estimated Savings |
|--------|-------------------|
| Densify emotional state block | ~40 tokens/turn |
| Remove COMMUNICATION_PRINCIPLES | ~200 tokens/turn |
| Remove MEMORY_GUIDANCE | ~150 tokens/turn |
| Condense PROCESS_OVERVIEW | ~100 tokens/turn |
| Simplify Haiku classifier (remove Tasks 1 & 2) | ~400 tokens/call |
| **Total** | **~900-1,200 tokens/turn** |

---

## Definition of Done

This feature is complete when:
- [ ] All acceptance criteria in user stories pass
- [ ] All implementation phases verified
- [ ] Tests pass: `npm run test`
- [ ] Types/lint check: `npm run check`
- [ ] Manual quality verification: 3-5 turn conversation feels appropriate

---

## Ralph Loop Command

```bash
/ralph-loop "Implement prompt optimization per spec at docs/specs/docsplansprompt-optimization-planmd.md

PHASES:
1. Phase 0: Add token logging to context-assembler.ts - verify with npm run test -w backend
2. Phase 1: Remove memory intent from classifier and all callers, delete MemoryDetectionEvent.tsx - verify with npm run test -w backend
3. Phase 2: Remove COMMUNICATION_PRINCIPLES, MEMORY_GUIDANCE from stage-prompts, condense PROCESS_OVERVIEW with keyword detection - verify with npm run test -w backend
4. Phase 3: Densify emotional state to HUD format in context-assembler.ts - verify with npm run test -w backend
5. Phase 4: Final verification - npm run test && npm run check

VERIFICATION (run after each phase):
- npm run test -w backend
- npm run check

ESCAPE HATCH: After 20 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 30 --completion-promise "COMPLETE"
```

---

## Open Questions
*None - all questions resolved during interview*

## Implementation Notes
*To be filled during implementation*

