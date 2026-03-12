---
phase: 16-knowledge-base-backend
plan: 03
subsystem: api
tags: [prisma, bedrock, haiku, circuit-breaker, tdd, fire-and-forget, recurring-theme]

# Dependency graph
requires:
  - phase: 16-knowledge-base-backend
    plan: 01
    provides: RecurringTheme Prisma model with userId_tag composite unique key
  - phase: 15-distillation-backend
    plan: 02
    provides: distillation.ts with $transaction and fire-and-forget hook point

provides:
  - detectRecurringTheme function that checks 3-session threshold and upserts RecurringTheme via Haiku
  - buildThemeSummaryPrompt pure helper for formatting session takeaways into Haiku prompt
  - Fire-and-forget integration in distillation.ts triggered after every $transaction commit

affects:
  - 16-04 (knowledge base read endpoint reads RecurringTheme rows created here)
  - 17-session-list-distillation-ui (UI surfaces RecurringTheme data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fire-and-forget pattern: call service.method().catch(err => logger.warn(...)) after await $transaction
    - Theme-detector never throws: top-level try/catch catches all errors, logs non-fatally
    - Upsert with composite unique key: prisma.recurringTheme.upsert({ where: { userId_tag: { userId, tag } } })
    - Always-regenerate summary: update path includes summary + summaryAt on every above-threshold trigger

key-files:
  created:
    - backend/src/services/theme-detector.ts
    - backend/src/services/__tests__/theme-detector.test.ts
  modified:
    - backend/src/services/distillation.ts

key-decisions:
  - "3-session threshold is hard constraint — never lower it (from STATE.md decisions)"
  - "Theme detection triggered AFTER $transaction commits so new takeaways are visible to the detector"
  - "detectRecurringTheme always regenerates summary above threshold — update path includes summary"
  - "userId: _userId renamed to userId in distillSession — now consumed by fire-and-forget call"

patterns-established:
  - "Fire-and-forget: service().catch(err => logger.warn()) after transaction — never inside or before"
  - "Detector services: never throw, full try/catch wrapper, log non-fatally"

requirements-completed: [INTEL-01, INTEL-02]

# Metrics
duration: 6min
completed: 2026-03-12
---

# Phase 16 Plan 03: Theme Detector Summary

**Cross-session theme detection via Haiku with 3-session threshold, fire-and-forget wired into distillation.ts after $transaction commits**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-12T08:52:07Z
- **Completed:** 2026-03-12T08:58:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `detectRecurringTheme` service: fetches session theme, enforces 3-session threshold, calls Haiku with CROSS_SESSION_THEME callType and circuit breaker, upserts RecurringTheme with always-regenerated summary
- `buildThemeSummaryPrompt` pure helper: formats N sessions with dated takeaway blocks, instructs Haiku to use user's own words and output JSON
- Fire-and-forget integration in distillation.ts: called after `$transaction` commits, never awaited, `.catch()` logs warnings without blocking response

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for theme-detector** - `70e70f6` (test)
2. **Task 1 GREEN: Implement theme-detector.ts** - `d34e789` (feat)
3. **Task 2: Wire fire-and-forget into distillation** - `39a620a` (feat)

**Plan metadata:** (docs: complete plan — pending)

_Note: TDD task has two commits (RED test → GREEN implementation)_

## Files Created/Modified

- `backend/src/services/theme-detector.ts` — Main detection service: detectRecurringTheme + buildThemeSummaryPrompt
- `backend/src/services/__tests__/theme-detector.test.ts` — 14 unit tests covering all threshold/Haiku/upsert scenarios
- `backend/src/services/distillation.ts` — Added crypto import, detectRecurringTheme import, fire-and-forget call after transaction

## Decisions Made

- 3-session threshold is hard constraint from STATE.md — never lower it
- Theme detection triggered AFTER $transaction commits (not inside it) — ensures new takeaways are visible
- `userId: _userId` renamed to `userId` in distillSession destructuring — parameter is now consumed by fire-and-forget call so prefix was misleading

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Three pre-existing backend test failures (circuit-breaker.test.ts, circuit-breaker-integration.test.ts, time-language.test.ts) were present before this plan and remain out of scope. Verified via git stash.

## Next Phase Readiness

- RecurringTheme rows are now created/updated automatically after each distillation that crosses the 3-session threshold
- Phase 16 Plan 04 (knowledge base read endpoint) can now query RecurringTheme rows for the knowledge base API
- Theme detector is integration-ready — no additional wiring needed

---
*Phase: 16-knowledge-base-backend*
*Completed: 2026-03-12*
