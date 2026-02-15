# Requirements: Meet Without Fear

**Defined:** 2026-02-15
**Core Value:** Two people can reliably complete a full partner session together — every stage transition, partner interaction, and reconciliation step works predictably every time.

## v1.1 Requirements

Requirements for Full Session Completion milestone. Each maps to roadmap phases.

### Reconciler State Documentation

- [ ] **RECON-DOC-01**: State diagrams document what each user sees at every reconciler step (OFFER_OPTIONAL, OFFER_SHARING, refinement, reveal)
- [ ] **RECON-DOC-02**: State diagrams document both the guesser and subject perspectives for each reconciler outcome

### Reconciler Edge Cases

- [ ] **RECON-EC-01**: OFFER_OPTIONAL flow works end-to-end — user can accept, decline, or refine empathy when reconciler finds minor gaps
- [ ] **RECON-EC-02**: OFFER_SHARING flow works end-to-end — user receives share suggestion, shares context, partner sees shared context
- [ ] **RECON-EC-03**: Refinement flow works — user updates empathy after receiving shared context, reconciler re-runs
- [ ] **RECON-EC-04**: Circuit breaker limits refinement to 3 attempts per direction, then forces READY status
- [ ] **RECON-EC-05**: Context-already-shared guard prevents duplicate shares when navigating between chat and share page

### Reconciler Visual Verification

- [ ] **RECON-VIS-01**: Playwright screenshots capture share suggestion panel for both users
- [ ] **RECON-VIS-02**: Playwright screenshots capture refinement prompt state for both users
- [ ] **RECON-VIS-03**: Playwright screenshots capture validation buttons (post-reconciler) for both users
- [ ] **RECON-VIS-04**: Playwright screenshots capture empathy reveal state for both users

### Stage 3 (Needs)

- [ ] **NEEDS-01**: Both users can view AI-extracted needs and confirm/edit them
- [ ] **NEEDS-02**: Both users complete needs consent flow
- [ ] **NEEDS-03**: Common ground analysis runs and results display for both users
- [ ] **NEEDS-04**: Playwright screenshots capture needs panel and common ground visualization

### Stage 4 (Strategies)

- [ ] **STRAT-01**: Both users can view and contribute strategy suggestions
- [ ] **STRAT-02**: Both users can rank strategies
- [ ] **STRAT-03**: Overlap reveal shows agreed strategies to both users
- [ ] **STRAT-04**: Both users can confirm agreement
- [ ] **STRAT-05**: Playwright screenshots capture strategy pool, ranking, and agreement states

### End-to-End Verification

- [ ] **E2E-01**: Full two-browser E2E test passes from session start through Stage 4 completion for both users
- [ ] **E2E-02**: Reconciler edge case E2E tests pass for OFFER_OPTIONAL and OFFER_SHARING paths
- [ ] **E2E-03**: Visual regression baselines established with toHaveScreenshot() assertions

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Architecture Simplification

- **ARCH-01**: Centralized stage transition hook that enforces cache update pattern
- **ARCH-02**: Type-safe query key factory to prevent cache key mismatches
- **ARCH-03**: Reconciler state machine formalized with explicit state library (e.g., XState)

### Test Coverage

- **TCOV-01**: Unit tests for ai-orchestrator, context-assembler, reconciler
- **TCOV-02**: Integration tests for critical backend service chains

### Refinement Enhancements

- **REFINE-01**: Refinement timeout/escalation flows
- **REFINE-02**: Auto-save empathy drafts during refinement

## Out of Scope

| Feature | Reason |
|---------|--------|
| Performance optimization | Correctness first |
| Mobile-native testing (Android/iOS) | Web E2E testing sufficient |
| Cross-browser testing beyond Chromium | Chromium covers primary use case |
| Person deletion, inner thoughts linking | Deferred features, not reliability |
| Architecture rewrite (XState, centralized hooks) | May happen organically during fixes |
| Visual regression for all UI components | Focus only on reconciler + Stage 3-4 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RECON-DOC-01 | Phase 8 | Pending |
| RECON-DOC-02 | Phase 8 | Pending |
| RECON-EC-01 | Phase 8 | Pending |
| RECON-EC-02 | Phase 8 | Pending |
| RECON-EC-03 | Phase 8 | Pending |
| RECON-EC-05 | Phase 8 | Pending |
| RECON-VIS-01 | Phase 8 | Pending |
| RECON-VIS-02 | Phase 8 | Pending |
| RECON-EC-04 | Phase 9 | Pending |
| NEEDS-01 | Phase 10 | Pending |
| NEEDS-02 | Phase 10 | Pending |
| NEEDS-03 | Phase 10 | Pending |
| NEEDS-04 | Phase 10 | Pending |
| STRAT-01 | Phase 11 | Pending |
| STRAT-02 | Phase 11 | Pending |
| STRAT-03 | Phase 11 | Pending |
| STRAT-04 | Phase 11 | Pending |
| STRAT-05 | Phase 11 | Pending |
| RECON-VIS-03 | Phase 12 | Pending |
| RECON-VIS-04 | Phase 12 | Pending |
| E2E-03 | Phase 12 | Pending |
| E2E-01 | Phase 13 | Pending |
| E2E-02 | Phase 13 | Pending |

**Coverage:**
- v1.1 requirements: 23 total
- Mapped to phases: 23/23 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after roadmap creation*
