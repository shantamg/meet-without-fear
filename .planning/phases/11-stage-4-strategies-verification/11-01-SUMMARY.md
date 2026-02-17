---
phase: 11-stage-4-strategies-verification
plan: 01
subsystem: test-infrastructure
tags: [fixtures, e2e-testing, stage-4]
dependency_graph:
  requires: [stage-3-needs fixture pattern]
  provides: [stage-4-strategies fixture for E2E tests]
  affects: [SessionBuilder compatibility, Stage 4 E2E tests]
tech_stack:
  added: []
  patterns: [fixture registry pattern, deterministic AI responses]
key_files:
  created:
    - backend/src/fixtures/stage-4-strategies.ts
  modified:
    - backend/src/fixtures/index.ts
decisions: []
metrics:
  duration_minutes: 1
  tasks_completed: 1
  files_changed: 2
  completed_at: 2026-02-17
---

# Phase 11 Plan 01: Stage 4 Strategies Fixture Summary

**One-liner:** Stage 4 E2E fixture providing deterministic chat responses for SessionBuilder compatibility when testing strategic repair flows.

## Objective Achievement

Created a deterministic E2E fixture for Stage 4 (Strategic Repair) testing and registered it in the fixture registry. The fixture provides chat responses needed when SessionBuilder sets up sessions through Stages 0-3 at NEED_MAPPING_COMPLETE state.

## What Was Built

### 1. stage-4-strategies.ts Fixture (191 lines)
- **7 chat responses**: Copied verbatim from stage-3-needs.ts covering witnessing through empathy building (Stages 0-2)
- **extract-needs operation**: Returns 3 deterministic needs (CONNECTION, RECOGNITION, SAFETY)
- **common-ground operation**: Returns 2 common ground items
- **Seed user**: `user-stage4` with email `stage4@e2e.test`

### 2. Fixture Registry Integration
- Added import for `stage4Strategies`
- Exported from named exports
- Registered in `fixtureRegistry` with ID `'stage-4-strategies'`

## Design Rationale

**Why duplicate Stage 0-2 responses?**
SessionBuilder sets the fixture ID on user browser contexts. Even when starting at NEED_MAPPING_COMPLETE (Stage 3→4 transition), the chat history references the fixture. SessionBuilder may trigger earlier stage operations during setup, so all Stages 0-2 responses are included for compatibility.

**Why include extract-needs and common-ground operations?**
SessionBuilder at NEED_MAPPING_COMPLETE state may trigger Stage 3 operations during setup. These operations must return deterministic responses for test repeatability.

**Why no strategy generation operation?**
The AI suggestions endpoint (POST /strategies/suggestions) is a TODO in the backend that currently returns empty. E2E tests will propose strategies manually via POST /strategies API, so no operation mock is needed.

## Verification Results

All verification steps passed:

1. **TypeScript compilation**: `npm run check` passed across all workspaces
2. **Fixture loading**: `getFixture('stage-4-strategies')` returns valid fixture
3. **Response count**: 7 entries (matching stage-3-needs pattern)
4. **Operations**: `extract-needs` and `common-ground` present

### Verification Output
```
Loaded: true
Name: Stage 4 Strategies
Responses: 7
Operations: [ 'extract-needs', 'common-ground' ]
```

## Deviations from Plan

None - plan executed exactly as written. Fixture follows established stage-3-needs pattern precisely.

## Task Breakdown

### Task 1: Create stage-4-strategies fixture and register in index
- **Status**: Complete
- **Commit**: 40c1620
- **Files created**: `backend/src/fixtures/stage-4-strategies.ts`
- **Files modified**: `backend/src/fixtures/index.ts`
- **Verification**: TypeScript passes, fixture loads successfully

## Files Changed

| File | Lines | Change Type |
|------|-------|-------------|
| backend/src/fixtures/stage-4-strategies.ts | +191 | Created |
| backend/src/fixtures/index.ts | +3 | Modified (import + registry entry) |

**Total**: 2 files, +194 lines

## Impact

**Immediate:**
- Stage 4 E2E tests can now use SessionBuilder with fixture ID `'stage-4-strategies'`
- Browser contexts set with this fixture will receive deterministic AI responses
- Manual strategy proposal via API remains the test pattern (AI generation is TODO)

**Next Steps:**
- Plan 11-02: Create two-browser Stage 4 E2E test using this fixture

## Self-Check: PASSED

**Files created:**
```bash
FOUND: backend/src/fixtures/stage-4-strategies.ts
```

**Commits exist:**
```bash
FOUND: 40c1620
```

**Registry verification:**
```bash
FOUND: fixture loads with name "Stage 4 Strategies"
FOUND: 7 responses in fixture.responses array
FOUND: operations object with extract-needs and common-ground
```
