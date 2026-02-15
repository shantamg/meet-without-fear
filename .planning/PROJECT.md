# Meet Without Fear

## What This Is

A mobile app that guides two people through structured conflict resolution conversations. An AI mediator helps each person feel heard, develops empathy for the other's perspective, identifies needs, and suggests strategies — progressing through 5 stages (Onboarding, Witnessing, Empathy, Needs, Strategies). Two-browser E2E tests verify both users can reliably complete Stages 0-2 together.

## Core Value

Two people can reliably complete a full partner session together — every stage transition, partner interaction, and reconciliation step works predictably every time.

## Current Milestone: v1.1 Full Session Completion

**Goal:** All reconciler patterns (NO_GAPS, GAPS_FOUND, NEEDS_WORK, refinement) work correctly for both users with visual proof, plus Stage 3-4 reliability — so both users can complete an entire session end-to-end.

**Target features:**
- State diagrams for every reconciler outcome (what each user sees at each step)
- E2E tests with Playwright screenshots for all reconciler patterns
- Fix issues discovered during reconciler pattern testing
- GAPS_FOUND + NEEDS_WORK + refinement flows all working
- Stage 3 (Needs) and Stage 4 (Strategies) reliability for both users
- Fix issues discovered during Stage 3-4 testing
- Visual verification (Playwright snapshots) at each state transition

## Requirements

### Validated

- ✓ Single user can progress through Stage 0 (Onboarding) and Stage 1 (Witnessing) — pre-v1.0
- ✓ Single user can reach empathy sharing at end of Stage 2 — pre-v1.0
- ✓ AI orchestrator routes messages correctly per stage — pre-v1.0
- ✓ SSE streaming delivers AI responses with metadata — pre-v1.0
- ✓ Invitation flow (send, accept) works for basic cases — pre-v1.0
- ✓ All two-user interaction paths in Stages 0-2 documented and audited — v1.0
- ✓ All two-user interaction patterns in Stages 0-2 work reliably — v1.0
- ✓ Partner session can reach Stage 3 (Needs) for both users — v1.0
- ✓ Stage transitions trigger correct UI updates for BOTH users — v1.0
- ✓ Reconciler produces correct results and advances state for both users — v1.0
- ✓ E2E test suite covers every two-user interaction path (Stages 0-2) — v1.0

### Active

- [ ] All reconciler patterns (NO_GAPS, GAPS_FOUND, NEEDS_WORK) work correctly for both users
- [ ] Refinement flow works (share to clarify, partner receives, updated empathy)
- [ ] State diagrams document what each user sees at every reconciler step
- [ ] E2E tests with Playwright screenshots verify each reconciler pattern
- [ ] Stage 3 (Needs) works reliably for both users
- [ ] Stage 4 (Strategies) works reliably for both users
- [ ] Issues found during testing are fixed
- [ ] Missing refinement UI for guesser (empathy accuracy feedback)
- [ ] HELD→ANALYZING retry mechanism for stuck empathy

### Out of Scope

- Performance optimization — correctness first
- Mobile-native testing (Android/iOS) — web E2E testing sufficient
- Person deletion, inner thoughts linking, strategy suggestions — deferred features
- Architecture rewrite (XState for reconciler, centralized transition hook) — may happen organically

## Context

Shipped v1.0 Session Reliability with 15,225 new lines across 67 files.

**Tech stack:** React Native (Expo), Express, Prisma, Ably (realtime), React Query (cache-first), Playwright (E2E).

**Current codebase state:**
- 5 two-browser E2E tests (smoke, stage-0, stage-1, stage-2, full-flow)
- Full-flow test runs in ~12 min with mocked LLM and real Ably
- 4 audit documents (4,178 lines) documenting all interaction paths
- Reconciler infinite share loop and visibility race fixed
- 4 new Ably handlers for real-time partner stage transition updates

**Known issues / tech debt:**
- Missing refinement UI for guesser (CRITICAL from audit, deferred to v1.1)
- No HELD→ANALYZING retry mechanism (stuck empathy requires manual retry)
- Message timestamp precision uses 100ms gaps (fragile ordering)
- Backend test stage-prompts.test.ts failing (pre-existing)
- Database column 'contentEmbedding' error (pre-existing)
- No unit tests for ai-orchestrator, context-assembler, reconciler

## Constraints

- **Architecture**: Must work within existing React Query cache-first pattern and Ably realtime
- **Testing**: E2E tests need two browser contexts with real Ably to test partner interactions
- **Database**: Prisma migrations only (never `db push`)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audit before fix | Lost track of what's broken; need complete picture before changing code | ✓ Good — 20 issues found, 2 critical fixed |
| Two-browser E2E with real Ably | Partner interactions are the failure mode; can't test with single browser | ✓ Good — caught race conditions single-browser never would |
| Target Stage 3 entry as "done" | Never reached Stage 3; proving Stages 0-2 partner flow works is meaningful | ✓ Good — both users reliably enter Stage 3 |
| Asymmetric reconciler fixtures | Deterministic no-gaps result by controlling which user shares first | ✓ Good — eliminated test flakiness |
| Circuit breaker aware timeouts | 20s per message timeout for partner-session-classifier | ✓ Good — prevents false test failures |
| Mocked LLM with per-user fixtures | Deterministic AI responses by user and message index | ✓ Good — repeatable tests (3/3 passes) |
| Guard pattern for sharing history | Prevent infinite share loop in asymmetric reconciler flow | ✓ Good — eliminated infinite loop |
| Pass-by-reference for ReconcilerResult | Eliminate 100ms retry loop by querying once and passing reference | ✓ Good — simplified code path |

---
*Last updated: 2026-02-15 after v1.1 milestone initialization*
