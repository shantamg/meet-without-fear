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

- Stage 4 walkthrough checkpoint completed:
  - Extended `GET /sessions/:id/stage4` with a `walkthrough` object.
  - Walkthrough state uses `StageProgress.gatesSatisfied.stage4Walkthrough` for persisted per-user phase/current need/covered/skipped IDs.
  - Added explicit proposal source labels: current user, partner, AI, or unknown.
  - Added own-needs-first current step, then partner-needs current step, then quality review.
  - Added proposal groups for current own needs (`you_suggested`, `partner_suggested`, `ai_suggested`) and partner needs (`partner_may_do`, `shared_options`, `your_prior_suggestions`).
  - Added `POST /sessions/:id/stage4/walkthrough/needs/:needId` with `covered` / `skip` actions.
  - Reshaped `Stage4RedesignPanel` into focused one-need-at-a-time walkthrough with compact “View all” review.
  - Quality review shows candidate willing agreements, warnings for vague/uncheckable items, and a 10-day default check-in date.
  - Unified session screen wires covered/skipped CTAs to the persisted walkthrough endpoint.

- Stage 4 AI suggestions checkpoint completed:
  - Replaced the stubbed Stage 4 suggestion controller with need-scoped generation using the confirmed need and curated global library items only.
  - Added fallback micro-experiment drafts for mock/no-AWS environments so the flow remains usable in tests and local seeded runs.
  - Suggestions persist as `StrategyProposal` rows with `source: AI_SUGGESTED`, `kind: SHARED_PROPOSAL`, and `StrategyProposalNeed` links when a target need is supplied.
  - Added `POST /sessions/:id/stage4/proposals/suggest` while keeping the existing strategy suggestion handler available.
  - Wired mobile “Suggest options” / “Try one more option” CTAs to the persisted suggestion endpoint and invalidated redesigned Stage 4 state.

- Living docs checkpoint completed:
  - Updated Stage 3 product/API/prompt docs for AI-owned need editing, diff preview/apply, remove-before-share, and reframing warnings.
  - Updated Stage 4 product/API/prompt docs for focused own-needs-first walkthrough, source labels, persisted walkthrough state, AI suggestions, quality review, and 10-day check-in.
  - Updated Stage 4 retrieval contract wording so AI suggestions use confirmed needs plus curated global library context, not user memory.

- Verification fixes checkpoint completed:
  - `POST /sessions/:id/stage4/close` now defaults omitted `checkInDate` to 10 days server-side.
  - Restored the `needs-review-button` e2e test surface on the Stage 3 needs review card.
  - Updated Stage 3 e2e helpers for the current needs reveal drawer labels and validation button.
  - Updated Stage 4 redesign e2e expectations for individual-commitment tending entries.

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

## Files Changed In Stage 4 Walkthrough Checkpoint

- `shared/src/dto/strategy.ts`
- `backend/src/services/stage4-state.ts`
- `backend/src/controllers/stage4.ts`
- `backend/src/routes/stage4.ts`
- `backend/src/routes/__tests__/stage4.test.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/components/Stage4RedesignPanel.tsx`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

## Files Changed In Stage 4 AI Suggestions Checkpoint

- `backend/src/controllers/stage4.ts`
- `backend/src/routes/stage4.ts`
- `backend/src/routes/__tests__/stage4.test.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/components/Stage4RedesignPanel.tsx`
- `mobile/src/screens/UnifiedSessionScreen.tsx`

## Files Changed In Docs Checkpoint

- `docs/product/stages/stage-3-what-matters.md`
- `docs/product/stages/stage-4-strategic-repair.md`
- `docs/backend/api/stage-3.md`
- `docs/backend/api/stage-4.md`
- `docs/backend/prompts/stage-3-needs.md`
- `docs/backend/prompts/stage-4-repair.md`
- `docs/backend/state-machine/retrieval-contracts.md`

## Files Changed In Verification Fixes Checkpoint

- `backend/src/controllers/stage4.ts`
- `backend/src/routes/__tests__/stage4.test.ts`
- `docs/backend/api/stage-4.md`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `e2e/helpers/test-utils.ts`
- `e2e/tests/two-browser-stage-3.spec.ts`
- `e2e/tests/two-browser-stage-4-redesign.spec.ts`

## Test Status

- `npm --workspace backend run check` — passed.
- `npm --workspace backend run test -- needs-edit.service.test.ts` — passed.
- `npm --workspace backend run test -- stage3.test.ts` — passed.
- `npm --workspace mobile run check` — passed.
- `npm --workspace mobile run test -- NeedsDrawer.test.tsx useStages.test.ts` — blocked before executing tests: Jest could not resolve `react-test-renderer` from `@testing-library/react-native/build/act.js`.
- `npm --workspace mobile ls react-test-renderer` — dependency is present under `jest-expo@54.0.17`; the Jest resolver still failed.
- `npm --workspace backend run test -- stage4.test.ts` — passed after Stage 4 walkthrough changes.
- `npm --workspace backend run check` — passed after Stage 4 walkthrough changes.
- `npm --workspace mobile run check` — passed after Stage 4 walkthrough changes.
- `npm --workspace backend run check` — passed after Stage 4 AI suggestion changes.
- `npm --workspace mobile run check` — passed after Stage 4 AI suggestion changes.
- `npm --workspace backend run test -- stage4.test.ts` — passed after Stage 4 AI suggestion changes.
- `npm --workspace backend run test -- needs-edit.service.test.ts stage3.test.ts` — passed after Stage 4 AI suggestion changes.
- `npm run check` — passed across workspaces after docs checkpoint.
- `npm run test` — mobile workspace failed before executing React Native tests because Jest could not resolve top-level `react-test-renderer`; backend passed 74 suites / 1374 tests, shared passed 12 suites / 216 tests.
- `npm --workspace backend run check` — passed after verification fixes.
- `npm --workspace mobile run check` — passed after verification fixes.
- `npm --workspace e2e run check` — passed after e2e helper/spec updates.
- `npm --workspace backend run test -- stage4.test.ts` — passed after default `checkInDate` update.
- `npm --workspace e2e run e2e -- two-browser-stage-3.spec.ts two-browser-stage-4-redesign.spec.ts` — passed 5/5 after e2e updates.
- `npm run check` — passed across workspaces after all verification fixes.
- Local browser smoke:
  - Seeded Stage 4 redesigned inventory via `/api/e2e/seed-session` and opened `localhost:8082`.
  - Verified focused “Working toward agreements” one-need view, source groups, willingness controls, and 10-day/check-in-capable flow entry.
  - Seeded Stage 3 needs review via `/api/e2e/seed-session` plus `/needs/capture` and opened `localhost:8082`.
  - Verified `What Matters` review card and `Your Needs` drawer with Confirm/Add/Edit/Remove controls.
- Watchman emitted recrawl warnings during Jest runs; tests still passed.

## Next Steps

1. Commit the verification fixes checkpoint.
2. Add or repair mobile tests once the `react-test-renderer` resolver issue is fixed.
3. Review final diff and mark the goal complete.
