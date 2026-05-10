# Inner Thoughts Self-Improvement Build Progress

Date: 2026-05-10
Branch: `codex/inner-thoughts-self-improvement`
Worktree: `/private/tmp/mwf-inner-thoughts-self-improvement`

## Goal Checklist

- [ ] Home page composer creates a real Inner Thoughts session from typed user input.
- [ ] Solo Inner Thoughts reflection is high quality for journaling, ambition, and idea organization.
- [ ] Person-specific conversation earns a polished partner-session CTA.
- [ ] Ambiguous person mentions do not over-route to partner sessions.
- [ ] CTA opens the existing new-session flow with `partnerName` and `innerThoughtsId`.
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
- `docs/product/inner-thoughts-self-improvement-build-progress.md`

## Commands Run

- `git worktree add -b codex/inner-thoughts-self-improvement /private/tmp/mwf-inner-thoughts-self-improvement main`
- Read required starting files listed in `docs/product/inner-thoughts-self-improvement-goal.md`.

## Current Evidence

- The eval-machine skeleton and actor skill are implemented as durable repo artifacts.
- Product code inspection shows home composer still routes with `comingSoon: '1'` in `mobile/app/(auth)/(tabs)/index.tsx`, so the product criteria are not complete yet.

## Decisions

- First meaningful improvement is eval-machine scaffolding because the goal explicitly says to build the eval workspace first.
- The new installer is additive. The existing `scripts/install_mwf_gold_skills.sh` is left intact for gold-loop-only runtime setup.

## Unresolved Questions

- Whether live actor runs should use the existing `localhost:8082` E2E app as-is or need a dedicated Inner Thoughts no-Clerk fixture.
- Whether `innerThoughtsId` traceability is already persisted during session creation or needs a schema/controller patch.
