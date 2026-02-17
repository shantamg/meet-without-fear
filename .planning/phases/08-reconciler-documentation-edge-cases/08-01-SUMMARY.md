---
phase: 08-reconciler-documentation-edge-cases
plan: 01
subsystem: reconciler-documentation
tags: [documentation, e2e-fixtures, state-diagrams, reconciler, test-infrastructure]
completed: 2026-02-17T06:09:21Z
duration_minutes: 5

dependency_graph:
  requires:
    - Phase 6 reconciler implementation
    - Existing fixture system (reconciler-no-gaps pattern)
  provides:
    - State diagrams for all reconciler paths
    - OFFER_OPTIONAL E2E fixture
    - OFFER_SHARING E2E fixture
    - Refinement loop E2E fixture
  affects:
    - Phase 08 Plan 02 (E2E tests will reference these fixtures)
    - Phase 08 Plan 03 (UI implementation will reference state diagrams)

tech_stack:
  added:
    - Mermaid stateDiagram-v2 (14 diagrams)
    - E2E fixtures for reconciler outcomes
  patterns:
    - Per-user state diagrams (not unified swim lanes)
    - Operation-specific fixture mocks
    - Guard-based fixture behavior (refinement)

key_files:
  created:
    - docs/state-diagrams/reconciler-paths.md (638 lines, 14 diagrams)
    - backend/src/fixtures/reconciler-offer-optional.ts
    - backend/src/fixtures/reconciler-offer-sharing.ts
    - backend/src/fixtures/reconciler-refinement.ts
  modified:
    - backend/src/fixtures/index.ts (registry updates)

decisions:
  - Separate diagrams per user perspective (guesser/subject) for each path
  - 14 total diagrams covering PROCEED, OFFER_OPTIONAL, OFFER_SHARING, refinement, accuracy feedback (3 paths), acceptance check
  - Annotate UI elements (panels, buttons, banners) on each state
  - Refinement fixture relies on hasContextAlreadyBeenShared guard for PROCEED behavior
  - All three new fixtures reuse Stage 1+2 responses from reconciler-no-gaps for consistency

metrics:
  tasks_completed: 2
  commits: 2
  files_created: 4
  files_modified: 1
  lines_added: 1579
  tests_passing: 17 (backend fixture tests)
---

# Phase 08 Plan 01: Reconciler State Diagrams & E2E Fixtures Summary

**One-liner:** Documented all reconciler outcome paths with 14 Mermaid state diagrams from both user perspectives and built deterministic E2E fixtures for OFFER_OPTIONAL (moderate gaps), OFFER_SHARING (significant gaps), and refinement loop scenarios.

## What Was Built

### 1. Comprehensive State Diagrams (Task 1)

Created `docs/state-diagrams/reconciler-paths.md` with 14 Mermaid `stateDiagram-v2` diagrams documenting every reconciler path:

**PROCEED Path (no gaps):**
- Guesser perspective: HELD → ANALYZING → READY → REVEALED → VALIDATED
- Subject perspective: STAGE1 → FEELHEARD → STAGE2 → REVEALED → VALIDATED

**OFFER_OPTIONAL Path (moderate gaps):**
- Guesser perspective: HELD → ANALYZING → AWAITING_SHARING → (REFINING or READY) → REVEALED
- Subject perspective: FEELHEARD → TOPIC_OFFERED → (ACCEPT or DECLINE flows) → STAGE2 → REVEALED

**OFFER_SHARING Path (significant gaps):**
- Same structure as OFFER_OPTIONAL but with strong language (orange styling vs blue)
- Guesser sees identical UI (information boundary preserved)

**Refinement Loop:**
- Guesser perspective: AWAITING_SHARING → REFINING → RESUBMIT → ANALYZING → READY (or ACCEPTANCE_CHECK → READY)
- Subject perspective: TOPIC_OFFERED → shares context → STAGE2_CONTINUES → REVEALED

**Accuracy Feedback Paths (post-reveal):**
- Accurate: REVEALED → VALIDATED (immediate)
- Partially Accurate: REVEALED → FEEDBACK_OPTIONAL → VALIDATED
- Inaccurate: REVEALED → INITIAL_THOUGHTS → FEEDBACK_CHAT → CRAFT_FEEDBACK → FEEDBACK_SENT → (NEW_ATTEMPT or PARTNER_ACCEPTS)

**Acceptance Check:**
- Guesser perspective: HAS_CONTEXT → SKIP_REFINEMENT → ACCEPTANCE_QUESTION → (ACCEPT_YES or ACCEPT_NO → COLLECT_REASON) → READY
- Subject perspective: SHARED_CONTEXT → WAITING → (ACCEPTED or NOT_ACCEPTED) → REVEALED

Each diagram annotates what the user sees in the UI (panels, buttons, banners, API calls).

### 2. E2E Fixtures for Reconciler Outcomes (Task 2)

Created three new deterministic E2E fixtures following the reconciler-no-gaps pattern:

**reconciler-offer-optional.ts:**
- Same seed user (Darryl Test) and Stage 1+2 responses as reconciler-no-gaps
- `reconciler-analysis` operation returns: action=OFFER_OPTIONAL, severity=moderate, score=70
- `suggestedShareFocus`: "Work stress and feeling unappreciated"
- `reconciler-share-suggestion` operation provides draft and reason

**reconciler-offer-sharing.ts:**
- Same responses pattern
- `reconciler-analysis` operation returns: action=OFFER_SHARING, severity=significant, score=45
- `suggestedShareFocus`: "The depth of exhaustion and feeling taken for granted at work"
- Stronger language in gaps and draft content

**reconciler-refinement.ts:**
- Same responses pattern
- `reconciler-analysis` returns OFFER_SHARING on first call
- Includes `reconciler-refine-suggestion` operation for guesser refinement flow
- Second reconciler call (after resubmit) would return same OFFER_SHARING, but the `hasContextAlreadyBeenShared` guard (Phase 6 fix) intercepts and marks as READY
- This fixture demonstrates the guard-based refinement completion pattern

All three fixtures registered in `backend/src/fixtures/index.ts` with IDs:
- `'reconciler-offer-optional'`
- `'reconciler-offer-sharing'`
- `'reconciler-refinement'`

## Verification Results

**Type Check:** Backend TypeScript compilation passes
**Tests:** 17/17 fixture tests pass
**Operation Names:** Verified exact match with reconciler.ts:
- `reconciler-analysis` (line 1566)
- `reconciler-share-suggestion` (line 903)
- `reconciler-refine-suggestion` (line 1031)

**Diagram Count:** `grep -c 'stateDiagram-v2'` returns 14 (exceeds minimum of 6)

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

### Fixture Design Pattern
All three new fixtures reuse the exact same Stage 1 witnessing and Stage 2 empathy building responses from `reconciler-no-gaps.ts`. This consistency ensures:
- Deterministic E2E test behavior
- Only the `operations` section differs (reconciler outcomes)
- Easy to reason about fixture differences

### Guard-Based Refinement
The `reconciler-refinement` fixture demonstrates an important pattern: it doesn't need two different `reconciler-analysis` responses. The fixture returns OFFER_SHARING every time, but the `hasContextAlreadyBeenShared` guard in the reconciler service intercepts the second call and marks the empathy as READY. This is the correct production behavior and allows the fixture to be simple.

### State Diagram Annotations
Each state in the diagrams includes a `note` block describing:
- **UI**: What the user sees (panels, buttons, messages)
- **API**: Backend calls made
- **Logged**: Server-side data recorded

This makes the diagrams useful as implementation references for both backend and mobile work.

## Dependencies & Impacts

**Requires:**
- Phase 6 reconciler implementation (reconciler.ts with all actions and guards)
- Existing fixture system pattern (reconciler-no-gaps.ts as template)

**Provides:**
- Foundation for Phase 08 Plan 02 (E2E tests will reference these fixtures by ID)
- Reference for Phase 08 Plan 03 (UI implementation for OFFER_OPTIONAL/OFFER_SHARING panels)
- Documentation fulfilling RECON-DOC-01 and RECON-DOC-02 requirements

**Affects:**
- All future reconciler UI and test work
- Phase 08 Plan 02: E2E tests for reconciler paths (will use these fixtures)
- Phase 08 Plan 03: Guesser refinement UI (will reference refinement diagrams)
- Phase 08 Plan 04: Accuracy feedback panel (will reference accuracy feedback diagrams)

## Key Decisions

1. **Separate per-user diagrams** instead of unified swim lanes - clearer to read and easier to implement from
2. **14 diagrams total** covering all paths from both perspectives - comprehensive reference
3. **Reuse Stage 1+2 responses** across all fixtures - consistency and simplicity
4. **Guard-based refinement completion** in fixture - demonstrates production behavior correctly
5. **Operation names verified** against reconciler.ts source - exact string matching required

## Next Steps

Phase 08 Plan 02 will build Playwright E2E tests for each reconciler path using these fixtures:
- OFFER_OPTIONAL test using `'reconciler-offer-optional'` fixture
- OFFER_SHARING test using `'reconciler-offer-sharing'` fixture
- Refinement loop test using `'reconciler-refinement'` fixture
- Tests will verify UI panels, state transitions, and content persistence per state diagrams

## Files Changed

**Created:**
- `docs/state-diagrams/reconciler-paths.md` (638 lines)
- `backend/src/fixtures/reconciler-offer-optional.ts` (197 lines)
- `backend/src/fixtures/reconciler-offer-sharing.ts` (202 lines)
- `backend/src/fixtures/reconciler-refinement.ts` (237 lines)

**Modified:**
- `backend/src/fixtures/index.ts` (+9 lines for imports and registry)

**Total:** +1,579 lines added

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 16b623b | Create reconciler state diagrams (14 Mermaid diagrams) |
| 2 | 852c8df | Create E2E fixtures for reconciler paths (3 fixtures + registry) |

---

## Self-Check: PASSED

**Files Created:**
- docs/state-diagrams/reconciler-paths.md: FOUND
- backend/src/fixtures/reconciler-offer-optional.ts: FOUND
- backend/src/fixtures/reconciler-offer-sharing.ts: FOUND
- backend/src/fixtures/reconciler-refinement.ts: FOUND

**Commits Exist:**
- 16b623b: FOUND
- 852c8df: FOUND

**Registry Entries:**
- 'reconciler-offer-optional': FOUND in index.ts
- 'reconciler-offer-sharing': FOUND in index.ts
- 'reconciler-refinement': FOUND in index.ts

**Type Check:** PASSED (backend tsc --noEmit)
**Tests:** PASSED (17/17 fixture tests)

All artifacts verified. Plan execution complete.
