# Stages 3/4 Rework Progress

## Current State

- Branch: `codex/stages-3-4-rework`
- Started from `main` with pre-existing untracked goal docs and a modified `mobile/app.json`.
- PR #635 source docs fetched into `origin/pr/635` and read without switching branches.

## Commands Run

- `git status --short --branch`
- `git switch -c codex/stages-3-4-rework`
- `git fetch origin pull/635/head:refs/remotes/origin/pr/635`
- `git show origin/pr/635:docs/product/stages/stages-3-4-rework-spec.md`
- `git show origin/pr/635:docs/product/stages/stages-3-4-rework-impl-spec.md`
- `rg`/`sed` inspections of Stage 3/4 controllers, services, shared DTOs, mobile drawers, hooks, and tests.

## Decisions / Findings

- Stage 3 has confirm/share primitives and correction support, but no First Circle-style interpret/preview/apply API.
- Stage 3 has no delete endpoint and no code-level strategy/blame-shaped need warning.
- Stage 4 already has a redesigned state service, proposal selections, coverage, closure, tending preview, and mobile panel, but not the requested persisted one-need-at-a-time walkthrough contract.
- First implementation slice: Stage 3 backend edit-plan/delete/validator support, then tests and commit.

## Work In Progress

- Stage 3 backend checkpoint completed:
  - Added shared DTOs for First Circle-style need edit plans and preview/apply responses.
  - Added universal/strategy-shaped need validator warnings to Stage 3 needs service responses.
  - Added backend `POST /sessions/:id/needs/interpret-edit-request`.
  - Added backend `POST /sessions/:id/needs/apply-edits`.
  - Added backend `DELETE /sessions/:id/needs/:needId`.
  - Edit/delete paths enforce current-user ownership through the user's vessel and refuse mutation after `needsShared`.
  - Interpreter previews mutate nothing; apply validates again inside the apply path.

- Stage 3 mobile checkpoint completed:
  - Added drawer-level Add need, Edit, Ask AI to reword, and Remove actions.
  - Add/edit requests are instruction text sent to the interpret endpoint; accepted previews call the apply endpoint.
  - Preview modal shows before/after word-level highlighting and warning copy when returned by the backend.
  - Remove uses a confirmation alert and the new delete endpoint.
  - Unified session screen wires the drawer to `useInterpretNeedEdit`, `useApplyNeedEdits`, and `useRemoveNeed`.
  - Apply/remove hooks update the Stage 3 needs cache with `queryClient.setQueryData`.

## Files Changed In Stage 3 Backend Checkpoint

- `shared/src/dto/need-edits.ts`
- `shared/src/dto/needs.ts`
- `shared/src/index.ts`
- `backend/src/services/needs.ts`
- `backend/src/services/needs-edit-interpreter.service.ts`
- `backend/src/services/needs-edit-applier.service.ts`
- `backend/src/controllers/stage3.ts`
- `backend/src/routes/stage3.ts`
- `backend/src/services/__tests__/needs-edit.service.test.ts`

## Files Changed In Stage 3 Mobile Checkpoint

- `mobile/src/components/NeedsDrawer.tsx`
- `mobile/src/components/NeedCard.tsx`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

## Test Status

- `npm --workspace backend run check` — passed.
- `npm --workspace backend run test -- needs-edit.service.test.ts` — passed.
- `npm --workspace backend run test -- stage3.test.ts` — passed.
- `npm --workspace mobile run check` — passed.
- `npm --workspace mobile run test -- NeedsDrawer.test.tsx useStages.test.ts` — blocked before executing tests: Jest could not resolve `react-test-renderer` from `@testing-library/react-native/build/act.js`.
- `npm --workspace mobile ls react-test-renderer` — dependency is present under `jest-expo@54.0.17`; the Jest resolver still failed.
- Watchman emitted recrawl warnings during Jest runs; tests still passed.

## Next Steps

1. Commit the Stage 3 mobile checkpoint.
2. Add or repair mobile tests once the `react-test-renderer` resolver issue is fixed.
3. Continue into Stage 4 persisted walkthrough state and focused mobile flow.
