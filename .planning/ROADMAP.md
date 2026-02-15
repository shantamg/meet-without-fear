# Roadmap: Meet Without Fear

## Overview

Transform partner sessions from fragile to reliable by completing a systematic audit of Stages 0-2 interaction paths, building two-browser E2E test infrastructure with real Ably, fixing identified issues in stage transitions and reconciler, and proving both users can reliably reach Stage 3 together.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Audit** - Document all two-user interaction paths in Stages 0-2
- [x] **Phase 2: Test Infrastructure** - Build two-browser E2E test infrastructure with mocked LLM and real Ably
- [x] **Phase 3: Stage 0-1 Test Coverage** - Two-browser E2E tests for Stages 0-1
- [x] **Phase 4: Stage 2 Test Coverage** - Two-browser E2E tests for Stage 2 (empathy/reconciler)
- [x] **Phase 5: Stage Transition Fixes** - Fix stage transition cache updates and partner notifications
- [x] **Phase 6: Reconciler Fixes** - Fix reconciler reliability and post-reconciliation state
- [x] **Phase 7: End-to-End Verification** - Prove both users can reliably reach Stage 3

## Phase Details

### Phase 1: Audit
**Goal**: Complete understanding of every two-user interaction path, stage transition, and cache update location in Stages 0-2
**Depends on**: Nothing (first phase)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. Every two-user interaction path in Stages 0-2 is documented with expected behavior for both users
  2. Every stage transition trigger maps to documented outcomes (cache, DB, Ably events, UI) for both users
  3. Reconciler state machine shows all valid transitions and expected outcomes
  4. Every manual cache update location is identified with verification of correctness
  5. Known gaps/issues are flagged for later phases
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Audit Stage 0-1 two-user interaction paths and transitions
- [x] 01-02-PLAN.md — Audit reconciler state machine
- [x] 01-03-PLAN.md — Audit Stage 2 two-user interaction paths and transitions
- [x] 01-04-PLAN.md — Audit cache update locations and correctness verification

### Phase 2: Test Infrastructure
**Goal**: Two-browser E2E test infrastructure with mocked LLM and real Ably that navigates full UI from scratch
**Depends on**: Phase 1
**Requirements**: TEST-05
**Success Criteria** (what must be TRUE):
  1. Two browser contexts can connect to same session via real Ably
  2. Mocked LLM responses use TypeScript fixtures for deterministic AI interactions
  3. Tests navigate full UI from scratch (no DB seeding for test setup)
  4. Infrastructure supports writing tests for any stage transition or partner interaction
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Create TwoBrowserHarness class and waitForPartnerUpdate helper
- [x] 02-02-PLAN.md — Create two-browser Playwright config and smoke test

### Phase 3: Stage 0-1 Test Coverage
**Goal**: Two-browser E2E tests verify both users can complete Stages 0-1 together
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Test verifies both users can sign compact and both enter witnessing (Stage 0)
  2. Test verifies invitation send, acceptance, conversation, and both users confirming feel-heard (Stage 1)
  3. Tests pass with current implementation (documenting actual behavior, not ideal)
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — Two-browser E2E tests for Stage 0 (compact signing) and Stage 1 (feel-heard flow)

### Phase 4: Stage 2 Test Coverage
**Goal**: Two-browser E2E tests verify empathy sharing and reconciler flow through Stage 3 entry
**Depends on**: Phase 3
**Requirements**: TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Test verifies empathy draft, share, partner receives, reconciler runs (Stage 2)
  2. Test verifies both users enter Stage 3
  3. Tests document any failures (expected, given known issues)
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Two-browser E2E test for Stage 2 (empathy sharing, reconciler no-gaps, validation, Stage 3 entry)

### Phase 5: Stage Transition Fixes
**Goal**: Stage transitions update cache correctly for both users and trigger proper UI updates
**Depends on**: Phase 4
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-04
**Success Criteria** (what must be TRUE):
  1. User who triggers transition sees immediate cache update and correct UI panels
  2. Partner receives Ably notification and their cache/UI updates correctly
  3. Feel-heard confirmation advances both users' stages and shows correct panels
  4. Empathy sharing triggers reconciler and both users see post-reconciliation UI
  5. Stage 0-1 tests continue to pass (no regressions)
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — Fix partner cache updates for stage transitions and add Stage 0 Ably events
- [x] 05-02-PLAN.md — E2E regression verification for stage transition fixes

### Phase 6: Reconciler Fixes
**Goal**: Reconciler runs reliably without race conditions and advances both users toward Stage 3
**Depends on**: Phase 5
**Requirements**: RECON-01, RECON-02, RECON-03
**Success Criteria** (what must be TRUE):
  1. Reconciler runs reliably when triggered (no race conditions)
  2. Reconciler results are stored in DB and accessible to both users
  3. Post-reconciliation state correctly advances both users toward Stage 3
  4. Stage 2 tests pass with fixed reconciler behavior
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — Fix infinite share loop guard and ReconcilerResult visibility race
- [x] 06-02-PLAN.md — E2E regression verification for reconciler fixes

### Phase 7: End-to-End Verification
**Goal**: Both users can reliably complete Stages 0-2 and enter Stage 3 together (repeatable proof)
**Depends on**: Phase 6
**Requirements**: VERIF-01, VERIF-02
**Success Criteria** (what must be TRUE):
  1. Full two-browser E2E test passes from session start through Stage 3 entry for both users
  2. Test passes 3 consecutive runs without flakiness
  3. All 18 v1 requirements are satisfied
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md — Full-flow E2E test with 3-run repeatability verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audit | 4/4 | ✓ Complete | 2026-02-14 |
| 2. Test Infrastructure | 2/2 | ✓ Complete | 2026-02-14 |
| 3. Stage 0-1 Test Coverage | 1/1 | ✓ Complete | 2026-02-14 |
| 4. Stage 2 Test Coverage | 1/1 | ✓ Complete | 2026-02-14 |
| 5. Stage Transition Fixes | 2/2 | ✓ Complete | 2026-02-15 |
| 6. Reconciler Fixes | 2/2 | ✓ Complete | 2026-02-15 |
| 7. End-to-End Verification | 1/1 | ✓ Complete | 2026-02-15 |

---
*Roadmap created: 2026-02-14*
*Last updated: 2026-02-15 (Phase 7 complete — all phases done)*
