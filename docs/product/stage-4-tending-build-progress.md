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

- [ ] [#366 - Stage 4 redesign: needs coverage audit](https://github.com/shantamg/meet-without-fear/issues/366)
  - Depends on: #363, #364.
  - Generate covered, partly covered, and still-open needs from Stage 3 needs plus active proposals.

- [ ] [#367 - Stage 4 redesign: selection, outcome, and no-shared-agreement closure](https://github.com/shantamg/meet-without-fear/issues/367)
  - Depends on: #363, #364, #366.
  - Replace ranking overlap with per-proposal willingness.
  - Allow both `SHARED_AGREEMENT` and `NO_SHARED_AGREEMENT` closure kinds.

- [ ] [#368 - The Tending: backend scheduling, responses, and passive re-entry](https://github.com/shantamg/meet-without-fear/issues/368)
  - Depends on: #363, #367.
  - Add scheduled shared-agreement check-ins and user-initiated passive re-entry.

- [ ] [#369 - Stage 4 redesign: mobile proposal inventory, coverage, selection, and outcome cards](https://github.com/shantamg/meet-without-fear/issues/369)
  - Depends on: #364, #367.
  - Replace/wrap `StrategyPool`, `StrategyRanking`, and overlap UI with redesigned cards.

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

The branch currently contains implementation patches for #363, #364, and #365:

- Added Stage 4/Tending data model changes and migration SQL under `backend/prisma/migrations/20260506000000_add_stage4_tending_models/`.
- Added shared redesigned Stage 4/Tending DTOs and enums.
- Added `GET /sessions/:id/stage4` with backend state derivation for inventory, coverage, selections, outcome, and Tending preview.
- Added structured Stage 4 capture service and wired streaming Stage 4 turns through it.
- Kept legacy `/strategies` and `/agreements` compatibility endpoints alive.
- Kept `ProposedStrategy:` micro-tag compatibility as a fallback into structured capture.

Before continuing implementation, inspect `git diff` carefully. Do not overwrite these local changes unless the user explicitly asks.

## Recommended Next Step

Move to #366:

1. Inspect Stage 3 confirmed/shared need persistence and the `GET /sessions/:id/stage4` coverage DTO.
2. Implement a needs coverage audit service that compares Stage 3 needs against active Stage 4 proposals.
3. Persist covered, partial, and open rows in `Stage4NeedCoverage`.
4. Add route/service tests covering covered, partial, and open needs plus proposal removal/revision effects.
5. Keep coverage semantics conservative and update the question list if the exact partial/covered threshold needs product judgment.

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
