# /goal Prompt: Build the Full Tending Flow

Use this prompt as the body for a large `/goal` session.

## Objective

Build out the full Tending / Stage 5 flow for Meet Without Fear, grounded in the Stage 4 and Beyond transcript and the current Stage 4/Tending implementation plan. Work in small validated chunks, keep the flow compatible with existing Stage 4 closure behavior, and finish with a real browser verification pass starting from a Stage 4 database snapshot.

The target product outcome is:

- Stage 4 produces measurable, follow-up-able agreements and individual commitments.
- Tending is the continuation after Stage 4, not a generic reflection form.
- A check-in asks what actually happened, whether each commitment was kept, whether it helped the underlying need, what blocked it if not, and whether the need now feels resolved.
- If the current approach did not work, Tending can adjust the commitment, schedule reminders, reopen Stage 4 strategy work around the still-open need, or start a new process linked to the prior session.
- Passive re-entry remains private until the user explicitly chooses a partner-involving path.
- Scheduled shared check-ins notify both users only for shared agreements; private individual reminders/check-ins do not notify the partner.
- The mobile UI guides one thing at a time while keeping the full list inspectable.
- The resulting record is useful for future MWF context and eventual therapist/professional review: what was agreed, what happened, what worked, what did not, what changed, and what remains open.

## Required Source Material

Read these before coding:

- `docs/product/source-material/stage-4-and-beyond-transcript.md`
- `docs/product/tending-implementation-plan.md`
- `docs/product/stage-4-tending-technical-spec.md`
- `docs/product/stage-4-tending-build-progress.md`
- `docs/product/stage-4-gold-question-analysis.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `CLAUDE.md`

Also inspect the current implementation before editing:

- `backend/prisma/schema.prisma`
- `shared/src/enums.ts`
- `shared/src/dto/strategy.ts`
- `backend/src/services/tending.service.ts`
- `backend/src/controllers/tending.ts`
- `backend/src/routes/tending.ts`
- `backend/src/controllers/stage4.ts`
- `backend/src/services/stage4-prompts.ts`
- `backend/src/services/stage-prompts.ts`
- `mobile/src/components/TendingPanel.tsx`
- `mobile/src/screens/TendingCheckinScreen.tsx`
- `mobile/app/(auth)/session/[id]/tending-checkin.tsx`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `backend/src/testing/state-factory.ts`
- `e2e/helpers/session-builder.ts`
- existing Stage 4/Tending tests under `backend/src/**/__tests__`, `mobile/src/**/__tests__`, and `e2e/tests/`

## Worktree and Branch Rules

- Do not use `prisma db push`.
- Use a proper Prisma migration for schema changes.
- Start in a dedicated worktree or branch with the `codex/` prefix.
- If `docs/product/stage-4-tending-build-progress.md` names an active dedicated worktree, prefer that worktree unless it no longer exists or the user explicitly says otherwise.
- If the recorded dedicated worktree does not exist, create a new sibling worktree under `/Users/shantam/Software/` on a `codex/` branch, then update `docs/product/stage-4-tending-build-progress.md` before implementation.
- If this prompt, the transcript, or `docs/product/tending-implementation-plan.md` only exists in another checkout, copy or apply those docs into the active implementation worktree first and commit or record that import as the first progress checkpoint.
- Before editing, inspect `git status --short --branch` and `git diff`.
- Do not revert unrelated local changes.
- Create or update a progress section in `docs/product/stage-4-tending-build-progress.md` after every meaningful chunk. Include:
  - current branch/worktree,
  - files changed,
  - decisions made,
  - commands run,
  - test results,
  - known blockers,
  - next step.
- Commit at coherent checkpoints. Do not hoard all work into one final commit.

## Preflight Before Coding

Before implementing Chunk 1:

1. Confirm the active implementation worktree and branch.
2. Confirm the required source docs are present in that worktree.
3. Inspect the current Stage 4/Tending implementation and any uncommitted changes.
4. Read `docs/product/stage-4-tending-build-progress.md` and append a new "Full Tending Flow" progress section with the starting branch/worktree, current status, and first intended chunk.
5. Verify whether any already-landed work partially satisfies a chunk. Treat existing code as evidence only after reading it and running the relevant tests.

## Non-Negotiable Product Rules

- Preserve the "never a three-way" principle. Each user talks to MWF, not directly to the partner.
- Preserve private-by-default Tending re-entry. Do not notify the partner just because one user reopened a resolved session.
- Do not treat agreement as resolution. Tending must check whether the agreement actually happened and whether the underlying need feels resolved.
- Do not shame failed follow-through. If someone did not do a commitment, treat that as information: forgot, too hard, too frequent, unclear, partner did not do part, I did not do part, circumstances changed, no longer wanted, other.
- Do not make full closure feel like abandonment. If the need is genuinely resolved enough, closure is dignified.
- Do not create scheduled shared check-ins for no-shared-agreement closure.
- Individual commitment reminders/check-ins are private unless the owner explicitly opts in to share.
- Shared reminders require a shared entry or explicit partner-involving path.
- Keep compatibility endpoints alive until the richer flow has mobile coverage.

## Implementation Plan

Implement this in small chunks. After each chunk, run targeted checks before moving on.

### Chunk 1: Contract and Schema

Goal: add additive data structures for structured Tending without breaking existing responses.

Implement:

- Add Prisma/shared enums:
  - `TendingFollowThroughStatus`
  - `TendingHelpfulnessStatus`
  - `TendingBlockerCategory`
  - `TendingNeedResolutionStatus`
  - `TendingNextAction`
  - `TendingReminderScope`
- Add a batch-level `TendingCheckin` model.
- Add optional `checkinId` to `TendingResponse`.
- Add `TendingEntryOutcome`.
- Add `TendingNeedOutcome`.
- Add `TendingReminder` if no existing notification/reminder table can cleanly represent private/shared Tending reminders.
- Add relations from `Session`, `User`, `TendingEntry`, `TendingResponse`, and `TendingCheckin` as needed.
- Extend shared DTOs in `shared/src/dto/strategy.ts`.
- Keep all new DTO fields optional where needed so existing code compiles.

Validation:

- `DATABASE_URL=postgresql://user:pass@localhost:5432/mwf npx prisma@6.12.0 validate --schema backend/prisma/schema.prisma`
- `npm run check --workspace shared`
- `npm run check --workspace backend`
- Existing targeted Prisma schema test, if present.

Checkpoint:

- Update `docs/product/stage-4-tending-build-progress.md`.
- Commit this chunk.

### Chunk 2: Backend Structured Check-In Persistence

Goal: make `/sessions/:id/tending/checkin` persist structured follow-through and need-resolution data.

Implement:

- Update `backend/src/controllers/tending.ts` Zod schema for the richer payload.
- Update `submitTendingCheckin` in `backend/src/services/tending.service.ts`:
  - create one `TendingCheckin` parent per submission;
  - upsert one `TendingResponse` per visible/respondable open entry;
  - set `checkinId` on responses created by this endpoint;
  - persist per-entry outcomes;
  - persist per-need outcomes;
  - persist per-entry notes rather than dropping `perEntryNotes`;
  - create reminders when supplied;
  - keep legacy `reflection` text as a readable backup summary.
- Keep `/sessions/:id/tending/:entryId/responses` working as legacy single-entry response.
- Extend list mapping so the current user can see relevant structured outcomes in `TendingEntryDTO`.
- Add or extend a reminder opener script if reminders are implemented separately from scheduled entries.

Validation:

- Add backend unit tests for:
  - structured entry outcomes persist;
  - per-entry notes persist;
  - need outcomes persist;
  - reminder creation honors private/shared scope;
  - private reminders do not notify partner;
  - passive re-entry remains private.
- Run:
  - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts --runInBand`
  - `npm run check --workspace backend`

Checkpoint:

- Update progress doc.
- Commit this chunk.

### Chunk 3: Backend Tending Path Semantics

Goal: make the five Tending paths use the structured outcomes, not just the selected choice.

Implement:

- For `FULL_CLOSURE`:
  - complete relevant entries;
  - require submitted needs to be `RESOLVED` or clearly acknowledged as resolved enough, unless the user explicitly overrides;
  - record override in a note rather than blocking indefinitely.
- For `EXTEND`:
  - reschedule continuing entries only;
  - do not extend entries whose linked need is resolved.
- For `PARTIAL_CLOSURE`:
  - close resolved entries;
  - reschedule continuing entries;
  - persist need outcomes too, not only entry outcomes.
- For `ANOTHER_ROUND`:
  - treat this as "reopen strategy work";
  - preserve prior history and agreements as context;
  - avoid blindly deleting all useful coverage/history;
  - seed the next Stage 4 walkthrough around still-open need ids from `TendingNeedOutcome`.
- For `NEW_PROCESS`:
  - create a new session linked with `previousSessionId`;
  - preserve enough prior Tending summary for context retrieval.
- Add a conservative recommendation helper:
  - if a need is `STILL_OPEN` and linked entries did not happen or did not help, recommend adjustment or strategy reopening rather than extension/full closure.

Validation:

- Add backend tests for each path with structured outcomes.
- Run:
  - `npm test --workspace backend -- --runTestsByPath src/services/__tests__/tending.service.test.ts src/routes/__tests__/stage4.test.ts --runInBand`
  - `npm run check --workspace backend`
  - `npm run check --workspace shared`

Checkpoint:

- Update progress doc.
- Commit this chunk.

### Chunk 4: Tending Prompt and Conversation Support

Goal: wire the Tending prompt posture into real code paths.

Implement:

- Keep `RESOLVED_LISTEN_FIRST_CLAUSE` for resolved-session pre-check-in chat.
- Add or extend a Tending conversation builder that can construct prompts for:
  - `whatHappened` / `whatWorked`,
  - `whereMoreSupport`,
  - `needsReview`,
  - `whatComesNext`.
- Update `backend/src/services/stage4-prompts.ts`:
  - revise `TENDING_WHAT_WORKED_PERSONA` to ask what actually happened before asking what worked;
  - extend `TENDING_MORE_SUPPORT_PERSONA` with blocker categories;
  - add `TENDING_NEEDS_REVIEW_PERSONA`;
  - extend `TENDING_WHAT_COMES_NEXT_PERSONA` so failed follow-through points toward adjustment/reopen work, not generic extension.
- Make prompt tests assert:
  - Tending does not treat agreement as resolution;
  - failed follow-through is information, not failure;
  - the underlying need is checked;
  - partner crossing requires explicit partner-involving action.

Validation:

- `npm test --workspace backend -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts src/services/__tests__/stage4-prompts.test.ts --runInBand`
- `npm run check --workspace backend`

Checkpoint:

- Update progress doc.
- Commit this chunk.

### Chunk 5: Mobile UI Consolidation

Goal: make the rich `TendingCheckinScreen` the canonical scheduled/open check-in flow.

Implement:

- In `TendingPanel`:
  - keep resolved-session summary, scheduled/open entry list, passive re-entry, and individual share/unshare;
  - remove or hide the legacy one-entry "Save review" flow for scheduled/open entries;
  - add "Start check-in" CTA for open or due entries;
  - route to `/session/${sessionId}/tending-checkin`, preserving `tendingEntryId` if deep-linked.
- In `TendingCheckinScreen`:
  - Step 1: commitment receipt plus "what actually happened?" with happened/partly/did-not-happen controls.
  - Step 2: "did it help?" plus blocker category when not.
  - Step 3: one linked need at a time: resolved, improving, still open, changed, not sure.
  - Step 4: what comes next: full closure, extend, adjust, reopen strategy work, new process, plus reminder controls.
  - Keep reflections and per-entry notes for compatibility.
- In hooks:
  - update `useSubmitTendingCheckin` types;
  - preserve cache behavior for `stageKeys.tending(sessionId)` and `stageKeys.stage4(sessionId)`.
- In route handling:
  - navigate correctly for reopen strategy work, new process, full closure, partial closure, extend;
  - show confirmation for next check-in/reminder.

Validation:

- Add or update mobile tests for:
  - `TendingPanel` launches the check-in route instead of submitting legacy review for open scheduled entries;
  - `TendingCheckinScreen` submits structured entry outcomes;
  - `TendingCheckinScreen` submits need outcomes;
  - reminder controls appear for extend/adjust paths;
  - partial closure still works;
  - passive re-entry still works for no-shared-agreement outcomes.
- Run:
  - `npm test --workspace mobile -- --runTestsByPath src/components/__tests__/TendingPanel.test.tsx src/screens/__tests__/TendingCheckinScreen.test.tsx src/hooks/__tests__/useStages.test.ts --runInBand --forceExit`
  - `npm run check --workspace mobile`

Checkpoint:

- Update progress doc.
- Commit this chunk.

### Chunk 6: E2E Fixtures and Small Browser Tests

Goal: prove the flow in deterministic slices before the final full browser pass.

Implement:

- Add or extend seeded fixtures in `backend/src/testing/state-factory.ts` and `e2e/helpers/session-builder.ts`:
  - Stage 4 near closure with shared agreement and check-in date;
  - resolved shared-agreement session with due Tending entry;
  - resolved no-shared-agreement session with passive re-entry available;
  - lawn/boundary fixture:
    - need: healthy, clean space;
    - shared commitment: no repeat boundary violation / immediate cleanup if it happens;
    - alternative individual/self-protective strategy;
    - due check-in where shared commitment failed.
- Add small E2E tests:
  - shared agreement creates scheduled Tending;
  - due check-in opens;
  - user can submit structured failed follow-through;
  - still-open need can reopen strategy work;
  - worked agreement can fully close;
  - private reminder does not notify partner;
  - passive re-entry remains private.

Validation:

- `npm run check --workspace e2e`
- Run targeted Playwright specs, for example:
  - `npm --workspace e2e run e2e -- --config=playwright.two-browser.config.ts tests/tending-checkin.spec.ts`
  - or the repo's current equivalent command if names differ.

Checkpoint:

- Update progress doc.
- Commit this chunk.

### Chunk 7: Eval/Rubric Update

Goal: make the gold/eval harness catch shallow Tending.

Implement:

- Locate the current active eval entrypoint. Do not assume `eval/` structure without checking.
- Add rubric coverage that fails if:
  - Tending only asks "how did it go?";
  - Tending never checks whether commitments happened;
  - Tending never checks whether the underlying need is resolved;
  - Tending treats failed follow-through as a personal failure;
  - Tending notifies partner on private re-entry or private reminder.
- Add a scorer/eval fixture for the lawn/boundary example if the harness supports it.

Validation:

- Run the targeted eval/scorer tests or scripts for the changed harness.
- Record exact command/results in the progress doc.

Checkpoint:

- Update progress doc.
- Commit this chunk.

## Final Real Browser Pass From Stage 4 Snapshot

After all chunks pass, do a final manual-realistic browser pass starting from a Stage 4 database snapshot.

Requirements:

1. Locate an existing Stage 4 snapshot under `backend/snapshots/` or create a new deterministic snapshot from a seeded Stage 4 fixture.
2. Restore or seed a session at Stage 4 just before closure. Prefer a fixture with:
   - at least one shared proposal with mutual willingness potential;
   - at least one individual commitment;
   - at least one linked need;
   - a check-in date that can be made due immediately.
3. Start the backend/mobile dev environment the repo expects for browser testing.
4. Use a real browser automation path, not only unit tests. Prefer the repo's existing Playwright/browser setup.
5. Drive the flow:
   - open the Stage 4 session;
   - close with a shared agreement and check-in date;
   - verify Tending entries are created;
   - make the check-in due/open, either through time fixture, DB update, or `open-due-tending-entries` script;
   - open the resolved session;
   - launch the Tending check-in UI;
   - submit a failed follow-through outcome and mark the need still open;
   - choose reopen strategy work;
   - verify the session returns to an active Stage 4-style path focused on the still-open need;
   - repeat or use a second fixture where the agreement worked, mark need resolved, choose full closure, and verify entries complete.
6. Capture screenshots or Playwright artifacts for:
   - Stage 4 closure state;
   - resolved session with Tending launcher;
   - Tending check-in commitment review;
   - need resolution review;
   - what comes next path;
   - reopened strategy work or full closure confirmation.
7. Record exact commands, fixture IDs/session IDs, and artifact paths in `docs/product/stage-4-tending-build-progress.md`.

The final pass is not complete unless a real browser exercised the Stage 4 closure → Tending due/open → Tending check-in → next path transition.

## Final Verification Commands

Run the broadest practical checks before declaring the goal complete:

- `npm run check --workspace shared`
- `npm run check --workspace backend`
- `npm run check --workspace mobile`
- `npm run check --workspace e2e`
- Targeted backend Tending and Stage 4 tests
- Targeted mobile Tending tests
- Targeted Playwright Tending/Stage 4 tests
- Targeted eval/scorer tests if modified

If full `npm test` is too slow or has known pre-existing failures, run it once, record the baseline/failures, and clearly distinguish pre-existing failures from regressions caused by this work.

## Completion Criteria

Stop only when all are true:

1. The transcript and `tending-implementation-plan.md` remain linked as source material.
2. Additive Prisma migration exists and validates.
3. Shared DTOs/enums expose structured Tending outcomes.
4. `/sessions/:id/tending/checkin` persists batch check-in, entry outcomes, need outcomes, and reminders.
5. Legacy single-entry Tending response still works or is explicitly compatibility-preserved.
6. Tending path semantics use structured outcomes.
7. Passive re-entry remains private.
8. Private reminders do not notify partner.
9. Shared scheduled check-ins still notify both users.
10. Mobile scheduled/open Tending uses the richer check-in UI.
11. Tending checks actual follow-through and underlying need resolution.
12. Failed follow-through can reopen strategy work around the still-open need.
13. Worked/resolved needs can fully close.
14. Unit tests pass for backend/shared/mobile affected areas.
15. Small E2E tests pass.
16. Final real-browser pass from a Stage 4 snapshot is completed and documented with artifacts.
17. `docs/product/stage-4-tending-build-progress.md` records all commands/results and the final status.
18. Changes are committed in coherent chunks.
