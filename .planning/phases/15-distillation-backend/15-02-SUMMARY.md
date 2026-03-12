---
phase: 15-distillation-backend
plan: "02"
subsystem: api
tags: [haiku, bedrock, circuit-breaker, distillation, inner-thoughts, tdd, prisma]

# Dependency graph
requires:
  - phase: 15-distillation-backend
    plan: "01"
    provides: SessionTakeaway Prisma model, TakeawayDTO/DistillSessionResponse DTOs, DISTILLATION callType, distilledAt on InnerWorkSession
provides:
  - distillSession function in backend/src/services/distillation.ts
  - buildDistillationPrompt function (message transcript formatter)
  - normalizeTakeaways function (defensive Haiku output parser)
  - POST /inner-thoughts/:id/distill endpoint (synchronous, rate limited)
  - POST /inner-work/:id/distill legacy alias
  - Fire-and-forget distillSession call in updateInnerWorkSession on COMPLETED status
affects:
  - 17-session-list-ui (distill CTA invokes this endpoint, distilledAt drives CTA visibility)
  - 16-knowledge-base-backend (takeaways feed into knowledge base)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Distillation TDD: failing test first (test(15-02)), then implementation (feat(15-02)), separate commits"
    - "Migration-pending fields use 'as any' casts on prisma models — document with comment, remove after prisma generate"
    - "Fire-and-forget: never await async side-effects in HTTP handlers; use .catch() for error surfacing"
    - "withHaikuCircuitBreaker wraps all Haiku background calls — normalize null fallback to empty array"

key-files:
  created:
    - backend/src/services/distillation.ts
    - backend/src/services/__tests__/distillation.test.ts
    - backend/src/controllers/distillation.ts
  modified:
    - backend/src/routes/inner-thoughts.ts
    - backend/src/controllers/inner-work.ts

key-decisions:
  - "Prisma 'as any' casts for distilledAt and DISTILLATION callType — pending migration apply + prisma generate (DB inaccessible in dev); casts are documented with comments and safe to remove once migration is applied"
  - "normalizeTakeaways handles both { takeaways: [] } and top-level array fallback — Haiku output format can vary"
  - "streamingRateLimit applied to distill endpoint — it triggers an LLM call, same cost profile as message endpoint"
  - "distillSession deletes only source=AI takeaways — USER-origin takeaways preserved across re-distillations"

patterns-established:
  - "Distillation prompt uses Journal Guide / Me labels — never Assistant/User to avoid clinical framing"
  - "Sparse session guard: < 2 user messages skips Haiku and still updates distilledAt"
  - "Atomic transaction pattern: deleteMany(AI) + createMany(new) + update(distilledAt) in single $transaction"

requirements-completed: [DIST-01, DIST-02, DIST-03]

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 15 Plan 02: Distillation Service Summary

**Haiku-backed distillation service with fire-and-forget session-close trigger, on-demand POST endpoint, and atomic AI-takeaway replacement preserving user edits**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T08:16:00Z
- **Completed:** 2026-03-12T08:28:56Z
- **Tasks:** 2 (+ TDD RED commit)
- **Files modified:** 5

## Accomplishments

- Implemented `distillSession` with sparse-session guard, Haiku call via `withHaikuCircuitBreaker`, defensive normalization, and atomic transaction (deleteMany AI + createMany new + update distilledAt)
- Built `normalizeTakeaways` handling `{ takeaways: [] }` primary shape and top-level array fallback, filtering invalid items, capping at 10
- Built `buildDistillationPrompt` formatting messages as "Journal Guide" / "Me" transcript with explicit own-language rules
- Created `controllers/distillation.ts` for synchronous `POST /inner-thoughts/:id/distill` endpoint with session ownership check
- Registered distill routes with `streamingRateLimit` in `inner-thoughts.ts` (primary + legacy alias)
- Added fire-and-forget `distillSession()` call in `updateInnerWorkSession` when `status === 'COMPLETED'` — never awaited

## Task Commits

Each task was committed atomically (TDD pattern: test → implementation):

1. **Task 1 RED: Failing tests** - `7ff91e3` (test)
2. **Task 1 GREEN: Distillation service implementation** - `98e90e6` (feat)
3. **Task 2: Controller, routes, fire-and-forget hook** - `36da10c` (feat)

## Files Created/Modified

- `backend/src/services/distillation.ts` - New: `distillSession`, `buildDistillationPrompt`, `normalizeTakeaways`
- `backend/src/services/__tests__/distillation.test.ts` - New: 20 unit tests covering all behaviors
- `backend/src/controllers/distillation.ts` - New: `distillInnerWorkSession` HTTP handler
- `backend/src/routes/inner-thoughts.ts` - Added distill routes (primary + legacy) with `streamingRateLimit`
- `backend/src/controllers/inner-work.ts` - Added `crypto` and `distillSession` imports, fire-and-forget hook in `updateInnerWorkSession`

## Decisions Made

- **Prisma `as any` casts:** `distilledAt` and `BrainActivityCallType.DISTILLATION` are not in the generated Prisma client because the migration hasn't been applied to the dev DB. Used `as any` with clear comments — safe to remove after `prisma generate` runs post-migration.
- **`normalizeTakeaways` handles both shapes:** Haiku can return either `{ takeaways: [] }` or a top-level array depending on temperature and prompt following. Defensive handling prevents silent failures.
- **`streamingRateLimit` on distill endpoint:** The distill endpoint triggers a Haiku call — same cost profile as the message endpoint. Shares the 10 req/min limit.
- **USER takeaways preserved via source filter:** `deleteMany({ where: { sessionId, source: 'AI' } })` only removes AI-generated takeaways, leaving user-edited entries intact for re-distillation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma type errors for migration-pending fields**
- **Found during:** Task 1 (GREEN phase — first test run)
- **Issue:** `distilledAt` on `InnerWorkSession.update` and `BrainActivityCallType.DISTILLATION` caused TS2353/TS2339 errors because the migration adding these hasn't been applied to the dev DB (Prisma generated types lag behind schema)
- **Fix:** Added `const prismaAny = prisma as any` for model operations on the new fields, and `'DISTILLATION' as unknown as BrainActivityCallType` for the enum cast. Both are documented inline with comments explaining when to remove.
- **Files modified:** `backend/src/services/distillation.ts`
- **Verification:** All 20 distillation tests pass; `npm run check` passes across all workspaces
- **Committed in:** `98e90e6` (Task 1 implementation commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/type-error from migration-pending Prisma types)
**Impact on plan:** Necessary workaround matching pattern established in Plan 01 (same environment constraint). No scope creep.

## Issues Encountered

- Dev database inaccessible — same constraint as Plan 01. All Prisma operations on migration-pending fields use `as any` casts with documented removal condition. Pre-existing `circuit-breaker.test.ts` failures (11 tests) confirmed pre-existing by stash test; documented as out-of-scope per deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `distillSession` is fully implemented and tested — Plan 03 (takeaways CRUD endpoints) can build on top of it immediately
- `TakeawayDTO` and `DistillSessionResponse` are in `@meet-without-fear/shared`
- The distill endpoint is live at `POST /api/v1/inner-thoughts/:id/distill`
- Once the migration is applied and `prisma generate` runs, remove the `as any` casts in `distillation.ts` (both `prismaAny` and the `DISTILLATION` callType cast)

## Self-Check: PASSED

All created files exist. All task commits verified.

---
*Phase: 15-distillation-backend*
*Completed: 2026-03-12*
