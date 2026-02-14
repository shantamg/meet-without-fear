# Requirements: Meet Without Fear

**Defined:** 2026-02-14
**Core Value:** Two people can reliably complete a full partner session together — every stage transition, partner interaction, and reconciliation step works predictably every time.

## v1 Requirements

Requirements for Session Reliability milestone. Each maps to roadmap phases.

### Audit

- [ ] **AUDIT-01**: Document every two-user interaction path in Stages 0-2 with expected behavior at each step
- [ ] **AUDIT-02**: Map every stage transition trigger and what should happen for BOTH users (cache, DB, Ably events, UI)
- [ ] **AUDIT-03**: Document reconciler state machine with all valid transitions and expected outcomes
- [ ] **AUDIT-04**: Identify every location where manual cache updates are required and verify correctness

### E2E Test Coverage

- [ ] **TEST-01**: Two-browser E2E test covers full Stage 0 flow (both users sign compact, both enter witnessing)
- [ ] **TEST-02**: Two-browser E2E test covers Stage 1 flow (invitation, acceptance, both converse, both feel-heard)
- [ ] **TEST-03**: Two-browser E2E test covers Stage 2 flow (empathy draft, share, partner receives, reconciler runs)
- [ ] **TEST-04**: Two-browser E2E test verifies both users enter Stage 3
- [ ] **TEST-05**: All tests use mocked LLM with fixtures and real Ably, navigating full UI from scratch

### Stage Transition Fixes

- [ ] **TRANS-01**: Stage transitions update cache correctly for the user who triggers the transition
- [ ] **TRANS-02**: Stage transitions notify partner via Ably and partner's cache/UI updates correctly
- [ ] **TRANS-03**: Feel-heard confirmation advances stages and shows correct panels for both users
- [ ] **TRANS-04**: Empathy sharing triggers reconciler and both users see appropriate post-reconciliation UI

### Reconciler Fixes

- [ ] **RECON-01**: Reconciler runs reliably when triggered (no race conditions)
- [ ] **RECON-02**: Reconciler results are stored and accessible to both users
- [ ] **RECON-03**: Post-reconciliation state advances both users toward Stage 3

### Verification

- [ ] **VERIF-01**: Full two-browser E2E test passes: both users complete Stages 0-2 and enter Stage 3
- [ ] **VERIF-02**: Test is repeatable (passes 3 consecutive runs without flakiness)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Stage 3-4 Reliability

- **STAGE34-01**: Two-browser E2E test covers Stage 3 (Needs identification) for both users
- **STAGE34-02**: Two-browser E2E test covers Stage 4 (Strategies) for both users
- **STAGE34-03**: Full session completion verified end-to-end (all 5 stages)

### Architecture Simplification

- **ARCH-01**: Centralized stage transition hook that enforces cache update pattern
- **ARCH-02**: Type-safe query key factory to prevent cache key mismatches
- **ARCH-03**: Reconciler state machine formalized with explicit state library (e.g., XState)

### Test Coverage

- **TCOV-01**: Unit tests for ai-orchestrator, context-assembler, reconciler
- **TCOV-02**: Integration tests for critical backend service chains

## Out of Scope

| Feature | Reason |
|---------|--------|
| Stage 3-4 fixes | Never reached Stage 3 yet; fix Stages 0-2 first |
| New features | Reliability milestone, not feature work |
| Performance optimization | Correctness before speed |
| Mobile-native testing | Web E2E testing sufficient for interaction pattern verification |
| UI/UX changes | No visual changes unless required to fix a bug |
| Architecture rewrite | May happen organically during fixes, but not a goal in itself |
| Unit test backfill | Valuable but separate effort; E2E tests are the priority |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIT-01 | Phase 1 | Pending |
| AUDIT-02 | Phase 1 | Pending |
| AUDIT-03 | Phase 1 | Pending |
| AUDIT-04 | Phase 1 | Pending |
| TEST-05 | Phase 2 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| TRANS-01 | Phase 5 | Pending |
| TRANS-02 | Phase 5 | Pending |
| TRANS-03 | Phase 5 | Pending |
| TRANS-04 | Phase 5 | Pending |
| RECON-01 | Phase 6 | Pending |
| RECON-02 | Phase 6 | Pending |
| RECON-03 | Phase 6 | Pending |
| VERIF-01 | Phase 7 | Pending |
| VERIF-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
