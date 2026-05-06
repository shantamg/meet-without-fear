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

- [x] [#369 - Stage 4 redesign: mobile proposal inventory, coverage, selection, and outcome cards](https://github.com/shantamg/meet-without-fear/issues/369)
  - Depends on: #364, #367.
  - Replace/wrap `StrategyPool`, `StrategyRanking`, and overlap UI with redesigned cards.
  - Status: draft PR updated.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `mobile/src/components/Stage4RedesignPanel.tsx`
    - `mobile/src/components/__tests__/Stage4RedesignPanel.test.tsx`
    - `mobile/src/components/index.ts`
    - `mobile/src/screens/UnifiedSessionScreen.tsx`
    - `mobile/src/screens/StrategicRepairScreen.tsx`
    - `mobile/src/screens/__tests__/StrategicRepairScreen.test.tsx`
  - Implemented so far:
    - Added a redesigned Stage 4 panel that renders proposal inventory, shared proposals, individual commitments, open needs, needs coverage audit, selection receipts, outcome cards, and no-shared-agreement closure as a valid terminal outcome.
    - Added proposal-level willingness controls wired to `POST /sessions/:id/stage4/proposals/:proposalId/selection`.
    - Preserves partner selection privacy by showing partner decisions only when `partnerDecisionVisible` is present; otherwise the receipt explains that partner choices stay private until submitted.
    - Added shared-agreement and no-shared-agreement close actions wired to `POST /sessions/:id/stage4/close`.
    - Wired `UnifiedSessionScreen` to prefer redesigned `/stage4` state when available, keeping legacy ranking/reveal full-screen surfaces as fallback only when `/stage4` state is unavailable.
    - Keeps chat input available during redesigned Stage 4 inventory building, coverage review, selection, and outcome review phases.
    - Branches resolved no-shared-agreement sessions to the redesigned outcome surface instead of the agreement-only completion screen.
    - Added `UnifiedSessionScreen` integration behavior via existing redesigned panel wiring and targeted standalone coverage for the legacy `StrategicRepairScreen` route.
    - Updated `StrategicRepairScreen` to prefer redesigned `/stage4` state when present, with legacy strategy pool/ranking/overlap/agreement surfaces preserved as fallback.
  - Validation run:
    - `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
    - `npm run check --workspace mobile`
    - `npm test --workspace mobile -- --runTestsByPath src/screens/__tests__/StrategicRepairScreen.test.tsx src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
    - `npm run check --workspace mobile`
    - Playwright static card visual harness, mobile viewport `390x1100`: screenshot `test-results/stage4-redesign/mobile.png`, rendered panel `370x1528`, no text overlaps detected.
    - Playwright static card visual harness, desktop viewport `1280x1000`: screenshot `test-results/stage4-redesign/desktop.png`, rendered panel `820x1189`, no text overlaps detected.
  - Result: targeted redesigned Stage 4 panel tests passed with 6 passed; targeted `StrategicRepairScreen` + panel suite passed with 26 passed; mobile typecheck passed; screenshot validation passed on mobile-sized and desktop-sized viewports.

- [x] [#370 - The Tending: mobile check-in and passive re-entry surface](https://github.com/shantamg/meet-without-fear/issues/370)
  - Depends on: #368, #369.
  - Add scheduled check-in and passive re-entry mobile surfaces.
  - Status: draft PR updated.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `mobile/app/(auth)/session/[id]/index.tsx`
    - `mobile/src/components/TendingPanel.tsx`
    - `mobile/src/components/__tests__/TendingPanel.test.tsx`
    - `mobile/src/components/SessionCompletionScreen.tsx`
    - `mobile/src/components/index.ts`
    - `mobile/src/hooks/queryKeys.ts`
    - `mobile/src/hooks/useStages.ts`
    - `mobile/src/hooks/__tests__/useStages.test.ts`
    - `mobile/src/hooks/index.ts`
    - `mobile/src/screens/UnifiedSessionScreen.tsx`
  - Implemented:
    - Added mobile Tending query and mutation hooks for `GET /sessions/:id/tending`, `POST /sessions/:id/tending/:entryId/responses`, and `POST /sessions/:id/tending/reentry`.
    - Added a Tending panel that selects an explicit deep-linked entry id when provided, otherwise prioritizes open/partial entries before scheduled/history entries.
    - Added scheduled shared-agreement check-in review with agreement context, status choice, reflection, and continuation choice: continue, adjust, close, new process, or other support.
    - Added passive re-entry from resolved session surfaces, including no-shared-agreement sessions with individual commitments and open needs context and no scheduled shared check-in CTA.
    - Wired resolved shared-agreement completion and redesigned no-shared-agreement closure screens to show the Tending panel.
    - Wired the session route query param `tendingEntryId` into `UnifiedSessionScreen` for notification/deep-link entry targeting.
  - Validation run:
    - `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/TendingPanel.test.tsx src/hooks/__tests__/useStages.test.ts --runInBand --forceExit`
    - `npm run check --workspace mobile`
  - Result: targeted Tending panel and mobile hook tests passed with 42 passed; mobile typecheck passed.

- [x] [#371 - Stage 4 redesign: prompts for collaborative proposal development](https://github.com/shantamg/meet-without-fear/issues/371)
  - Depends on: #365, #366, #367.
  - Update Stage 4 prompting for conversational proposal development, removals, no-shared-agreement, and Tending timing.
  - Status: draft PR updated.
  - PR: [#373 - Stage 4/Tending data model and state API](https://github.com/shantamg/meet-without-fear/pull/373)
  - Local files touched:
    - `backend/src/services/stage-prompts.ts`
    - `backend/src/services/__tests__/stage-prompts.test.ts`
  - Implemented:
    - Reframed Stage 4 prompting from an unlabeled strategy pool/ranking flow to a conversation-led proposal inventory.
    - Added prompt guidance to orient from Stage 3 needs in the user's language, invite proposals conversationally, refine one missing detail at a time, and name open needs without failure language.
    - Added explicit distinctions between shared proposals and individual commitments, including a rule that one user's willingness cannot create shared agreement pressure.
    - Added prompt handling for declined AI ideas, optional AI suggestions grounded in named needs, immediate proposal removals/revisions, no-shared-agreement as a valid closure, and Tending timing only when a shared proposal is becoming mutual or the user asks for a check-in.
    - Kept `StrategyProposed`/`ProposedStrategy` as compatibility fallback metadata, now constrained to user-endorsed concrete proposals and explicitly excluding unaccepted AI ideas, removed items, vague intentions, and one-sided willingness.
    - Added prompt regression tests for declined AI ideas, proposal removal, individual-only commitment/no-overlap closure, ranking-pressure avoidance, and structured-capture compatibility.
  - Validation run:
    - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand`
    - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage4-capture.service.test.ts --runInBand`
    - `npm run check --workspace backend`
  - Result: targeted Stage 4 prompt tests passed with 79 passed; targeted Stage 4 capture tests passed with 5 passed; backend typecheck passed.

- [ ] [#372 - Stage 4 redesign: E2E fixtures and golden-flow evaluation coverage](https://github.com/shantamg/meet-without-fear/issues/372)
  - Depends on: #367, #368, #369, #370, #371.
  - Add deterministic two-browser coverage and extend golden-flow evaluation once the redesigned Stage 4 shape exists.
  - Status: in progress.
  - Local files touched:
    - `backend/src/testing/state-factory.ts`
    - `backend/src/services/realtime.ts`
    - `e2e/helpers/session-builder.ts`
    - `e2e/playwright.config.ts`
    - `e2e/tests/two-browser-stage-4.spec.ts`
    - `e2e/tests/two-browser-stage-4-redesign.spec.ts`
  - Implemented so far:
    - Added deterministic E2E seed states for redesigned Stage 4 inventory, mutual shared selections, no-overlap selections, and partner-inactive one-sided selection.
    - Seed fixtures include shared proposals, an individual commitment, a removed proposal with revision history, and coverage rows for covered/partial/open needs.
    - Added redesigned two-user Playwright coverage for active inventory visibility, removed proposal exclusion from active inventory, selection privacy before both partners submit, rejection of shared closure when the partner is inactive, shared-agreement closure with scheduled Tending, no-shared-agreement closure without scheduled shared check-ins, and passive Tending re-entry.
    - Marked the old two-browser Stage 4 ranking spec as a skipped legacy compatibility test; redesigned coverage now lives in `two-browser-stage-4-redesign.spec.ts`.
    - Added an E2E-mode realtime no-op when `E2E_AUTH_BYPASS=true` and `ABLY_API_KEY` is absent, so deterministic closure tests do not fail after successful persistence because Ably is intentionally not configured.
    - Added the redesigned Stage 4 spec to the default Playwright project list.
  - Validation run:
    - `npm run check --workspace backend`
    - `npm run check --workspace shared`
    - `npm run check --workspace e2e`
    - `npm --workspace e2e run e2e -- --config=playwright.two-browser.config.ts tests/two-browser-stage-4-redesign.spec.ts`
  - Result: backend, shared, and E2E typechecks passed; targeted redesigned Stage 4 Playwright suite passed with 4 passed. An initial E2E run failed because Playwright reused an older API server that did not know the new seed targets; after killing the stale API/mobile processes and rerunning against the current branch, the suite passed.
  - Remaining #372 work:
    - Inspect or create the golden-flow evaluation harness path. `eval/` does not exist in this worktree, so the next pass should locate the current golden evaluation entrypoint before extending it.
    - Decide whether additional browser-rendered mobile assertions are needed beyond the deterministic two-user API contract now covered here.

## Audit Fixes Applied

### Criterion 15 Baseline — Pre-Fix Backend Suite

- Recorded: 2026-05-05 22:58:27 PDT, before audit-fix edits.
- Criterion: 15, no regressions in pre-existing backend tests.
- Required command:
  - `npm test --workspace backend --runInBand 2>&1 | tail -5`
  - Exit code: 1.
  - Output tail: npm workspace failure wrapper only; no Jest failure count visible in the last five lines.
- Baseline detail command:
  - `npm test --workspace backend --runInBand > /tmp/mwf-criterion-15-baseline.log 2>&1`
  - Exit code: 1.
  - Result: 2 failed suites, 63 passed suites, 65 total; 11 failed tests, 2 skipped tests, 1157 passed tests, 1170 total.
  - Pre-existing failure source: `backend/src/__tests__/circuit-breaker.test.ts` fails during Prisma cleanup because `DATABASE_URL` is not set.

### Fix 1 — Passive Tending Re-Entry Is Private

- Recorded: 2026-05-05 23:00:14 PDT.
- Commit: `a33e96a` (`Fix 1 keep passive tending reentry private`).
- Criteria covered: 1, 2, 3.
- Fix location:
  - `backend/src/services/tending.service.ts:306` — `createPassiveReentry` creates actor-side `USER_INITIATED_REENTRY` state and returns the actor DTO without publishing a partner-visible session event.
  - `backend/src/services/tending.service.ts:332` — separate `publishPartnerInvolvingReentryChoice` path for the eventual partner-involving choice.
- Test reference:
  - `backend/src/services/__tests__/tending.service.test.ts:247` — `passive re-entry does not notify partner`.
  - `backend/src/services/__tests__/tending.service.test.ts:295` — partner notification remains available only through the explicit partner-involving path.
- Validation:
  - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts --runInBand`
  - Exit code: 0.
  - Result: 1 passed suite; 7 passed tests.
  - `npm run check --workspace backend`
  - Exit code: 0.

### Fix 3 — Mobile Guard On Close-Without-Agreement

- Recorded: 2026-05-05 23:03:36 PDT.
- Commit: `81233de` (`Fix 3 guard no-agreement close on mobile`).
- Criteria covered: 6, 7, 8.
- Fix location:
  - `mobile/src/components/Stage4RedesignPanel.tsx:209` — reads privacy-gated `partnerSelections`.
  - `mobile/src/components/Stage4RedesignPanel.tsx:211` — requires `partnerSelections.length > 0` before enabling no-shared-agreement close.
  - `mobile/src/components/Stage4RedesignPanel.tsx:333` — renders the close-without-agreement action disabled when the guard is not met, with explanatory copy at `:355`.
  - `shared/src/dto/strategy.ts:323` and `backend/src/services/stage4-state.ts:399` — expose privacy-gated `partnerSelections` from the `/stage4` state contract.
- Test reference:
  - `mobile/src/components/__tests__/Stage4RedesignPanel.test.tsx:165` — close-without-agreement button is disabled when partner selections are empty.
  - `mobile/src/components/__tests__/Stage4RedesignPanel.test.tsx:183` — close-without-agreement button is enabled when partner selections exist.
- Validation:
  - `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
  - Exit code: 0.
  - Result: 1 passed suite; 8 passed tests.
  - `npm run check --workspace mobile`
  - Exit code: 0.
  - Additional contract checks because this fix touched shared/backend DTO shape:
    - `npm run check --workspace shared` — exit code 0.
    - `npm run check --workspace backend` — exit code 0.
    - `npm test --workspace backend -- --runTestsByPath src/routes/__tests__/stage4.test.ts --runInBand` — exit code 0; 1 passed suite, 31 passed tests.

### Stop Condition — Fix 4 Prompt Audit Line Discrepancy

- Recorded: 2026-05-05 23:04:22 PDT.
- Attempted next item: Fix 4, Stage 4 prompt contradictions.
- Required stop condition hit: audit-cited `backend/src/services/stage-prompts.ts:901` does not contain the cited `"a strategy without a follow-up is incomplete"` directive.
- Current evidence:
  - `backend/src/services/stage-prompts.ts:901` is currently `- Cards are receipts of the conversation. Do not force ranking, form-like proposal submission, or private top-three choices.`
  - `rg "FOLLOW-UP CHECK-IN|strategy without a follow-up|CELEBRATING" backend/src/services/stage-prompts.ts` finds no matches.
  - Remaining audit-matching prompt drift still exists at `backend/src/services/stage-prompts.ts:936` (`Solid experiment` grading praise) and `:950` (`Normalize that experiments can fail`).
- Resolved 2026-05-06: Shantam clarified that the audit finding was about the prompt contradictions, not exact line locations. The audit-cited lines were superseded by intervening work. Two of three contradictions were already removed; the third (grading voice at `backend/src/services/stage-prompts.ts:936`) was addressed in Fix 4 commit `33aaf50`. Regression tests now codify the posture for future drift detection.

### Fix 4 — Stage 4 Prompt Contradictions Removed

- Recorded: 2026-05-05 23:14:26 PDT.
- Commit: `33aaf50` (`Fix 4 remove Stage 4 grading prompt voice`).
- Criteria covered: 9, 10.
- Fix location:
  - `backend/src/services/stage-prompts.ts:903` — replaced `MICRO-EXPERIMENT CRITERIA (good vs bad)` with observational `PROPOSAL SHAPE` wording.
  - `backend/src/services/stage-prompts.ts:936` — replaced `Solid experiment` grading praise with observational shape-naming.
  - `backend/src/services/stage-prompts.ts:950` — replaced the failure-normalizing early Stage 4 line with reversible/provisional proposal framing.
- Line-950 judgment record:
  - Surrounding prompt excerpt after the fix:
    - `Length: default 1-3 sentences. Go longer only if they explicitly ask for help or detail.`
    - `${LATERAL_PROBING_GUIDANCE}`
    - `Do NOT mirror the user's emotional intensity in your tone.`
    - `EXAMPLE GOOD RESPONSES (adapt to context):`
    - `- User: "We should communicate better." -> "What would that actually look like? Like, a specific time or place where you'd check in?"`
    - `- User: "A 10-minute check-in after dinner each night for a week." -> "That gives this a clear shape: after dinner, each night, for one week. What would you want to talk about during those check-ins?"`
    - `- User: "I don't know where to start." -> "That's totally normal. Think about the needs we named - what's one small thing that might help with the most important one?"`
    - `- User: "Take that one off." -> "Okay, we'll take that off the table. Which need still feels most important to keep open?"`
    - `- User: "I don't think we have overlap." -> "Then we can close this without forcing a shared agreement. What, if anything, do you still want to carry as your own commitment?"`
    - `EARLY STAGE 4: User may need help shifting from needs to action. Start in INVITING mode. Keep proposals provisional and reversible; the point is learning what is actually workable, not proving anything.`
  - Reasoning: the former line (`Normalize that experiments can fail`) introduced failure-language as a stance rather than simply treating abandoned or non-working commitments as information. The replacement keeps the gold posture by making proposals reversible and informational without preparing the user for failure.
- Test reference:
  - `backend/src/services/__tests__/stage-prompts.test.ts:230` — no-shared-agreement scenario avoids failure-language tokens.
  - `backend/src/services/__tests__/stage-prompts.test.ts:254` — individual-only commitment scenario has no follow-up mandate language.
  - `backend/src/services/__tests__/stage-prompts.test.ts:275` — prompt avoids grading praise tokens.
- Validation:
  - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand`
  - Exit code: 0.
  - Result: 1 passed suite; 82 passed tests.
  - `npm run check --workspace backend`
  - Exit code: 0.

### Fix 2 — Capture Remove-Pattern Matches Non-Imperative Phrasings

- Recorded: 2026-05-05 23:16:29 PDT.
- Commit: `b0a4532` (`Fix 2 broaden Stage 4 removal capture`).
- Criteria covered: 4, 5.
- Fix location:
  - `backend/src/services/stage4-capture.service.ts:182` — broadened `hasRemoveIntent` to recognize non-imperative and pronoun-based removal language including "comes off", "taking it back", and "drop that".
  - `backend/src/services/stage4-capture.service.ts:116`, `:540`, `:552` — destructive-operation confidence threshold remains `0.85`; low-confidence destructive matches are still skipped.
- Test reference:
  - `backend/src/services/__tests__/stage4-capture.service.test.ts:121` — table-driven test covers all five required phrasings: "That comes off the list", "Take that off", "Remove that one", "I'm taking it back", and "Let's drop that".
  - Existing low-confidence destructive test remains at `backend/src/services/__tests__/stage4-capture.service.test.ts:158`.
- Validation:
  - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage4-capture.service.test.ts --runInBand`
  - Exit code: 0.
  - Result: 1 passed suite; 10 passed tests.
  - `npm run check --workspace backend`
  - Exit code: 0.

### Final Integration Criteria

- Recorded: 2026-05-05 23:18:26 PDT.
- Criterion 11, fix commits pushed in expected order:
  - Command: `git log --oneline origin/codex/stage4-tending-focus | head -12`
  - Exit code: 0.
  - Relevant order in origin log, newest first: `b0a4532 Fix 2 broaden Stage 4 removal capture`; `33aaf50 Fix 4 remove Stage 4 grading prompt voice`; `81233de Fix 3 guard no-agreement close on mobile`; `a33e96a Fix 1 keep passive tending reentry private`. Chronological landing order: Fix 1 -> Fix 3 -> Fix 4 -> Fix 2.
- Criterion 12, aggregate checks:
  - Command: `npm run check --workspace backend && npm run check --workspace mobile && npm run check --workspace shared`
  - Exit code: 0.
  - Result: backend, mobile, and shared typechecks passed.
  - Command: `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts src/services/__tests__/stage4-capture.service.test.ts src/services/__tests__/stage-prompts.test.ts --runInBand`
  - Exit code: 0.
  - Result: 3 passed suites; 99 passed tests.
  - Command: `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/Stage4RedesignPanel.test.tsx --runInBand --forceExit`
  - Exit code: 0.
  - Result: 1 passed suite; 8 passed tests.
- Criterion 15, no regressions against pre-fix backend suite baseline:
  - Command: `npm test --workspace backend --runInBand 2>&1 | tail -5`
  - Exit code: 0 from `tail`; output remains the npm workspace failure wrapper because the backend suite exits nonzero before the pipe.
  - Detail command: `npm test --workspace backend --runInBand > /tmp/mwf-criterion-15-after-fixes.log 2>&1`
  - Exit code: 1.
  - Result: 2 failed suites, 63 passed suites, 65 total; 11 failed tests, 2 skipped tests, 1167 passed tests, 1180 total.
  - Baseline comparison: failure count unchanged from the pre-fix baseline (11 failed tests, 2 failed suites), with the same pre-existing `backend/src/__tests__/circuit-breaker.test.ts` missing-`DATABASE_URL` failure. No regression detected.
- Criterion 14, PR description updated:
  - Recorded: 2026-05-05 23:19:26 PDT.
  - Updated PR #373 via GitHub connector with an "Audit Must-Fix Items Landed" section listing all four fixes and links to `docs/product/stage-4-audit-backend-foundation.md`, `docs/product/stage-4-audit-closure-and-tending.md`, `docs/product/stage-4-audit-mobile-ui.md`, `docs/product/stage-4-audit-prompts.md`, and `docs/product/stage-4-gold-question-analysis.md`.
  - Verification command: `gh pr view 373 --repo shantamg/meet-without-fear --json body,url,headRefName --jq '{url, headRefName, hasAuditSection:(.body|contains("Audit Must-Fix Items Landed")), hasAuditLinks:(.body|contains("stage-4-audit-backend-foundation.md") and contains("stage-4-audit-closure-and-tending.md") and contains("stage-4-audit-mobile-ui.md") and contains("stage-4-audit-prompts.md"))}'`
  - Exit code: 0.
  - Result: `hasAuditSection: true`, `hasAuditLinks: true`, `headRefName: codex/stage4-tending-focus`.

## Current Local State

The branch currently contains implementation patches for #363, #364, #365, #366, #367, #368, #369, #370, #371, and in-progress #372:

- Added Stage 4/Tending data model changes and migration SQL under `backend/prisma/migrations/20260506000000_add_stage4_tending_models/`.
- Added shared redesigned Stage 4/Tending DTOs and enums.
- Added `GET /sessions/:id/stage4` with backend state derivation for inventory, coverage, selections, outcome, and Tending preview.
- Added structured Stage 4 capture service and wired streaming Stage 4 turns through it.
- Added persisted Stage 4 needs coverage refresh from confirmed Stage 3 needs and active proposal inventory.
- Added redesigned Stage 4 selection and closure mutation endpoints, including shared-agreement and no-shared-agreement closure.
- Added backend Tending scheduling, list/response/reentry endpoints, and a due-entry opener script.
- Added mobile hooks/query keys for the redesigned `/stage4` state and mutations so #369 can build cards against typed contracts.
- Added redesigned mobile Stage 4 proposal inventory, coverage, willingness selection, shared-agreement outcome, and no-shared-agreement outcome cards.
- Added mobile Tending check-in, response, passive re-entry, and deep-linked entry targeting surfaces for resolved sessions.
- Updated Stage 4 prompts for conversation-led proposal inventory, declined AI ideas, proposal removals/revisions, individual-only commitments, no-shared-agreement closure, and Tending timing.
- Added deterministic redesigned Stage 4 E2E seed states and a two-user Playwright suite for inventory/removal visibility, selection privacy, shared-agreement scheduled Tending, no-shared-agreement passive Tending, and partner-inactive closure rejection.
- Kept legacy `/strategies` and `/agreements` compatibility endpoints alive.
- Kept `ProposedStrategy:` micro-tag compatibility as a fallback into structured capture.

Before continuing implementation, inspect `git diff` carefully. Do not overwrite these local changes unless the user explicitly asks.

## Recommended Next Step

Continue #372:

1. Locate the current golden-flow evaluation harness. `eval/` was referenced in the original plan but is absent in this worktree.
2. Extend golden-flow evaluation coverage against the redesigned Stage 4 fixture contract without depending on prompt nondeterminism.
3. Run the targeted eval suite plus `npm run check --workspace backend`, `npm run check --workspace e2e`, and any affected mobile checks, then update this progress file.

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

Reference: `docs/product/stage-4-gold-question-analysis.md` (gold-transcript analysis dated 2026-05-05) is the source of truth for the resolved items below. The cross-cutting posture from that analysis: **MWF is private-by-default but binding-on-cross.** Trust the consent gates the gold flow already builds in; do not add belt-and-suspenders confirmations after a crossing has occurred.

### Resolved

- **[RESOLVED] Individual commitment visibility during Stage 4.** Individual commitments are **fully visible to both partners inside the combined Stage 4 inventory** (labeled, e.g. "INDIVIDUAL COMMITMENTS (Catherine)"). The closing per-track summary remains per-user, but the live inventory is shared. Confidence: high. Evidence: James/Catherine inventory at lines 1141–1142, Adam/Eve combined inventory at lines 782/798, core protocol lines 192–198. Failure mode of the opposite: hiding individual commitments would reduce the inventory to only shared candidates and break the "first-class outcome, not a consolation prize" framing.
- **[RESOLVED] Passive Tending re-entry partner notification.** Notify the partner **only after the user chooses a partner-involving path.** Re-entry itself is private; MWF holds choices and only crosses tracks when there is coordinated, consented content to deliver. Confidence: high. Evidence: core-protocol-update.md lines 248/289/295, adam-eve.md line 1039 ("We'll hold your choices until [partner]'s check-in is complete").
- **[RESOLVED] Mutual `WILLING` selections on shared proposals are an agreement.** Closure should treat mutual-WILLING items as already-AGREED — no separate post-overlap confirm step. Codex's V1 closure decision (#367) is correct. Confidence: high. Evidence: adam-eve.md lines 788/810/814/838 — flow goes "willing → overlap → agreement document" with no intermediate "do you both confirm?" beat. Core protocol lines 215–217: "If overlap exists → that becomes the starting agreement." Failure mode of the opposite: a redundant confirm step would dilute the weight of the willingness moment and re-introduce the asymmetric "I said yes only because they said yes first" dynamic the parallel-private structure prevents.

### Open (engineering decision, not transcript-answerable)

- **`/strategies` ranking endpoints — keep indefinitely or deprecate after mobile cutover?** Engineering call. Gold transcripts give no direct signal (selection is willingness, not ordinal ranking — mild indirect support for retirement after `/stage4` is stable on mobile, but not required). Default plan: keep alive through mobile cutover, then deprecate with a notice window. Decide based on maintenance burden vs. external client impact.

## Continuation Prompt

For a new Codex session, paste:

```text
Continue with /Users/shantam/Software/meet-without-fear-stage4-tending/docs/product/stage-4-tending-continuation-prompt.md
```
