---
phase: 16-knowledge-base-backend
plan: "02"
subsystem: backend/api
tags: [knowledge-base, controller, express, prisma, people-tracking, tdd]
dependency_graph:
  requires:
    - phase: 16-01
      provides: RecurringTheme model, knowledge base DTOs (ListTopicsResponse, GetTopicTimelineResponse, ListRecurringThemesResponse), PersonDetailDTO.sessions field, recurringTheme Prisma mock
  provides:
    - listTopics controller — GET /knowledge-base/topics — sessions grouped by theme with sessionCount/takeawayCount/lastActivity, sorted by lastActivity desc
    - getTopicTimeline controller — GET /knowledge-base/topics/:tag — chronological session timeline, URL-decoded tag
    - listRecurringThemes controller — GET /knowledge-base/themes — RecurringTheme rows sorted by sessionCount desc
    - knowledge-base route module (routes/knowledge-base.ts) mounted in routes/index.ts
    - getPerson controller extended with real PersonMention-based session lookup replacing placeholder []
    - 12 unit tests covering all controller behaviors
  affects:
    - Phase 18 (Knowledge Base UI — mobile browse screens will consume these endpoints)
tech-stack:
  added: []
  patterns:
    - Application-layer grouping after findMany (no Prisma groupBy+include — unsupported combination)
    - decodeURIComponent on route params for all endpoints that accept theme tags
    - De-duplicate PersonMention sourceIds with Set before secondary session query
key-files:
  created:
    - backend/src/controllers/knowledge-base.ts
    - backend/src/routes/knowledge-base.ts
    - backend/src/services/__tests__/knowledge-base.test.ts
  modified:
    - backend/src/routes/index.ts
    - backend/src/controllers/people.ts
key-decisions:
  - "Application-layer Map grouping for listTopics — Prisma groupBy does not support include (per Phase 16 research pitfall 5)"
  - "decodeURIComponent applied before DB query in getTopicTimeline — handles spaces and special characters in theme tags"
  - "PersonMention lookup scoped to INNER_THOUGHTS sourceType only — other sourceTypes (GRATITUDE, NEEDS_CHECKIN) reference different entity types"
  - "Set-based de-duplication of PersonMention sourceIds before inner-work session query — a person may be mentioned multiple times in the same session"
requirements-completed: [KNOW-01, KNOW-02, KNOW-03, KNOW-04, INTEL-02, INTEL-03]
duration: 4min
completed: "2026-03-12"
---

# Phase 16 Plan 02: Knowledge Base Browse Endpoints Summary

**Three GET endpoints for knowledge base browsing (topics list, topic timeline, recurring themes) plus GET /people/:id now returns sessions where the person is mentioned.**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-03-12T08:52:18Z
- **Completed:** 2026-03-12T08:56:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Knowledge base controller (`listTopics`, `getTopicTimeline`, `listRecurringThemes`) implemented with TDD — 12 unit tests all green
- Route module created and mounted — `GET /knowledge-base/topics`, `/topics/:tag`, `/themes` are wired up behind `requireAuth`
- People controller `getPerson` now returns real session context via PersonMention lookup, replacing the `sessions: []` placeholder from Plan 01
- All type checks pass across all workspaces; no regressions in existing tests (3 pre-existing failures in circuit-breaker and time-language are unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Knowledge base controllers with unit tests** - `3580e74` (feat, TDD green)
2. **Task 2: Route wiring, people controller extension, integration verification** - `0c53fed` (feat)

## Files Created/Modified

- `backend/src/controllers/knowledge-base.ts` — `listTopics`, `getTopicTimeline`, `listRecurringThemes` handlers
- `backend/src/services/__tests__/knowledge-base.test.ts` — 12 unit tests covering all controller behaviors
- `backend/src/routes/knowledge-base.ts` — Route module for `/knowledge-base/` endpoints
- `backend/src/routes/index.ts` — Added `knowledgeBaseRoutes` import and mount after peopleRoutes
- `backend/src/controllers/people.ts` — Replaced `sessions: []` with real PersonMention → innerWorkSession query

## Decisions Made

- **Application-layer Map grouping for `listTopics`**: Prisma `groupBy` does not support `include`. Single `findMany` with `include: { takeaways }` followed by a `Map<string, KnowledgeBaseTopicDTO>` accumulation loop is the correct pattern (per Phase 16 research pitfall 5).
- **`decodeURIComponent` before DB query in `getTopicTimeline`**: Tags may contain spaces (e.g., "work stress") which Express receives URL-encoded as "work%20stress". Always decode before the Prisma query.
- **PersonMention scoped to `INNER_THOUGHTS` only**: `sourceId` on a `INNER_THOUGHTS` mention is an `InnerWorkSession.id`. Other sourceTypes (GRATITUDE, NEEDS_CHECKIN, PARTNER_SESSION) reference different entity types and would corrupt the session query.
- **Set-based de-duplication of sourceIds**: A person may be mentioned multiple times within the same session, so `[...new Set(innerThoughtsMentions.map(m => m.sourceId))]` prevents duplicate session IDs in the `id: { in: sessionIds }` query.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The plan's pitfall warnings (no Prisma groupBy+include, always decodeURIComponent) were implemented correctly from the start.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three knowledge base browse endpoints are production-ready and type-safe
- GET /people/:id now returns full session context for Phase 18's people detail screen
- Phase 18 (Knowledge Base UI) can begin — endpoints match the DTOs exactly

## Self-Check: PASSED

All required files verified to exist:
- `backend/src/controllers/knowledge-base.ts` — FOUND
- `backend/src/routes/knowledge-base.ts` — FOUND
- `backend/src/services/__tests__/knowledge-base.test.ts` — FOUND
- `.planning/phases/16-knowledge-base-backend/16-02-SUMMARY.md` — FOUND

All required commits verified in git history:
- `3580e74` feat(16-02): knowledge base controllers with unit tests — FOUND
- `0c53fed` feat(16-02): wire knowledge-base routes and extend people controller — FOUND

---
*Phase: 16-knowledge-base-backend*
*Completed: 2026-03-12*
