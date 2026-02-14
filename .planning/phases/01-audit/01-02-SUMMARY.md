---
phase: 01-audit
plan: 02
subsystem: reconciler
tags:
  - stage-2
  - empathy-exchange
  - state-machine
  - race-conditions
dependency-graph:
  requires:
    - EmpathyAttempt (DB table)
    - ReconcilerResult (DB table)
    - ReconcilerShareOffer (DB table)
    - Message (SHARED_CONTEXT role)
  provides:
    - Complete reconciler state machine documentation
    - DB schema reference for reconciler tables
    - Race condition analysis with workarounds
    - User flow perspectives (guesser + subject)
  affects:
    - Stage 2 (Perspective Stretch)
    - Ably realtime events
    - Mobile Share tab UI
tech-stack:
  added: []
  patterns:
    - Asymmetric state machine (per-direction execution)
    - Retry loops (100ms delays for transaction visibility)
    - Mutual reveal (both directions READY before showing empathy)
    - Cascade delete (ReconcilerResult → ReconcilerShareOffer)
key-files:
  created:
    - .planning/phases/01-audit/01-02-AUDIT-RECONCILER.md
  modified: []
decisions:
  - decision: Document reconciler as asymmetric flow (not symmetric)
    rationale: Current implementation uses runReconcilerForDirection() which runs per-direction when subject completes Stage 1, not waiting for both to share empathy
  - decision: Flag infinite loop as critical issue
    rationale: hasContextAlreadyBeenShared() check is only in triggerReconcilerAndUpdateStatuses(), not in runReconcilerForDirection() or triggerReconcilerForUser(), allowing loop to bypass protection
  - decision: Document race condition workarounds as fragile
    rationale: 100ms retry loops and explicit timestamp gaps are band-aids for underlying Prisma transaction visibility issues
metrics:
  duration: 7
  tasks: 2
  files: 1
  commits: 2
  lines-added: 1602
  completed: 2026-02-14
---

# Phase 01 Plan 02: Reconciler State Machine Audit Summary

**One-liner:** Complete reconciler state machine mapped: 8 states, 11 transitions, 6 DB tables, 6 Ably events, 2 critical race conditions, infinite loop vulnerability documented

---

## What Was Built

Comprehensive audit of the empathy reconciler state machine documenting:

1. **Complete State Machine:**
   - 8 states: HELD, ANALYZING, AWAITING_SHARING, REFINING, NEEDS_WORK (deprecated), READY, REVEALED, VALIDATED
   - 11 valid transitions with triggers, guards, and side effects
   - 5 invalid transitions prevented by guards

2. **Database Schema:**
   - 6 tables: EmpathyAttempt, ReconcilerResult, ReconcilerShareOffer, EmpathyValidation, Message, StageProgress
   - Field-level documentation with relationships
   - Cascade behavior documented (ReconcilerResult → ReconcilerShareOffer deletion causes infinite loop)

3. **User Perspectives:**
   - User A (guesser) flow: 8 phases from initial share to validation
   - User B (subject) flow: share suggestion decision tree
   - Ably event timeline with cache updates
   - UI state changes at each transition

4. **Race Conditions:**
   - ReconcilerResult creation visibility (3-attempt 100ms retry loop)
   - Message timestamp ordering (explicit 100ms gaps)
   - Infinite share loop (hasContextAlreadyBeenShared check)
   - Response status flexibility (accepts PENDING | OFFERED)

5. **Issues Identified:**
   - **Critical (2):** Infinite share loop, ReconcilerResult visibility
   - **Medium (2):** Message ordering, no HELD→ANALYZING retry
   - **Low (3):** Cascade delete design, unused fields, deprecated status

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Key Decisions

### 1. Asymmetric Flow Documentation
**Context:** Code has both `runReconciler()` (symmetric) and `runReconcilerForDirection()` (asymmetric).

**Decision:** Document asymmetric flow as primary, symmetric as legacy.

**Rationale:** Current implementation uses `runReconcilerForDirection()` via `consentToShare()` → `triggerReconcilerAndUpdateStatuses()`. Symmetric flow exists for backward compatibility but is not the main code path.

---

### 2. Infinite Loop Flagged as Critical
**Context:** `hasContextAlreadyBeenShared()` check prevents infinite share suggestion loop.

**Decision:** Flag as critical issue despite existing mitigation.

**Rationale:**
- Check only in `triggerReconcilerAndUpdateStatuses()` (symmetric flow)
- NOT in `runReconcilerForDirection()` (asymmetric flow)
- NOT in `triggerReconcilerForUser()` (resubmit flow)
- If resubmit calls asymmetric flow, check is bypassed
- Loop repeats: share → resubmit → same gaps → new share suggestion

**Evidence:** Lines 2022-2078 in `stage2.ts` show `triggerReconcilerForUser()` calls `runReconcilerForDirection()` which doesn't check for existing shares.

---

### 3. Race Condition Workarounds as Fragile
**Context:** Code uses retry loops and timestamp manipulation.

**Decision:** Document as fragile workarounds, not robust solutions.

**Rationale:**
- 100ms delays are arbitrary (not based on database tick resolution)
- 3-attempt limit may fail on slow databases
- Explicit timestamp gaps create coupling between backend and chat UI sort logic
- Should investigate Prisma isolation level and add proper retry mechanisms

---

## Technical Highlights

### State Machine Complexity
- **8 states** across lifecycle (vs typical 3-4 for simpler flows)
- **Asymmetric execution:** A→B and B→A directions run independently
- **Mutual reveal invariant:** Neither user sees partner's empathy until both directions READY
- **Loop-back transitions:** REFINING → ANALYZING (resubmit) creates potential for infinite cycles

### Database Cascade Behavior
- `ReconcilerResult` deletion cascades to `ReconcilerShareOffer`
- Creates information loss: system forgets "subject already shared context for these gaps"
- Workaround relies on `SHARED_CONTEXT` messages persisting independently
- Fragile: If messages deleted (cleanup, user action), check fails and loop resumes

### Ably Event Architecture
- 6 events documented: `empathy.status_updated`, `partner_considering_share`, `revealed`, `refining`, `partner.stage_completed`, plus 2 legacy events not used
- Events include full empathy status to avoid extra HTTP round-trips
- Filtering via `forUserId` and `triggeredByUserId` prevents duplicate UI updates
- Mobile cache-first pattern: events invalidate cache, queries refetch

---

## Self-Check: PASSED

### Created Files Verification
```bash
[ -f ".planning/phases/01-audit/01-02-AUDIT-RECONCILER.md" ] && echo "FOUND: 01-02-AUDIT-RECONCILER.md" || echo "MISSING"
```
Output: `FOUND: 01-02-AUDIT-RECONCILER.md`

### Commit Verification
```bash
git log --oneline --all | grep -q "581260a" && echo "FOUND: 581260a" || echo "MISSING"
git log --oneline --all | grep -q "264e6c2" && echo "FOUND: 264e6c2" || echo "MISSING"
```
Output:
```
FOUND: 581260a (Task 1: state machine and DB schema)
FOUND: 264e6c2 (Task 2: user perspectives and Ably events)
```

### Document Completeness
- ✅ DB table documentation (6 tables with fields and relationships)
- ✅ State machine diagram (8 states, 11 transitions, ASCII flow diagram)
- ✅ Entry points documented (3 entry points: consentToShare, runReconciler, resubmitEmpathy)
- ✅ Share suggestion flow (3 phases: generation, retrieval, response)
- ✅ Race condition workarounds (4 patterns identified with risk assessment)
- ✅ User perspectives (User A guesser flow, User B subject flow)
- ✅ Ably events (6 events with payloads, handlers, cache updates)
- ✅ Post-reconciliation transition (Stage 2→3 traced)
- ✅ Issues flagged (7 issues with severity: 2 critical, 2 medium, 3 low)

### Line Count
```bash
wc -l .planning/phases/01-audit/01-02-AUDIT-RECONCILER.md
```
Output: `1602 lines`

---

## Next Steps

### Immediate Fixes Required
1. **Fix infinite loop:** Add `hasContextAlreadyBeenShared()` check to `runReconcilerForDirection()` before setting AWAITING_SHARING status
2. **Investigate Prisma isolation level:** Switch to READ COMMITTED or add explicit transaction control
3. **Add HELD→ANALYZING retry:** Listen for partner's Stage 1 completion via Ably event and trigger reconciler

### Medium-Term Improvements
4. **Add message ordering field:** Replace timestamp-based sorting with monotonic sequence number
5. **Track sharing history:** Create separate table to track which contexts have been shared, independent of ReconcilerResult lifecycle

### Technical Debt
6. **Remove deprecated NEEDS_WORK status:** Update guards and enums after migration
7. **Remove or implement abstract guidance fields:** Either use areaHint/guidanceType/promptSeed in refinement flow or delete them

---

## Completion Metrics

- **Duration:** 7 minutes
- **Tasks Completed:** 2/2 (100%)
- **Files Created:** 1 (01-02-AUDIT-RECONCILER.md)
- **Commits:** 2 (task-level atomic commits)
- **Lines Added:** 1,602 lines of documentation
- **Issues Identified:** 7 (2 critical, 2 medium, 3 low)
- **Deviations:** 0 (plan executed exactly as written)

---

**Audit Status:** ✅ COMPLETE

A different Claude instance can now understand the full reconciler flow from this document alone, including the state machine, database schema, race conditions, user perspectives, Ably events, and identified issues.
