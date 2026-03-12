---
phase: 14-foundation
plan: 03
subsystem: api
tags: [assemblyai, voice, transcription, token, websocket]

# Dependency graph
requires: []
provides:
  - "POST /api/v1/voice/token endpoint — returns short-lived AssemblyAI WebSocket streaming token"
  - "VoiceTokenResponseDTO in shared package for mobile consumption"
  - "AssemblyAI integration documented in integrations.md"
affects: [phase-17-voice-ui, mobile-voice-transcription]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async controller functions (no asyncHandler wrapper) — enables direct await in tests"
    - "Env var read inside handler (not at module level) — enables per-test env manipulation"

key-files:
  created:
    - backend/src/controllers/voice.ts
    - backend/src/controllers/__tests__/voice.test.ts
    - backend/src/routes/voice.ts
    - shared/src/dto/voice.ts
  modified:
    - backend/src/routes/index.ts
    - shared/src/index.ts
    - .envrc.example
    - docs/architecture/integrations.md

key-decisions:
  - "Read ASSEMBLYAI_API_KEY inside handler, not at module level — allows jest.resetModules() to work correctly in tests"
  - "Use plain async function instead of asyncHandler wrapper — allows direct await in test calls"

patterns-established:
  - "Voice token proxy pattern: backend fetches token from AssemblyAI, never exposes API key to mobile"

requirements-completed: [VOICE-05]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 14 Plan 03: AssemblyAI Voice Token Endpoint Summary

**POST /voice/token backend endpoint proxying short-lived AssemblyAI streaming tokens, with VoiceTokenResponseDTO in shared package and full integration documentation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T07:48:18Z
- **Completed:** 2026-03-12T07:55:47Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- POST /voice/token endpoint with requireAuth + authRateLimit (30 req/min) applied
- 4 controller tests covering all paths: missing env var (500), upstream failure (502), success (200), fetch throws (next)
- VoiceTokenResponseDTO exported from shared package for Phase 17 mobile consumption
- AssemblyAI integration documented in integrations.md alongside Ably, Clerk, and Bedrock sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Create voice token endpoint with DTO and route** - `c2bc5f5` (feat)
2. **Task 2: Document ASSEMBLYAI_API_KEY in env and integrations** - `bb1739a` (docs)

**Plan metadata:** (this SUMMARY commit)

_Note: TDD task — tests written first (RED), then implementation (GREEN), all 4 tests pass_

## Files Created/Modified
- `shared/src/dto/voice.ts` - VoiceTokenResponseDTO interface
- `shared/src/index.ts` - Added voice DTO export
- `backend/src/controllers/voice.ts` - getVoiceToken handler (500/502/200 paths)
- `backend/src/controllers/__tests__/voice.test.ts` - 4 controller tests
- `backend/src/routes/voice.ts` - Route with requireAuth + authRateLimit
- `backend/src/routes/index.ts` - Mounted voiceRoutes
- `.envrc.example` - ASSEMBLYAI_API_KEY documented with setup instructions
- `docs/architecture/integrations.md` - AssemblyAI section added, env var listed

## Decisions Made
- Read `ASSEMBLYAI_API_KEY` inside the handler function (not at module top level) — this allows `jest.resetModules()` to work correctly when testing the missing-env-var case
- Used a plain `async function` rather than the `asyncHandler` wrapper — the wrapper returns a sync void function making `await getVoiceToken(req, res, next)` in tests not wait for the inner promise to settle; plain async function resolves correctly
- AssemblyAI documented as "Optional" env var (not Required) because the app gracefully returns 500 with a clear message when missing, rather than failing to start

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced asyncHandler wrapper with plain async function**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** `asyncHandler` wraps the async fn and returns a synchronous void function. Calling `await getVoiceToken(req, res, next)` in tests resolves immediately (void), not after the inner async work completes. Tests for success/502/throw cases all failed because assertions ran before the response was set.
- **Fix:** Changed from `asyncHandler(async (...) => {...})` to `async function getVoiceToken(...) { try { ... } catch (err) { next(err); } }` — identical runtime behavior, but directly awaitable in tests
- **Files modified:** backend/src/controllers/voice.ts
- **Verification:** All 4 tests pass after fix
- **Committed in:** c2bc5f5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in testability)
**Impact on plan:** Necessary fix — same runtime behavior as plan specified, just a different wrapping approach that is compatible with direct test invocation.

## Issues Encountered
None beyond the asyncHandler deviation above.

## User Setup Required
None - no external service configuration required beyond setting `ASSEMBLYAI_API_KEY` in the backend `.env` file (already configured per plan frontmatter note).

## Next Phase Readiness
- VOICE-05 complete — Phase 17 can use `POST /api/v1/voice/token` to get streaming tokens
- Mobile should call this endpoint and then open WebSocket at `wss://streaming.assemblyai.com/v3/ws?token=<token>&sample_rate=16000`
- Phase 17 (Voice UI) can proceed without any backend dependency

## Self-Check: PASSED

All artifacts verified:
- backend/src/controllers/voice.ts - FOUND
- backend/src/routes/voice.ts - FOUND
- shared/src/dto/voice.ts - FOUND
- backend/src/controllers/__tests__/voice.test.ts - FOUND
- .planning/phases/14-foundation/14-03-SUMMARY.md - FOUND
- commit c2bc5f5 (Task 1) - FOUND
- commit bb1739a (Task 2) - FOUND

---
*Phase: 14-foundation*
*Completed: 2026-03-12*
