---
active: true
iteration: 1
max_iterations: 0
completion_promise: null
started_at: "2026-01-19T19:36:23Z"
---

Implement prompt optimization per spec at docs/specs/docsplansprompt-optimization-planmd.md. PHASES: 1) Phase 0: Add token logging to context-assembler.ts - verify with npm run test -w backend. 2) Phase 1: Remove memory intent from classifier and all callers, delete MemoryDetectionEvent.tsx - verify with npm run test -w backend. 3) Phase 2: Remove COMMUNICATION_PRINCIPLES, MEMORY_GUIDANCE from stage-prompts, condense PROCESS_OVERVIEW with keyword detection - verify with npm run test -w backend. 4) Phase 3: Densify emotional state to HUD format in context-assembler.ts - verify with npm run test -w backend. 5) Phase 4: Final verification - npm run test && npm run check. VERIFICATION after each phase: npm run test -w backend && npm run check. ESCAPE HATCH: After 20 iterations without progress, document blocking issues in spec under Implementation Notes and ask for human guidance. Output <promise>COMPLETE</promise> when all phases pass.
