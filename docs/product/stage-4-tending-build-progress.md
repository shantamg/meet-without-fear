# Stage 4/Tending Build Progress

Last updated: 2026-05-06
Worktree: `/Users/shantam/Software/meet-without-fear-stage4-tending`
Branch: `codex/stage4-tending-focus`

## Worktree Rule

Do not edit `/Users/shantam/Software/meet-without-fear`. That is the main working directory and may contain unrelated active work.

All Stage 4/Tending implementation must happen in dedicated git worktrees only. The current Stage 4 worktree is:

`/Users/shantam/Software/meet-without-fear-stage4-tending`

If a future session needs a different branch or separate parallel track, create another sibling worktree under `/Users/shantam/Software/` and record it here before editing files.

## Operating Guardrails

- Validate every change before marking work done: `npm run check` in affected workspaces and relevant test suites must pass. Record commands and results here.
- An issue is done only when every listed sub-step is complete, check/test validation passes, and a PR is opened or merged. Otherwise keep the issue in progress.
- Commit at natural sub-checkpoints, push the branch when an issue's contract is settled, and open a PR, draft if needed, by the time the issue's mid-state is testable. Do not hoard work locally across sessions.
- The self-improvement loop owns prompt iteration on `codex/mwf-gold-self-improve-*` branches scoped to Stages 1-3. This worktree owns Stage 4 prompts (#371). If the loop proposes Stage 4 prompt changes during this redesign, defer them and surface to Shantam; do not auto-apply.
- Issues #363-#372 are Codex-driven, not pipeline-monitor-driven. Do not add `bot:pr` or `bot:milestone-builder` labels to them.

## Purpose

Track the full build-out of the Stage 4 redesign and The Tending so future Codex sessions can continue from a stable source of truth without relying on chat history.

The product direction is not "tune current Stage 4." It is a structural replacement of anonymous strategy pool + private ranking with a conversation-led proposal inventory, needs coverage audit, per-proposal willingness, valid no-shared-agreement closure, and Tending re-entry/check-ins.

## Source Of Truth

- GitHub umbrella/spec: [#212 - Stage 4 expansion + The Tending](https://github.com/shantamg/meet-without-fear/issues/212)
- GitHub execution tracker: [#282 - Gold flow implementation plan](https://github.com/shantamg/meet-without-fear/issues/282)
- GitHub eval harness: [#244 - Build evaluation harness using golden reference transcripts](https://github.com/shantamg/meet-without-fear/issues/244)
- Technical spec: `docs/product/stage-4-tending-technical-spec.md`
- Low-fi mockups: `docs/mobile/wireframes/gold-flow-mockups.md`
- Golden transcripts:
  - `docs/product/source-material/golden-transcripts/adam-eve.md`
  - `docs/product/source-material/golden-transcripts/james-catherine.md`
  - `docs/product/source-material/golden-transcripts/core-protocol-update.md`

## Implementation Issues

Build in this order unless there is a concrete reason to change sequencing.

- [x] [#363 - Stage 4 redesign: data model migration](https://github.com/shantamg/meet-without-fear/issues/363)
  - Status: draft PR opened.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `backend/prisma/schema.prisma`
    - `backend/prisma/migrations/20260506000000_add_stage4_tending_models/migration.sql`
    - `backend/src/__tests__/prisma-schema.test.ts`
  - Implementation notes:
    - Kept `Stage4ProposalRevision.actorUserId`, `Stage4NeedCoverage.sourceUserId`, and `Stage4Closure.closedByUserId` as nullable string audit fields for v1 instead of hard user relations.
    - Kept `Stage4NeedCoverage.coverageStatus` as `String` per the current technical spec so #366 can settle coverage semantics before introducing another enum.
    - Documented cascade behavior in schema/migration shape: session-owned Stage 4/Tending rows cascade with session deletion; proposal selections/revisions cascade with proposal deletion; Tending responses cascade with Tending entry deletion.
  - Validation run:
    - `DATABASE_URL=postgresql://user:pass@localhost:5432/mwf npx prisma@6.12.0 validate --schema backend/prisma/schema.prisma`
    - `npm test --workspace backend -- --runTestsByPath src/__tests__/prisma-schema.test.ts --runInBand`
  - Result: schema valid; targeted Prisma schema test passed with 35 passed, 2 skipped.

- [x] [#364 - Stage 4 redesign: state service and /stage4 API](https://github.com/shantamg/meet-without-fear/issues/364)
  - Depends on: #363.
  - Add `GET /sessions/:id/stage4`.
  - Compute redesigned Stage 4 phase and return inventory, coverage, selections, outcome, and tending preview.
  - Status: draft PR opened.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `shared/src/enums.ts`
    - `shared/src/dto/strategy.ts`
    - `backend/src/services/stage4-state.ts`
    - `backend/src/controllers/stage4.ts`
    - `backend/src/routes/stage4.ts`
    - `backend/src/lib/__mocks__/prisma.ts`
    - `backend/src/routes/__tests__/stage4.test.ts`
  - Implemented so far:
    - Added shared Stage 4/Tending enums and `GetStage4StateResponse` DTO family.
    - Added `GET /sessions/:id/stage4`.
    - Added backend state service that reads legacy `StrategyProposal`/`Agreement` rows plus new selection, coverage, closure, and Tending tables.
    - Computes initial inventory, coverage review, selection, outcome review, closing, closed shared-agreement, and closed no-shared-agreement phases.
    - Preserves partner selection privacy until both users have submitted at least one selection.
    - Represents `NO_SHARED_AGREEMENT` closure without requiring Agreement rows.
    - Added tests for coverage-review, both-submitted outcome-review, and shared-agreement closure with Tending preview.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/routes/__tests__/stage4.test.ts --runInBand`
    - `npm run check --workspace backend`
    - `npm run check --workspace shared`
    - `DATABASE_URL=postgresql://user:pass@localhost:5432/mwf npx prisma@6.12.0 validate --schema backend/prisma/schema.prisma`
    - `npm test --workspace backend -- --runTestsByPath src/__tests__/prisma-schema.test.ts --runInBand`
  - Result: targeted Stage 4 route tests passed with 26 passed; backend and shared typechecks passed; Prisma schema valid; targeted Prisma schema test passed with 35 passed, 2 skipped.
  - Remaining #364 work:
    - Optional before mobile integration: move DTOs from `shared/src/dto/strategy.ts` into a dedicated `stage4.ts` file if shared DTO organization becomes noisy.
    - Optional before external clients depend on it: add route-level response contract validation if the shared contract layer is preferred over DTO-only typing.

- [x] [#365 - Stage 4 redesign: structured conversation capture service](https://github.com/shantamg/meet-without-fear/issues/365)
  - Depends on: #363, #364.
  - Replace Stage 4 reliance on `ProposedStrategy:` micro-tags with structured capture after each user turn.
  - Status: draft PR opened.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `backend/src/services/stage4-capture.service.ts`
    - `backend/src/services/__tests__/stage4-capture.service.test.ts`
    - `backend/src/controllers/messages.ts`
    - `backend/src/services/stage-tools.ts`
  - Implemented:
    - Added a typed Stage 4 capture service contract for inventory operations, selection capture, closure signals, and Tending timing signals.
    - Added deterministic v1 capture/application for add, revise, remove, restore, and willingness selection phrases.
    - Records `Stage4ProposalRevision` history for created, revised, removed, restored, and low-confidence destructive captures that match a proposal.
    - Requires higher confidence for destructive operations; low-confidence removal language does not mutate inventory.
    - Routes legacy `ProposedStrategy:` micro-tag output through the structured capture service as compatibility fallback instead of direct proposal writes.
    - Selection capture writes `Stage4ProposalSelection` only; it does not create shared agreements from one user's willingness.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage4-capture.service.test.ts --runInBand`
    - `npm run check --workspace backend`
  - Result: targeted Stage 4 capture tests passed with 5 passed; backend typecheck passed.

- [x] [#366 - Stage 4 redesign: needs coverage audit](https://github.com/shantamg/meet-without-fear/issues/366)
  - Depends on: #363, #364.
  - Generate covered, partly covered, and still-open needs from Stage 3 needs plus active proposals.
  - Status: draft PR opened.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `backend/src/services/stage4-coverage.service.ts`
    - `backend/src/services/__tests__/stage4-coverage.service.test.ts`
    - `backend/src/services/stage4-capture.service.ts`
    - `backend/src/services/stage4-state.ts`
  - Implemented:
    - Added a deterministic coverage refresh service that reads confirmed Stage 3 needs from session user vessels and compares them against non-removed Stage 4 proposals.
    - Persists `Stage4NeedCoverage` rows for covered, partial, and open needs with source user id, linked proposal ids, and no-failure audit notes.
    - Refreshes coverage after captured add, revise, remove, and restore inventory operations.
    - Uses persisted coverage rows to populate proposal-card `needsAddressed`, including partial coverage, while retaining legacy proposal `needsAddressed` fallback.
    - Keeps all-needs-open coverage valid so later no-shared-agreement closure can persist open need ids without treating the session as failed.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage4-coverage.service.test.ts src/services/__tests__/stage4-capture.service.test.ts src/routes/__tests__/stage4.test.ts --runInBand`
    - `npm run check --workspace backend`
  - Result: targeted Stage 4 coverage/capture/state route tests passed with 34 passed; backend typecheck passed.

- [x] [#367 - Stage 4 redesign: selection, outcome, and no-shared-agreement closure](https://github.com/shantamg/meet-without-fear/issues/367)
  - Depends on: #363, #364, #366.
  - Replace ranking overlap with per-proposal willingness.
  - Allow both `SHARED_AGREEMENT` and `NO_SHARED_AGREEMENT` closure kinds.
  - Status: draft PR updated.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `shared/src/dto/strategy.ts`
    - `backend/src/controllers/stage4.ts`
    - `backend/src/routes/stage4.ts`
    - `backend/src/routes/__tests__/stage4.test.ts`
    - `mobile/src/hooks/queryKeys.ts`
    - `mobile/src/hooks/useStages.ts`
    - `mobile/src/hooks/__tests__/useStages.test.ts`
    - `mobile/src/utils/realtimeInvalidation.ts`
    - `mobile/src/utils/__tests__/realtimeInvalidation.test.ts`
  - Implemented so far:
    - Added shared request/response DTOs for single selection, bulk selections, and Stage 4 closure.
    - Added `POST /sessions/:id/stage4/proposals/:proposalId/selection`.
    - Added `POST /sessions/:id/stage4/selections`.
    - Added `POST /sessions/:id/stage4/close`.
    - Selection writes `Stage4ProposalSelection`, marks the user's Stage 4 `selectionSubmitted` gate, returns refreshed redesigned Stage 4 state, and preserves partner decision privacy through the existing state service.
    - Shared-agreement closure requires both partners to have submitted selections and at least one active shared proposal with mutual `WILLING`; it creates `AGREED` Agreement rows, marks converted proposals, records conversion revisions, creates `Stage4Closure(kind = SHARED_AGREEMENT)`, resolves the session, and completes open stage progress.
    - No-shared-agreement closure resolves without agreements, persists `Stage4Closure(kind = NO_SHARED_AGREEMENT)`, carries forward willing individual commitments, and stores open/partial coverage ids.
    - Partner inactivity cannot create a shared obligation: requested shared-agreement closure is rejected unless both partners submitted selections.
    - Added mobile query/mutation hooks for `GET /stage4`, single selection, bulk selections, and close; these cache refreshed redesigned state and keep legacy Stage 4 caches invalidated during the transition.
    - Added redesigned Stage 4 state to mobile realtime invalidation keys.
    - V1 closure decision: mutual `WILLING` selections on shared proposals are treated as agreement consent for closure, so closure creates already-`AGREED` agreements. Existing legacy agreement confirmation endpoints remain available for compatibility-created agreements.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/routes/__tests__/stage4.test.ts --runInBand`
    - `npm run check --workspace backend`
    - `npm run check --workspace shared`
    - `npm test --workspace mobile -- --runTestsByPath src/hooks/__tests__/useStages.test.ts src/utils/__tests__/realtimeInvalidation.test.ts --runInBand --forceExit`
    - `npm run check --workspace mobile`
  - Result: targeted Stage 4 route tests passed with 31 passed; backend, shared, and mobile typechecks passed; targeted mobile hook/realtime tests passed with 40 passed. The same mobile Jest suite also passed without `--forceExit` but stayed open on an existing async handle after reporting success, so the recorded clean-exit command used `--forceExit`.

- [x] [#368 - The Tending: backend scheduling, responses, and passive re-entry](https://github.com/shantamg/meet-without-fear/issues/368)
  - Depends on: #363, #367.
  - Add scheduled shared-agreement check-ins and user-initiated passive re-entry.
  - Status: draft PR updated.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `shared/src/dto/strategy.ts`
    - `backend/src/services/tending.service.ts`
    - `backend/src/services/__tests__/tending.service.test.ts`
    - `backend/src/controllers/tending.ts`
    - `backend/src/routes/tending.ts`
    - `backend/src/routes/index.ts`
    - `backend/src/controllers/stage4.ts`
    - `backend/src/scripts/open-due-tending-entries.ts`
  - Implemented:
    - Added shared Tending DTOs for entries, responses, list responses, response submission, and passive re-entry creation.
    - Added a Tending service that schedules shared-agreement check-ins only for agreements with follow-up timing.
    - Wired Stage 4 shared-agreement closure to create scheduled/open Tending entries inside the same transaction as agreement creation.
    - Added `GET /sessions/:id/tending`.
    - Added `POST /sessions/:id/tending/:entryId/responses` with one response per entry/user via upsert.
    - Response aggregation marks entries `PARTIAL` after one side responds and `COMPLETED` once all session members have responded; it does not invent absent partner feedback.
    - Added `POST /sessions/:id/tending/reentry` for user-initiated passive re-entry on any resolved session.
    - Passive re-entry summary is seeded from Stage 4 closure, shared agreements, individual commitments, open/partial needs, optional user intent, and available session summary.
    - Added `backend/src/scripts/open-due-tending-entries.ts` as the scheduler/cron entrypoint for opening due scheduled check-ins and publishing pending-action events.
    - No-shared-agreement closure remains free of scheduled shared check-ins because scheduling is only invoked in the shared-agreement closure branch.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts src/routes/__tests__/stage4.test.ts --runInBand`
    - `npm run check --workspace backend`
    - `npm run check --workspace shared`
  - Result: targeted Tending service and Stage 4 route tests passed with 36 passed; backend and shared typechecks passed.
  - Commit/push:
    - `3b70ce4 Add Tending backend scheduling and reentry`
    - Pushed `codex/stage4-tending-focus` to origin.

- [ ] [#369 - Stage 4 redesign: mobile proposal inventory, coverage, selection, and outcome cards](https://github.com/shantamg/meet-without-fear/issues/369)
  - Depends on: #364, #367.
  - Replace/wrap `StrategyPool`, `StrategyRanking`, and overlap UI with redesigned cards.
  - Status: in progress.
  - Local files touched:
    - `mobile/src/components/Stage4RedesignPanel.tsx`
    - `mobile/src/components/__tests__/Stage4RedesignPanel.test.tsx`
    - `mobile/src/components/index.ts`
    - `mobile/src/screens/UnifiedSessionScreen.tsx`
  - Implemented so far:
    - Added a redesigned Stage 4 panel that renders proposal inventory, shared proposals, individual commitments, open needs, needs coverage audit, selection receipts, outcome cards, and no-shared-agreement closure as a valid terminal outcome.
    - Added proposal-level willingness controls wired to `POST /sessions/:id/stage4/proposals/:proposalId/selection`.
    - Preserves partner selection privacy by showing partner decisions only when `partnerDecisionVisible` is present; otherwise the receipt explains that partner choices stay private until submitted.
    - Added shared-agreement and no-shared-agreement close actions wired to `POST /sessions/:id/stage4/close`.
    - Wired `UnifiedSessionScreen` to prefer redesigned `/stage4` state when available, keeping legacy ranking/reveal full-screen surfaces as fallback only when `/stage4` state is unavailable.
    - Keeps chat input available during redesigned Stage 4 inventory building, coverage review, selection, and outcome review phases.
    - Branches resolved no-shared-agreement sessions to the redesigned outcome surface instead of the agreement-only completion screen.
  - Validation run:
    - `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
    - `npm run check --workspace mobile`
  - Result: targeted redesigned Stage 4 panel tests passed with 6 passed; mobile typecheck passed.
  - Remaining #369 work:
    - Add or update integration tests around `UnifiedSessionScreen` so the redesigned panel replaces legacy Stage 4 surfaces when `/stage4` state is present.
    - Run mobile-sized and desktop-sized screenshot validation for the redesigned cards and record results.
    - Decide whether `StrategicRepairScreen` still needs the redesigned surface or is now legacy-only; if still reachable in production, wrap it with the same `/stage4` panel/fallback behavior.

- [ ] [#370 - The Tending: mobile check-in and passive re-entry surface](https://github.com/shantamg/meet-without-fear/issues/370)
  - Depends on: #368, #369.
  - Add scheduled check-in and passive re-entry mobile surfaces.

- [ ] [#371 - Stage 4 redesign: prompts for collaborative proposal development](https://github.com/shantamg/meet-without-fear/issues/371)
  - Depends on: #365, #366, #367.
  - Update Stage 4 prompting for conversational proposal development, removals, no-shared-agreement, and Tending timing.

- [ ] [#372 - Stage 4 redesign: E2E fixtures and golden-flow evaluation coverage](https://github.com/shantamg/meet-without-fear/issues/372)
  - Depends on: #367, #368, #369, #370, #371.
  - Add deterministic two-browser coverage and extend golden-flow evaluation once the redesigned Stage 4 shape exists.

## Current Local State

The branch currently contains implementation patches for #363, #364, #365, #366, #367, and #368:

- Added Stage 4/Tending data model changes and migration SQL under `backend/prisma/migrations/20260506000000_add_stage4_tending_models/`.
- Added shared redesigned Stage 4/Tending DTOs and enums.
- Added `GET /sessions/:id/stage4` with backend state derivation for inventory, coverage, selections, outcome, and Tending preview.
- Added structured Stage 4 capture service and wired streaming Stage 4 turns through it.
- Added persisted Stage 4 needs coverage refresh from confirmed Stage 3 needs and active proposal inventory.
- Added redesigned Stage 4 selection and closure mutation endpoints, including shared-agreement and no-shared-agreement closure.
- Added backend Tending scheduling, list/response/reentry endpoints, and a due-entry opener script.
- Added mobile hooks/query keys for the redesigned `/stage4` state and mutations so #369 can build cards against typed contracts.
- Kept legacy `/strategies` and `/agreements` compatibility endpoints alive.
- Kept `ProposedStrategy:` micro-tag compatibility as a fallback into structured capture.

Before continuing implementation, inspect `git diff` carefully. Do not overwrite these local changes unless the user explicitly asks.

## Recommended Next Step

Move to #369:

1. Inspect the current mobile Stage 4 surfaces: `StrategyPool`, `StrategyRanking`, overlap UI, `UnifiedSessionScreen`, and `useStages`.
2. Build redesigned proposal inventory, coverage, selection, and outcome cards against the `/stage4` DTOs added in #364/#367.
3. Keep legacy strategy/ranking UI available only as compatibility fallback while moving the main Stage 4 mobile flow to `/stage4`.
4. Validate mobile tests/typecheck and update this progress file.

## Parallelization Guidance

Use subagents only after the active issue has a stable contract. Safe parallel tracks:

- After #363: one worker can draft shared DTOs while another builds the backend state service.
- After #364: one worker can build mobile cards against mocked DTOs while another builds capture/coverage.
- After #367: one worker can build Tending backend while another integrates Stage 4 mobile cards.
- After #369/#370: one worker can build E2E fixtures while another tunes prompts.

Avoid parallel writes to:

- `backend/prisma/schema.prisma`
- `backend/src/controllers/stage4.ts`
- `backend/src/routes/stage4.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/hooks/useUnifiedSession.ts`
- `shared/src/dto/strategy.ts`

These files are likely integration hot spots.

## Mockup Decision

Do not block on polished mockups. Use the existing low-fi mockups and the DTO contracts in the technical spec.

Build first against real data contracts, then inspect screenshots and golden-session runs. The core risk is state-machine correctness, not visual styling.

## Questions For Shantam

- For v1, should individual commitments be privately owned but visible as outcome summaries, or fully visible to both partners during Stage 4?
- Should passive Tending re-entry notify the partner only after the user chooses a partner-involving path, as currently specified?
- Should old `/strategies` ranking endpoints remain indefinitely for compatibility, or be explicitly legacy/deprecated after mobile moves to `/stage4`?

## Continuation Prompt

For a new Codex session, paste:

```text
Continue with /Users/shantam/Software/meet-without-fear-stage4-tending/docs/product/stage-4-tending-continuation-prompt.md
```
