# Phase 9: Circuit Breaker Implementation - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend safety mechanism that bounds empathy refinement loops. When a guesser's empathy statement is repeatedly flagged as inaccurate, the circuit breaker forces progression after a fixed number of attempts — preventing infinite back-and-forth. Does NOT change any UI components or add new user flows.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User gave full discretion on all implementation choices. The following are Claude's recommended defaults — researcher and planner should use these unless they find a compelling reason to deviate.

**Trigger threshold:**
- 3 refinement attempts per direction (A→B tracked separately from B→A)
- An "attempt" = each time the reconciler evaluates a guesser's empathy and returns a non-READY result (AWAITING_SHARING, REFINING, etc.)
- The sharer's initial sharing does not count as an attempt

**Breaking behavior:**
- On the 4th attempt, skip reconciler evaluation entirely and force READY status
- Both users progress as if empathy was accepted
- No partial states — once tripped, that direction is done

**User communication:**
- Brief, non-alarming AI message to both users acknowledging the cap (e.g., "We've captured your perspective — let's move forward")
- No warning before the last attempt — just graceful progression when the limit hits
- The message should feel like a natural transition, not an error

**Counting & persistence:**
- Counter stored in database (not in-memory) so it survives server restarts
- Per session, per direction (sessionId + direction as composite key)
- No reset within a session — once attempts are used, they're used

**Edge cases:**
- Each direction is fully independent — A→B can trip while B→A has attempts remaining
- If both directions trip simultaneously, both get READY status independently
- Concurrent refinements: each reconciler call checks/increments atomically (DB-level)

</decisions>

<specifics>
## Specific Ideas

User's core priority: "I just want to see something working." Emphasis on reliability over sophistication — a simple, correct circuit breaker that prevents stuck sessions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-circuit-breaker-implementation*
*Context gathered: 2026-02-17*
