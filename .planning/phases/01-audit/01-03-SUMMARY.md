---
phase: 01-audit
plan: 03
subsystem: documentation
tags: [audit, stage-2, empathy, reconciler, two-user-flow, ably, react-query]

# Dependency graph
requires:
  - phase: 01-audit
    plan: 02
    provides: "Reconciler architecture and flow documentation"
provides:
  - "Complete audit of Stage 2 two-user interaction paths"
  - "8 interaction paths traced: draft save, consent, partner empathy, validation, refinement, resubmit, share suggestions, status polling"
  - "Panel visibility logic mapped to cache values"
  - "Consent flow fully documented"
  - "Waiting states for all asymmetric scenarios"
  - "11 issues identified with severity ratings"
  - "Recommendations for v1.0/v1.1/v1.2"
affects: [01-audit-04, implementation, testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-First Architecture: optimistic updates → server response → error rollback"
    - "Ably event pattern: backend publishes → mobile listens → cache updates"
    - "Panel visibility computed from pure derivation functions"
    - "Local latches to prevent UI flicker during refetch"
    - "Anti-loop logic for share suggestions"

key-files:
  created:
    - ".planning/phases/01-audit/01-03-AUDIT-STAGE-2.md"
  modified: []

key-decisions:
  - "Stage 2 audit covers 8 core interaction paths plus panel/consent/waiting logic"
  - "Issues prioritized: 1 critical (missing refinement UI), 2 high (race conditions), 4 medium (UX), 4 low (code quality)"
  - "Recommendations split across v1.0 (blockers), v1.1 (UX), v1.2 (optimization)"

patterns-established:
  - "Audit structure: Interaction Path → Backend Flow → Ably Events → Mobile Cache → UI State → Issues"
  - "Document both users' perspectives for each two-user interaction"
  - "Cross-reference with CONCERNS.md to validate audit findings"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 01-audit Plan 03: Stage 2 Two-User Interaction Paths Summary

**Complete audit of Stage 2 empathy exchange with 8 interaction paths traced from backend → Ably → mobile cache → UI state for both users**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-02-14T16:28:31Z
- **Completed:** 2026-02-14T16:32:45Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **8 core interaction paths documented:** Draft save, consent to share, get partner empathy, validate empathy, refinement conversation, resubmit empathy, get share suggestion, respond to share suggestion
- **Complete flow tracing:** Each path documents trigger → backend (endpoint/controller/DB writes) → Ably events (name/payload/channel) → mobile cache updates (optimistic/success/error) → UI state changes (panel visibility/waiting states)
- **Both users' perspectives:** Every two-user interaction shows what each user experiences, what cache keys are updated, and what UI changes occur
- **11 issues identified:** 1 critical (missing refinement UI for guesser in REFINING status), 2 high (reconciler race condition, stage cache not updated), 4 medium (UX clarity), 4 low (code quality)
- **Panel visibility logic mapped:** All Stage 2 panels (empathy statement, share suggestion, accuracy feedback) traced to specific cache value requirements
- **Consent flow documented:** Generic consent infrastructure + Stage 2 specific EMPATHY_DRAFT consent type
- **Waiting states for asymmetric scenarios:** 6 documented scenarios covering all possible state combinations
- **Stage 2 → Stage 3 entry conditions:** Gate requirements (empathyShared, empathyValidated) and automatic transition trigger identified
- **Reconciler trigger points:** When reconciler runs (both users consent), what it publishes (empathy.status_updated with full status), and anti-loop logic documented
- **Cross-referenced with CONCERNS.md:** Reconciler race conditions and stage transition cache update patterns validated

## Task Commits

Each task was committed atomically:

1. **Task 1: Trace and document Stage 2 empathy exchange interaction paths** - `900da8e` (docs)

**Plan metadata:** Not yet committed (will be part of STATE.md update).

## Files Created/Modified

- `.planning/phases/01-audit/01-03-AUDIT-STAGE-2.md` (1,150 lines) - Complete Stage 2 audit with 8 interaction paths, panel visibility logic, consent flow, waiting states, issues summary, and recommendations

## Decisions Made

None - followed plan as specified. Plan requested comprehensive audit of Stage 2 interaction paths, which was executed exactly as designed.

## Deviations from Plan

None - plan executed exactly as written.

All 8 interaction paths were traced as requested:
1. Empathy Draft Save
2. Consent to Share Empathy (reconciler trigger)
3. Get Partner Empathy
4. Validate Partner's Empathy
5. Empathy Refinement (legacy NEEDS_WORK flow)
6. Get Share Suggestion (asymmetric reconciler - subject side)
7. Respond to Share Suggestion
8. Empathy Exchange Status (polling endpoint)

Additional sections (panel visibility, consent flow, waiting states, Stage 2→3 entry) were also requested and documented.

## Issues Encountered

None - all source files were readable and code structure was well-organized.

## Key Findings

### Critical Issue

**Missing Refinement UI (Guesser Side):**
- When guesser receives shared context from subject, status changes to `REFINING`
- Input is hidden until Share tab is viewed
- After viewing, no clear "Refine" button or prompt appears
- Expected flow: Use Share screen's "Refine" button, but this isn't obvious
- **Impact:** Guesser is blocked and doesn't know how to proceed

### High-Priority Issues

1. **Reconciler Status Race Condition:**
   - Reconciler runs in background after `consentToShare` returns
   - Mobile refetch before reconciler completes may see stale status
   - Mitigated by `empathy.status_updated` event + polling, but brief flicker possible

2. **Stage Cache Not Updated on Consent:**
   - `sessionKeys.state` intentionally NOT invalidated after mutations
   - Prevents invalidation race conditions (per commit 6c6504e)
   - Panel visibility relies on stale stage cache until separate refetch

### Architecture Patterns Documented

1. **Cache-First Architecture:**
   - `onMutate`: Optimistic update to cache
   - `onSuccess`: Replace with server response
   - `onError`: Rollback to previous cache state

2. **Ably Event Pattern:**
   - Backend publishes event after DB write
   - Mobile listens on session/user channels
   - Cache updated directly from event payload
   - Invalidation triggers refetch for eventual consistency

3. **Anti-Loop Logic:**
   - `hasContextAlreadyBeenShared` check prevents infinite loop
   - Without this: resubmit → reconciler → AWAITING_SHARING → share → resubmit → loop
   - Location: `triggerReconcilerAndUpdateStatuses` (buried in complex function)

## Recommendations Summary

**v1.0 (Blockers):**
- Implement refinement UI for guesser in REFINING status
- Implement accuracy feedback panel (logic exists, UI missing)
- Add blocking reason to waiting banners

**v1.1 (UX):**
- Show shared context in subject's timeline
- Test decline flow (subject declines to share)
- Consolidate delivery status to single source of truth

**v1.2 (Optimization):**
- Reduce polling frequency (rely more on Ably events)
- Move local latches to cache (eliminate component state)
- Extract anti-loop logic to standalone guard function

## Next Phase Readiness

**Ready for Plan 04:** Stage 3 audit can proceed. All Stage 2 interaction paths are now documented.

**Blockers identified for v1.0 implementation:**
- Missing refinement UI must be implemented before Stage 2 is complete
- Accuracy feedback panel must be implemented for validation flow
- These are not audit blockers, but implementation blockers

**Context for future planning:**
- Stage 2 is the most complex stage with 8+ interaction paths
- Reconciler is the core of Stage 2 - runs when both users consent
- Share suggestions are the new asymmetric flow (replacing legacy NEEDS_WORK refinement)
- Panel visibility is computed from pure functions using cache values
- Local latches create navigation issues (should be moved to cache)

---
*Phase: 01-audit*
*Completed: 2026-02-14*

## Self-Check: PASSED

Files exist:
```bash
[ -f ".planning/phases/01-audit/01-03-AUDIT-STAGE-2.md" ] && echo "FOUND: .planning/phases/01-audit/01-03-AUDIT-STAGE-2.md"
```
FOUND: .planning/phases/01-audit/01-03-AUDIT-STAGE-2.md

Commits exist:
```bash
git log --oneline --all | grep -q "900da8e" && echo "FOUND: 900da8e"
```
FOUND: 900da8e
