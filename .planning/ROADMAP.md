# Roadmap: Meet Without Fear

## Milestones

- ✅ **v1.0 Session Reliability** — Phases 1-7 (shipped 2026-02-15)
- 🚧 **v1.1 Full Session Completion** — Phases 8-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Session Reliability (Phases 1-7) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Audit (4/4 plans) — completed 2026-02-14
- [x] Phase 2: Test Infrastructure (2/2 plans) — completed 2026-02-14
- [x] Phase 3: Stage 0-1 Test Coverage (1/1 plan) — completed 2026-02-14
- [x] Phase 4: Stage 2 Test Coverage (1/1 plan) — completed 2026-02-14
- [x] Phase 5: Stage Transition Fixes (2/2 plans) — completed 2026-02-15
- [x] Phase 6: Reconciler Fixes (2/2 plans) — completed 2026-02-15
- [x] Phase 7: End-to-End Verification (1/1 plan) — completed 2026-02-15

See: `milestones/v1.0-ROADMAP.md` for full details.

</details>

### 🚧 v1.1 Full Session Completion (In Progress)

**Milestone Goal:** All reconciler patterns (NO_GAPS, OFFER_OPTIONAL, OFFER_SHARING, refinement) work correctly for both users with visual proof, plus Stage 3-4 reliability — so both users can complete an entire session end-to-end.

#### Phase 8: Reconciler Documentation & Edge Cases
**Goal:** All reconciler patterns (OFFER_OPTIONAL, OFFER_SHARING, refinement) are documented and verified with E2E tests
**Depends on:** Phase 7 (v1.0 complete)
**Requirements:** RECON-DOC-01, RECON-DOC-02, RECON-EC-01, RECON-EC-02, RECON-EC-03, RECON-EC-05, RECON-VIS-01, RECON-VIS-02
**Success Criteria** (what must be TRUE):
  1. State diagrams document both user perspectives for OFFER_OPTIONAL and OFFER_SHARING outcomes
  2. E2E tests verify OFFER_OPTIONAL path (accept/decline/refine)
  3. E2E tests verify OFFER_SHARING path (share context, receive context, refine)
  4. Playwright screenshots capture share suggestion panels and refinement prompts
  5. Context-already-shared guard prevents duplicate shares
**Plans:** 4 plans

Plans:
- [ ] 08-01-PLAN.md -- State diagrams + reconciler fixtures (OFFER_OPTIONAL, OFFER_SHARING, refinement)
- [ ] 08-02-PLAN.md -- ShareTopicDrawer + decline dialog + chat re-animation bug fix
- [ ] 08-03-PLAN.md -- Accuracy feedback inaccurate path + guesser refinement UI + acceptance check
- [ ] 08-04-PLAN.md -- E2E tests for all reconciler paths with Playwright screenshots

#### Phase 9: Circuit Breaker Implementation
**Goal:** Refinement loops are bounded with automatic safety mechanism
**Depends on:** Phase 8 (can run in parallel)
**Requirements:** RECON-EC-04
**Success Criteria** (what must be TRUE):
  1. Backend tracks refinement attempts per direction (A→B, B→A separately)
  2. After 3 refinement attempts, reconciler forces READY status
  3. E2E test verifies loop prevention (4th attempt skips reconciler)
**Plans:** 2 plans

Plans:
- [ ] 09-01-PLAN.md -- Database model + circuit breaker logic + unit tests (TDD)
- [ ] 09-02-PLAN.md -- E2E fixture + two-browser circuit breaker test with screenshots

#### Phase 10: Stage 3 (Needs) Verification
**Goal:** Both users can complete needs extraction, consent, and common ground analysis
**Depends on:** Phase 8 (test patterns established)
**Requirements:** NEEDS-01, NEEDS-02, NEEDS-03, NEEDS-04
**Success Criteria** (what must be TRUE):
  1. Both users can view AI-extracted needs and confirm/edit them
  2. Both users complete mutual consent flow for needs sharing
  3. Common ground analysis runs and displays matched needs to both users
  4. Playwright screenshots capture needs panel and common ground visualization
**Plans:** 2/2 plans complete

Plans:
- [ ] 10-01-PLAN.md -- Add testIDs to Stage 3 UI components + create stage-3-needs fixture
- [ ] 10-02-PLAN.md -- Two-browser E2E test for complete Stage 3 flow with screenshots

#### Phase 11: Stage 4 (Strategies) Verification
**Goal:** Both users can complete strategy collection, ranking, and agreement
**Depends on:** Phase 10
**Requirements:** STRAT-01, STRAT-02, STRAT-03, STRAT-04, STRAT-05
**Success Criteria** (what must be TRUE):
  1. Both users can contribute strategy suggestions to anonymous pool
  2. Both users can rank strategies independently
  3. Overlap reveal shows agreed strategies to both users
  4. Both users confirm final agreement
  5. Playwright screenshots capture strategy pool, ranking interface, and agreement states
**Plans:** 2/2 plans complete

Plans:
- [ ] 11-01-PLAN.md -- Stage 4 fixture creation and registration
- [ ] 11-02-PLAN.md -- Two-browser E2E test for complete Stage 4 flow with screenshots

#### Phase 12: Visual Regression Baselines
**Goal:** Visual regression testing infrastructure established with proper baselines
**Depends on:** Phases 8, 10, 11 (needs correct UI states)
**Requirements:** RECON-VIS-03, RECON-VIS-04, E2E-03
**Success Criteria** (what must be TRUE):
  1. All reconciler screenshots use toHaveScreenshot() assertions with tolerance configuration
  2. All Stage 3-4 screenshots use toHaveScreenshot() assertions
  3. Baseline images committed with proper masking for dynamic content
  4. Documentation exists for baseline update process
**Plans:** 2 plans

Plans:
- [ ] 12-01-PLAN.md -- Playwright config + reconciler screenshot conversions (RECON-VIS-03, RECON-VIS-04)
- [ ] 12-02-PLAN.md -- Stage 3-4 screenshot conversions + baseline update documentation (E2E-03)

#### Phase 13: Full Session E2E Verification
**Goal:** Complete two-user session flow verified from start to Stage 4 completion
**Depends on:** Phases 8-12 (all components verified)
**Requirements:** E2E-01, E2E-02
**Success Criteria** (what must be TRUE):
  1. Two-browser E2E test completes full session (Stage 0 → Stage 4) for both users
  2. E2E tests pass for all reconciler edge cases (OFFER_OPTIONAL, OFFER_SHARING)
  3. Test suite runs reliably without flakiness (3 consecutive passes)
**Plans:** TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9 → 10 → 11 → 12 → 13

| Phase                  | Milestone | Plans Complete | Status       | Completed  |
|------------------------|-----------|----------------|--------------|------------|
| 1. Audit               | v1.0      | 4/4            | Complete     | 2026-02-14 |
| 2. Test Infra          | v1.0      | 2/2            | Complete     | 2026-02-14 |
| 3. Stage 0-1           | v1.0      | 1/1            | Complete     | 2026-02-14 |
| 4. Stage 2             | v1.0      | 1/1            | Complete     | 2026-02-14 |
| 5. Transitions         | v1.0      | 2/2            | Complete     | 2026-02-15 |
| 6. Reconciler          | v1.0      | 2/2            | Complete     | 2026-02-15 |
| 7. E2E Verify          | v1.0      | 1/1            | Complete     | 2026-02-15 |
| 8. Reconciler Patterns | v1.1      | 0/4            | Planning     | -          |
| 9. Circuit Breaker     | v1.1      | 0/TBD          | Not started  | -          |
| 10. Stage 3 Needs      | v1.1      | Complete    | 2026-02-17 | -          |
| 11. Stage 4 Strategies | v1.1      | Complete    | 2026-02-17 | -          |
| 12. Visual Baselines   | v1.1      | 0/TBD          | Not started  | -          |
| 13. Full Session E2E   | v1.1      | 0/TBD          | Not started  | -          |

---
*Roadmap created: 2026-02-14*
*Last updated: 2026-02-15 (v1.1 phases added)*
