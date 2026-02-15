# Project Research Summary

**Project:** Meet Without Fear - v1.1 Milestone
**Domain:** E2E Test Infrastructure + Reconciler State Machine + Stage 3-4 Integration
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone focuses on three integrated areas: reconciler edge cases, Stage 3-4 reliability, and visual verification. Research reveals a critical finding: the codebase does NOT use GAPS_FOUND or NEEDS_WORK as active database statuses. Instead, the reconciler uses AWAITING_SHARING and REFINING statuses with reconciler actions (PROCEED, OFFER_OPTIONAL, OFFER_SHARING). This suggests the milestone requirements may reference legacy terminology or require clarification.

The existing architecture is mature and complete. Playwright 1.50.0 already includes all necessary capabilities for screenshot verification—no new dependencies required. Stage 3-4 backend and mobile code is fully implemented with DTOs, hooks, components, and Ably events. The primary work is extending E2E tests to cover reconciler edge cases and Stage 3-4 flows, capturing screenshots at checkpoints, and verifying cache invalidation patterns.

The main risk is baseline corruption from unreviewed visual test updates. Prevention requires strict PR review of all baseline changes, descriptive naming conventions, and two-phase verification (API state + UI state + screenshot). Additional risks include infinite refinement loops (needs circuit breaker after 3 attempts) and cache staleness from missing Ably invalidation handlers.

## Key Findings

### Recommended Stack

NO new dependencies required. Playwright 1.50.0 already includes all necessary capabilities for the milestone.

**Core technologies:**
- **Playwright 1.50.0**: Built-in visual testing with toHaveScreenshot(), pixel comparison, and baseline management—no external services needed
- **TypeScript 5.7-5.9**: Type-safe state machine transitions already enforced by existing type system
- **React Query + Ably**: Cache-first architecture with real-time invalidation handles async state transitions
- **Jest 29.7.0**: Backend unit tests for reconciler state machine logic isolation

**Existing infrastructure (no additions):**
- TwoBrowserHarness: Parallel user contexts for reconciler testing
- SessionBuilder: State factory for starting at specific states
- Test Fixtures: Mocked LLM responses for deterministic outcomes
- Screenshot Directory: test-results/ for visual verification

### Expected Features

**Already built (verify functionality):**
- AWAITING_SHARING flow: Share suggestion generation, context sharing, status transitions
- REFINING flow: Empathy attempt refinement with new context
- Stage 3 needs: AI extraction, confirmation, consent, common ground matching
- Stage 4 strategies: Proposal, anonymous pool, ranking, overlap calculation, agreement

**Build next (missing E2E coverage):**
1. **Reconciler edge case tests**
   - OFFER_OPTIONAL path (accept/decline/refine)
   - OFFER_SHARING path (same flow, different UI tone)
   - Circuit breaker after 3 refinement attempts
   - Context already shared detection
   - Visual regression: share suggestion panels, refinement prompts, validation buttons

2. **Stage 3-4 E2E tests**
   - Needs extraction and confirmation
   - Common ground analysis and mutual consent
   - Strategy collection and anonymous pool display
   - Ranking submission and overlap reveal
   - Agreement creation and mutual confirmation

3. **Screenshot checkpoints**
   - Empathy validation buttons (post-reconciler)
   - Share suggestion drawer (AWAITING_SHARING)
   - Refinement prompt (REFINING)
   - Needs panel (Stage 3)
   - Common ground visualization (Stage 3)
   - Strategy pool (Stage 4)
   - Overlap reveal (Stage 4)
   - Agreement confirmation (Stage 4)

**Defer:**
- Refinement timeout/escalation flows
- Visual regression for all UI components (focus on reconciler and Stage 3-4 only)
- Cross-browser testing beyond Chromium

### Architecture Approach

The reconciler uses a state machine (HELD → ANALYZING → AWAITING_SHARING/READY → REFINING → REVEALED) with asymmetric processing (A understanding B, B understanding A run independently). React Query cache-first pattern ensures UI derives from cache, not local state. Ably events trigger cache invalidation for partner updates. Playwright screenshots integrate via two-browser E2E tests at key checkpoints.

**Major components:**
1. **Reconciler Service** (backend/src/services/reconciler.ts) — Analyzes empathy gaps, generates share suggestions, manages refinement loops
2. **React Query Hooks** (mobile/src/hooks/useStages.ts) — Optimistic updates for all mutations, cache invalidation on Ably events
3. **Ably Event System** (backend/src/services/realtime.ts) — Publishes empathy.status_updated, empathy.revealed, partner.* events for cross-user synchronization
4. **TwoBrowserHarness** (e2e/helpers/two-browser-harness.ts) — Parallel user contexts for reconciler and Stage 3-4 testing
5. **Screenshot Capture** (Playwright page.screenshot()) — Visual verification at reconciler checkpoints and stage transitions

### Critical Pitfalls

1. **Baseline Corruption from Unreviewed Updates** — Developer runs --update-snapshots without reviewing diffs, commits wrong baselines, future regressions pass as "expected." Prevention: All baseline updates require manual review in PR with descriptive commit messages. Use npx playwright show-report before updating baselines.

2. **Flaky Tests from Dynamic Content** — Timestamps, typing indicators, animations cause screenshots to differ between runs. Prevention: Always mask dynamic elements (timestamps, typing indicators, Ably presence) using data-testid attributes. Disable animations and wait for them to settle before screenshots.

3. **Stale Cache Causing State Mismatches** — Test verifies reconciler state via API (REFINING) but UI shows old state (HELD) because Ably event didn't invalidate cache. Prevention: Always invalidate cache on Ably events. Use two-phase verification: API assertion → UI assertion → screenshot.

4. **Infinite Reconciler Loop Without Circuit Breaker** — User A refines empathy, reconciler still finds gaps, suggests sharing again, loop repeats indefinitely. Prevention: Add backend counter for refinement attempts, force READY status after 3 attempts.

5. **Full-Page Screenshots Causing Baseline Explosion** — Every UI change anywhere on page causes visual test to fail, baselines become unmaintainable. Prevention: Use element-level screenshots (locator.screenshot()) instead of page screenshots. Test UI components, not layouts.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Reconciler Edge Case E2E Tests
**Rationale:** Build on existing two-browser test infrastructure. AWAITING_SHARING and REFINING flows already implemented in backend, need E2E verification.

**Delivers:** Complete E2E coverage for reconciler state machine with visual verification

**Implements:**
- Tests for OFFER_OPTIONAL path (accept/decline)
- Tests for OFFER_SHARING path (accept/decline)
- Refinement flow test (REFINING → resubmit → reconciler re-runs)
- Screenshot capture at checkpoints (share suggestion drawer, refinement prompt, validation buttons)
- Fixture creation for deterministic reconciler outcomes

**Avoids:**
- Pitfall 3: Two-phase verification (API + UI + screenshot) prevents stale cache issues
- Pitfall 2: Mask timestamps and animations in share suggestion panels
- Pitfall 5: Use element-level screenshots for validation buttons, not full page

**Estimated effort:** 4-6 hours (existing harness simplifies setup)

### Phase 2: Circuit Breaker Implementation
**Rationale:** Prevents infinite refinement loops discovered in research. Backend unit tests verify logic before E2E integration.

**Delivers:** Safety mechanism limiting refinement attempts to 3 per direction

**Implements:**
- Backend counter for refinement attempts (prisma query count)
- Force READY status after 3 attempts with system message
- Backend unit tests for circuit breaker logic
- E2E test verifying loop prevention

**Avoids:**
- Pitfall 4: Infinite reconciler loop (critical for production reliability)

**Estimated effort:** 2-3 hours (straightforward counter logic)

### Phase 3: Stage 3-4 E2E Extension
**Rationale:** Backend and mobile code complete (DTOs, hooks, components exist). Needs E2E verification with screenshot checkpoints.

**Delivers:** Full flow test from Stage 0 → Stage 4 (session resolution)

**Implements:**
- Extend existing two-browser full-flow test to Stage 3
- Needs extraction, confirmation, common ground
- Stage 4 strategy collection, ranking, overlap reveal
- Agreement creation and mutual confirmation
- Screenshot checkpoints at each stage transition

**Avoids:**
- Pitfall 3: Verify Ably events trigger cache invalidation for partner.needs_shared, partner.ranking_submitted
- Pitfall 2: Mask dynamic content in needs and strategy panels

**Estimated effort:** 6-8 hours (follows existing test plan in implementation/stage-3-4-e2e-completion-plan.md)

### Phase 4: Visual Regression Baseline Setup
**Rationale:** Establish baseline images with proper masking and tolerance configuration. Must be done after E2E tests verify correct UI states.

**Delivers:** Baseline screenshots for all reconciler and Stage 3-4 checkpoints

**Implements:**
- Replace page.screenshot() with toHaveScreenshot() assertions
- Configure playwright.config.ts with tolerance (maxDiffPixels: 100, threshold: 0.2)
- Generate baselines on macOS and Linux (cross-platform)
- Document baseline update process in PR template

**Avoids:**
- Pitfall 1: Baseline corruption (strict PR review process)
- Pitfall 4: Platform differences (separate baselines per OS)

**Estimated effort:** 3-4 hours (configuration + baseline generation)

### Phase Ordering Rationale

- **Phase 1 first** because it extends existing two-browser tests with minimal new infrastructure. Verifies backend reconciler logic through E2E paths.
- **Phase 2 second** because circuit breaker is independent, can be developed in parallel with Phase 1. Backend unit tests provide quick validation before E2E integration.
- **Phase 3 third** because it builds on Phase 1 patterns (two-browser harness, screenshot capture). Stage 3-4 code already exists, just needs test coverage.
- **Phase 4 last** because visual baselines must be established AFTER E2E tests verify correct UI states. Premature baseline generation leads to corruption.

**Dependencies:**
- Phase 3 depends on Phase 1 (same test harness patterns)
- Phase 4 depends on Phases 1+3 (needs correct UI states)
- Phase 2 is independent (can run parallel to Phase 1)

### Research Flags

**Needs research:**
- **None** — All patterns well-documented in existing codebase. Playwright visual testing is standard, reconciler state machine is simple (4 outcomes).

**Standard patterns (skip research-phase):**
- **Phase 1-3** — Follow existing two-browser test patterns from e2e/tests/two-browser-*.spec.ts
- **Phase 4** — Use Playwright official docs for toHaveScreenshot() configuration

**Clarification needed:**
- **GAPS_FOUND and NEEDS_WORK statuses** — Are these legacy references or new features? Current codebase uses AWAITING_SHARING and REFINING. Recommend clarifying with product owner before Phase 1.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified in package.json. Playwright 1.50.0 capabilities confirmed via official docs + 2026 implementation guides. No new dependencies needed. |
| Features | HIGH | Backend and mobile code already exists for reconciler (services/reconciler.ts) and Stage 3-4 (services/needs.ts, strategies.ts). Only E2E tests missing. |
| Architecture | HIGH | Cache-first React Query pattern documented in CLAUDE.md memory. Ably event system verified in codebase. Two-browser harness patterns established in existing tests. |
| Pitfalls | HIGH | Based on Playwright official docs, 2026 best practices guides, and project-specific patterns (cache invalidation, two-phase verification from existing tests). |

**Overall confidence:** HIGH

### Gaps to Address

**Critical terminology clarification:**
- **GAPS_FOUND and NEEDS_WORK** — Milestone requirements use these terms but codebase uses AWAITING_SHARING and REFINING. Recommend treating as legacy references and mapping to current statuses in documentation.

**Open questions:**
- **Screenshot retention policy** — Should baselines be archived for visual regression history or only kept temporarily? Current: test-results/ gitignored, baselines committed. Recommend: Keep baselines in git, archive test-results/ on CI.
- **Mood check appearing in tests** — Workaround exists (click through), but root cause unknown. Low priority for v1.1 but should investigate before v2.0.

**Validation during implementation:**
- Verify circuit breaker counter logic doesn't conflict with asymmetric reconciler (A→B and B→A tracked separately)
- Confirm Ably event subscriptions exist for all Stage 3-4 partner actions (needs_shared, ranking_submitted, agreement_confirmed)
- Test baseline cross-platform differences (macOS vs Linux CI) before committing final baselines

## Sources

### Primary (HIGH confidence)
- `backend/src/services/reconciler.ts` — Reconciler state machine implementation
- `shared/src/dto/empathy.ts` — EmpathyStatus enum (confirms AWAITING_SHARING/REFINING, not GAPS_FOUND/NEEDS_WORK)
- `mobile/src/hooks/useStages.ts` — React Query hooks for all stages
- `e2e/tests/two-browser-stage-2.spec.ts` — Screenshot capture patterns
- `CLAUDE.md` — Cache-first architecture, panel display patterns
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots) — Official docs
- [Playwright SnapshotAssertions API](https://playwright.dev/docs/api/class-snapshotassertions) — Official API reference

### Secondary (MEDIUM confidence)
- `implementation/stage-3-4-e2e-completion-plan.md` — Stage 3-4 architecture overview (planned, not yet implemented in E2E)
- [Visual Regression Testing with Playwright Snapshots](https://nareshit.com/blogs/visual-regression-testing-with-playwright-snapshots) — 2026 implementation guide
- [How to Implement Playwright Visual Testing](https://oneuptime.com/blog/post/2026-01-27-playwright-visual-testing/view) — 2026 best practices
- [Snapshot Testing with Playwright in 2026](https://www.browserstack.com/guide/playwright-snapshot-testing) — Baseline management patterns

### Tertiary (LOW confidence)
- None — All findings verified against primary sources (codebase + official docs)

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
