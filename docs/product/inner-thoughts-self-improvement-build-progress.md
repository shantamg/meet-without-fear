# Inner Thoughts Self-Improvement Build Progress

Date: 2026-05-10
Branch: `codex/inner-thoughts-self-improvement`
Worktree: `/private/tmp/mwf-inner-thoughts-self-improvement`

## Goal Checklist

- [x] Home page composer creates a real Inner Thoughts session from typed user input.
- [x] Solo Inner Thoughts reflection is high quality for journaling, ambition, and idea organization.
- [ ] Person-specific conversation earns a polished partner-session CTA.
- [ ] Ambiguous person mentions do not over-route to partner sessions.
- [x] CTA opens the existing new-session flow with `partnerName` and `innerThoughtsId`.
- [ ] Context generation runs through `POST /inner-thoughts/:id/generate-context`.
- [ ] Partner session starts in Stage 0 with Inner Thoughts context available.
- [x] Eval workspace exists under `eval/inner-thoughts/`.
- [x] Actor skill exists under `eval/skills/mwf-inner-thoughts-loop-actor/`.
- [x] Scenario definitions exist for the three required scenarios.
- [x] Installer supports the new actor skill without replacing gold skills.

## Files Changed

- `eval/inner-thoughts/**`
- `eval/skills/mwf-inner-thoughts-loop-actor/**`
- `scripts/install_mwf_eval_skills.sh`
- `eval/skills/README.md`
- `mobile/app/(auth)/(tabs)/index.tsx`
- `mobile/app/(auth)/(tabs)/__tests__/index.test.tsx`
- `backend/src/services/stage-prompts.ts`
- `backend/src/services/__tests__/stage-prompts.test.ts`
- `backend/src/controllers/invitations.ts`
- `backend/src/routes/__tests__/invitations.test.ts`
- `backend/src/services/memory-detector.ts`
- `backend/src/services/__tests__/memory-detector.test.ts`
- `docs/product/inner-thoughts-scratch/2026-05-10-local-journal-organize-ambition.md`
- `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`
- `eval/inner-thoughts/stages/01-intake/output/latest-artifact-index.md`
- `eval/inner-thoughts/stages/06-rerun/output/rerun-results.md`
- `eval/inner-thoughts/stages/07-judge/output/readiness-judgment.md`
- `eval/inner-thoughts/stages/08-report/output/cycle-report.md`
- `eval/inner-thoughts/cycles/20260510-bootstrap-and-home-composer/cycle-report.md`
- `docs/product/inner-thoughts-self-improvement-build-progress.md`

## Commands Run

- `git worktree add -b codex/inner-thoughts-self-improvement /private/tmp/mwf-inner-thoughts-self-improvement main`
- Read required starting files listed in `docs/product/inner-thoughts-self-improvement-goal.md`.
- `python3 -m json.tool eval/inner-thoughts/scenarios.json >/dev/null`
- `bash -n scripts/install_mwf_eval_skills.sh && bash -n scripts/install_mwf_gold_skills.sh`
- `git diff --check`
- `npm test -- --runTestsByPath 'app/(auth)/(tabs)/__tests__/index.test.tsx' --runInBand` from `mobile/` (passed: 16 tests)
- `npm --workspace mobile run check` (passed)
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand` (passed: 105 tests)
- `npm --workspace backend run check` initially failed in the fresh worktree because Prisma client generation was stale/missing; after `npm --workspace backend run prisma:generate`, rerun passed.
- `npm --workspace backend test -- --runTestsByPath src/routes/__tests__/invitations.test.ts --runInBand` (passed: 14 tests)
- `npm --workspace backend run check` (passed)
- `npm --workspace mobile run start:e2e` (started local web app on `localhost:8082`)
- `agent-browser --session mwf-inner-journal ...` drove `journal-organize-ambition` through the home composer and first follow-up turn.
- `agent-browser --session mwf-inner-journal close`
- Stopped the old main-checkout backend that was running with `MOCK_LLM=true`.
- Started the worktree backend with `MOCK_LLM=false` and real Bedrock credentials sourced from `/Users/shantam/Software/meet-without-fear/backend/.env`.
- `npm --workspace backend run migrate:deploy` applied the missing local database migration for `User.privacyPreferences`.
- `agent-browser --session mwf-inner-real-journal ...` drove `journal-organize-ambition` through a real-LLM browser run.
- `npm --workspace backend test -- --runInBand backend/src/services/__tests__/memory-detector.test.ts` (passed: 25 tests)

## Current Evidence

- The eval-machine skeleton and actor skill are implemented as durable repo artifacts.
- Product patch removes `comingSoon: '1'` from the home composer route and passes the typed message as `initialMessage`.
- `mobile/app/(auth)/inner-work/self-reflection/[id].tsx` already creates a real session when `id === 'new'` and `comingSoon` is absent.
- Prompt patch replaces over-eager partner-session CTA guidance with an earned, low-pressure, named-person rule and explicit ambiguous-person/workplace-boundary guardrails. This is prompt-contract progress only; live scenario evidence is still required before checking the CTA criteria complete.
- Handoff patch preserves `innerThoughtsId` traceability even when the new-session flow returns an existing active session instead of creating a new one.
- Local `journal-organize-ambition` browser run first exposed that the old backend was running with `MOCK_LLM=true`; after restart with real credentials, the scenario passed the solo reflection gate.
- The real-LLM run exposed a telemetry bug: inner-thoughts memory detection passed an inner-work session id as a partner `sessionId` to BrainActivity logging. `backend/src/services/memory-detector.ts` now logs `context === 'inner-thoughts'` calls with `innerWorkSessionId`.
- Live verification after backend restart showed BrainActivity inserts using `innerWorkSessionId` and memory detection completing without Prisma relation errors.

## Decisions

- First meaningful improvement is eval-machine scaffolding because the goal explicitly says to build the eval workspace first.
- The new installer is additive. The existing `scripts/install_mwf_gold_skills.sh` is left intact for gold-loop-only runtime setup.

## Unresolved Questions

- Live actor runs can use the existing `localhost:8082` E2E app with `E2E_AUTH_BYPASS=true`.
- Remaining live gates are `person-to-partner-session`, `ambiguous-person-boundary`, generated context handoff, and Stage 0 context verification.
