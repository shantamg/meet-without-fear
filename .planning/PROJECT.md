# Meet Without Fear

## What This Is

A mobile app that guides two people through structured conflict resolution conversations. An AI mediator helps each person feel heard, develops empathy for the other's perspective, identifies needs, and suggests strategies — progressing through 5 stages (Onboarding, Witnessing, Empathy, Needs, Strategies).

## Core Value

Two people can reliably complete a full partner session together — every stage transition, partner interaction, and reconciliation step works predictably every time.

## Current Milestone: v1.0 Session Reliability

**Goal:** Make partner sessions work reliably through Stage 2 (Empathy/Reconciler) so both users can reach Stage 3 (Needs).

**Target features:**
- Full audit of every two-user interaction path in Stages 0-2
- Two-browser E2E test infrastructure with real Ably for partner interaction testing
- Fix/simplify identified issues in stage transitions, cache updates, and reconciler
- Verified end-to-end partner session flow through Stage 3 entry

## Requirements

### Validated

<!-- Shipped and confirmed working (single-user paths). -->

- Single user can progress through Stage 0 (Onboarding) and Stage 1 (Witnessing)
- Single user can reach empathy sharing at end of Stage 2
- AI orchestrator routes messages correctly per stage
- SSE streaming delivers AI responses with metadata
- Invitation flow (send, accept) works for basic cases

### Active

<!-- Current scope: Session Reliability milestone -->

- [ ] All two-user interaction patterns in Stages 0-2 work reliably
- [ ] Partner session can reach Stage 3 (Needs) for both users
- [ ] Stage transitions trigger correct UI updates for BOTH users
- [ ] Reconciler produces correct results and advances state for both users
- [ ] E2E test suite covers every two-user interaction path

### Out of Scope

- Stage 3 (Needs) and Stage 4 (Strategies) implementation/fixes — future milestone
- New features or UI changes — reliability only
- Performance optimization — correctness first
- Mobile-specific issues (Android/iOS) — web E2E testing only for now
- Person deletion, inner thoughts linking, strategy suggestions — deferred features

## Context

The app has evolved through incremental development and bug fixes, resulting in fragile areas:
- **Stage transition cache updates**: Mobile uses Cache-First architecture where mutations must manually update `sessionKeys.state` cache. Missing updates cause panels to not display.
- **Reconciler state machine**: Complex state (HELD → AWAITING_SHARING → REFINING → REVEALED) across multiple DB tables with race condition workarounds.
- **Dual-path updates**: Both React Query cache and React state must stay in sync — easy to miss one path.
- **No unit tests for critical services**: ai-orchestrator, context-assembler, reconciler have no automated safety net.
- **Two-user interactions untested**: Current E2E tests only cover single-user progression. Partner interaction patterns (the primary failure mode) are not tested.

## Constraints

- **Architecture**: Must work within existing React Query cache-first pattern and Ably realtime
- **Testing**: E2E tests need two browser contexts with real Ably to test partner interactions
- **Approach**: Full audit before any fixes — understand all paths before changing code
- **Database**: Tests should set up specific scenarios via database state, not rely on UI navigation for setup

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audit before fix | Lost track of what's broken; need complete picture before changing code | — Pending |
| Two-browser E2E with real Ably | Partner interactions are the failure mode; can't test with single browser | — Pending |
| Target Stage 3 entry as "done" | Never reached Stage 3; proving Stages 0-2 partner flow works is meaningful | — Pending |

---
*Last updated: 2026-02-14 after milestone initialization*
