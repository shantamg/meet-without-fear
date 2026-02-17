---
phase: 10-stage-3-needs-verification
plan: 01
subsystem: stage-3
tags: [e2e-testing, testids, fixtures, needs-extraction, common-ground]
dependency_graph:
  requires:
    - Stage 3 UI components (NeedMappingScreen, NeedsSection, CommonGroundCard)
    - Backend needs service with extract-needs and common-ground operations
    - Fixture infrastructure and registry
  provides:
    - testIDs for all Stage 3 UI phases (exploration, review, common_ground, waiting)
    - testIDs for interactive elements (confirm/adjust buttons, continue button)
    - stage-3-needs fixture with deterministic AI responses
    - Fixture operations matching backend service operation keys
  affects:
    - E2E tests for Stage 3 (can now find and interact with UI elements)
    - Visual regression tests (can now target specific UI states)
tech_stack:
  added: []
  patterns:
    - testID prop propagation pattern for React Native components
    - E2E fixture operations for JSON-response AI calls
    - Operation key alignment between fixtures and backend services
key_files:
  created:
    - backend/src/fixtures/stage-3-needs.ts
  modified:
    - mobile/src/screens/NeedMappingScreen.tsx
    - backend/src/fixtures/index.ts
decisions:
  - decision: "Add testIDs to all four phase containers (exploration, review, common_ground, waiting)"
    rationale: "Enables Playwright to find the correct UI phase during E2E tests"
    alternatives: ["Use text content for selection (fragile)", "Use component hierarchy (complex)"]
  - decision: "Reuse Stage 0-1-2 chat responses in stage-3-needs fixture"
    rationale: "SessionBuilder.startingAt('EMPATHY_REVEALED') skips stage chat but fixture ID is still set on browser context"
    alternatives: ["Empty responses array (would break if E2E test doesn't skip stages)", "Minimal single response (incomplete coverage)"]
  - decision: "Match operation keys exactly: 'extract-needs' and 'common-ground'"
    rationale: "Backend services use these exact strings in getCompletion calls - must match for fixture to work"
    alternatives: ["Use camelCase (would not match)", "Use different naming convention (would break fixture loading)"]
metrics:
  duration: 3
  completed_at: "2026-02-17T18:20:44Z"
  tasks_completed: 2
  files_modified: 3
  commits: 2
---

# Phase 10 Plan 01: Stage 3 UI TestIDs and Fixture Summary

**One-liner:** Add testIDs to all Stage 3 UI phases and create deterministic stage-3-needs fixture with extract-needs and common-ground operations for E2E testing.

## Objective

Enable E2E testing of Stage 3 (Need Mapping) by adding testIDs to all UI phases and interactive elements, and providing deterministic AI responses for needs extraction and common ground discovery.

## Execution

### Task 1: Add testIDs to NeedMappingScreen and child components

**Status:** Complete
**Commit:** 8edd217

Added testIDs to all four phases in NeedMappingScreen.tsx:

1. **Exploration phase** (`need-mapping-exploration`): Chat interface container
2. **Review phase** (`need-mapping-review`): Needs review container with:
   - `needs-section` on NeedsSection component
   - `needs-confirm-question` on confirmation container
   - `confirm-needs-button` on confirm button
   - `adjust-needs-button` on adjust button
3. **Common ground phase** (`need-mapping-common-ground`): Common ground container with:
   - `common-ground-card` on CommonGroundCard component
   - `continue-to-strategies-button` on continue button
4. **Waiting phase** (`need-mapping-waiting`): Waiting room container

NeedsSection and CommonGroundCard already accepted testID props (lines 28 and 24 respectively), so no child component modifications were needed - only prop passing from parent.

**Verification:** TypeScript compilation passed. Grep confirmed 10 testID assignments across all phases.

### Task 2: Create stage-3-needs fixture and register in index

**Status:** Complete
**Commit:** d94c334

Created `backend/src/fixtures/stage-3-needs.ts` with:

1. **responses array**: 7 chat responses covering Stage 0-1-2 flow (witnessing → feel-heard → empathy building). Reused from reconciler-no-gaps pattern to support SessionBuilder scenarios where fixture ID is set but stages are skipped.

2. **operations object** with two keys:
   - `'extract-needs'`: Returns 3 deterministic needs (CONNECTION, RECOGNITION, SAFETY) with evidence and confidence scores
   - `'common-ground'`: Returns 2 common ground items with insights

Operation key names match backend service parameters exactly:
- `backend/src/services/needs.ts` line 211: `operation: 'extract-needs'`
- `backend/src/services/needs.ts` line 322: `operation: 'common-ground'`

Registered fixture in `backend/src/fixtures/index.ts`:
- Added import for `stage3Needs`
- Added to named exports
- Added to `fixtureRegistry` with ID `'stage-3-needs'`

**Verification:** Fixture loads successfully via `getFixture('stage-3-needs')`, returns correct operation keys `['extract-needs', 'common-ground']` and 7 responses. TypeScript compilation passed.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification criteria passed:

1. `npm run check` passes across all workspaces
2. NeedMappingScreen.tsx contains testIDs for all four phases plus 6 interactive elements (10 total)
3. stage-3-needs fixture loads via `getFixture('stage-3-needs')` and has both required operation keys
4. Fixture operation key names match backend service operation parameters exactly

## Key Decisions

**TestID naming convention:** Used kebab-case following existing project pattern (e.g., `need-mapping-review`, `confirm-needs-button`). This maintains consistency with other testIDs in the codebase.

**Individual NeedCard testIDs:** NeedsSection.tsx already generates per-need testIDs using pattern `need-${need.id}` (line 52). This provides fine-grained access for E2E tests to verify specific needs in the UI.

**Fixture response reuse:** Copied all 7 responses from reconciler-no-gaps fixture to ensure stage-3-needs works in both full-flow and stage-skipping scenarios. This defensive approach prevents fixture lookup failures when SessionBuilder sets fixture ID but skips chat stages.

**Operation key alignment:** The operation keys in the fixture MUST match the strings passed to `getCompletion()` in the backend services. These are part of the fixture lookup contract - any mismatch breaks deterministic testing.

## Output Artifacts

### Created Files
- `backend/src/fixtures/stage-3-needs.ts` - Stage 3 fixture with needs extraction and common ground responses

### Modified Files
- `mobile/src/screens/NeedMappingScreen.tsx` - Added testIDs to all four phase containers and interactive elements
- `backend/src/fixtures/index.ts` - Registered stage-3-needs fixture with ID 'stage-3-needs'

### Key TestIDs Added
- Phase containers: `need-mapping-exploration`, `need-mapping-review`, `need-mapping-common-ground`, `need-mapping-waiting`
- Interactive elements: `needs-section`, `confirm-needs-button`, `adjust-needs-button`, `common-ground-card`, `continue-to-strategies-button`
- Confirmation question container: `needs-confirm-question`

## Next Steps

**For plan 10-02:** Write E2E test that uses these testIDs and fixture to verify:
1. Needs extraction shows review UI with testable needs cards
2. Confirm button advances to common ground phase
3. Common ground card displays with testable content
4. Continue button advances to Stage 4

The foundation is now in place for deterministic Stage 3 E2E testing.

## Self-Check: PASSED

**Created files exist:**
```
FOUND: backend/src/fixtures/stage-3-needs.ts
```

**Modified files exist:**
```
FOUND: mobile/src/screens/NeedMappingScreen.tsx
FOUND: backend/src/fixtures/index.ts
```

**Commits exist:**
```
FOUND: 8edd217 (Task 1: testIDs)
FOUND: d94c334 (Task 2: fixture)
```

**TestIDs verified:**
```
$ grep -c 'testID=' mobile/src/screens/NeedMappingScreen.tsx
10
```

**Fixture verification:**
```
$ Fixture loads: true
$ Operation keys: ['extract-needs', 'common-ground']
$ Response count: 7
```

All artifacts created and committed successfully.
