# Stage 3 Drift Cleanup Plan

Status: ready
Date: 2026-05-05
Related: #247, #253, #254, #345
Source: `docs/product/stage-3-golden-alignment-plan.md`, `docs/product/stage-3-golden-alignment-audit.md`

## Summary

A code-and-docs audit of `main` against the Stage 3 redesign spec (#247) found **significant drift, not fresh work**. The backend redesign is in: endpoints, gates, events, and prompts have all migrated, which is why the latest gold runs reach Stage 3 cleanly through `needsCaptured / needsConfirmed / needsShared / needsValidated`.

The mobile shell and most of the Stage 3 docs have not caught up. Wave 4 (#253) is roughly **20% done with 80% drift to clean**. Wave 5 (#254) is roughly **10% done**. The remaining work is mostly removing or renaming, not building from scratch.

This plan turns that audit into a concrete, surgical to-do list so that when hold issue #345 is closed, an agent (or a human) can execute it without re-implementing things already done.

## Drift Items — Mobile (#253)

### 1. Add the Reveal phase to NeedMappingScreen

- File: `mobile/src/screens/NeedMappingScreen.tsx`
- Current: `type NeedMappingPhase = 'exploration' | 'review' | 'waiting' | 'complete'`
- Target: `type NeedMappingPhase = 'exploration' | 'review' | 'reveal' | 'waiting' | 'complete'`
- Update `determinePhase()` to enter `'reveal'` after both partners have consented and the side-by-side data is available
- Render side-by-side cards plus the "What do you notice?" prompt in the new phase

### 2. Add the missing capture hook

- `useValidateNeeds()` already exists at `mobile/src/hooks/useStages.ts:1538`
- `useCaptureNeeds()` is missing. Add it — call `POST /sessions/:id/needs/capture`
- Wire it into the conversation flow that confirms a user's final needs list

### 3. Remove dead extraction polling

- File: `mobile/src/hooks/useStages.ts` around line 1407
- The hook still polls every 3s while `data.extracting === true`
- The backend no longer returns `extracting`, so this is dead code at best, masking errors at worst
- Delete the polling branch and the `extracting` flag handling
- Verify no callers depend on `extracting` in the response shape

### 4. Rename NeedsDrawer mode `comparison` → `reveal`

- File: `mobile/src/components/NeedsDrawer.tsx`
- Current: `export type NeedsDrawerMode = 'needs' | 'comparison'`
- Target: `export type NeedsDrawerMode = 'needs' | 'reveal'`
- Update `renderComparisonMode`, `renderComparisonButtons`, the header text branch, and all call sites
- Update tests under `mobile/src/components/__tests__/NeedsDrawer.test.tsx`

### 5. Update realtime event handlers

- File: `mobile/src/screens/UnifiedSessionScreen.tsx` around line 832
- Current: bridges `partner.common_ground_confirmed` and `partner.needs_validated` with an OR
- Target: drop `partner.common_ground_confirmed`; only handle the new event names
- Add a handler for `session.needs_revealed` to trigger the side-by-side display

### 6. Remove stale CG-era copy and comments

- `NeedMappingScreen.tsx:142` still says "After confirming, consent to share for common ground discovery"
- Audit the file for any remaining strings or comments referring to common ground, extraction, or pre-extracted needs and rewrite to match the redesign

### 7. Verification

- `npm run check` passes in `mobile/`
- `npm run test` passes in `mobile/`
- A manual gold-flow walk-through (Adam/Eve scenario) reaches Stage 4 with the new Reveal phase visible and no warnings about unknown events

## Drift Items — Docs (#254)

| Doc | Drift | Action |
|---|---|---|
| `docs/product/stages/stage-3-what-matters.md` | 1 CG mention, 0 new endpoint mentions, 5d untouched | Rewrite the flow section to describe: user-driven needs identification → confirm → consent → mutual reveal → "What do you notice?" → emotional processing → validity gate. Remove all common-ground language. |
| `docs/backend/api/stage-3.md` | 3 CG mentions, 3 new endpoint mentions (partial migration) | Finish the migration: remove the residual `/common-ground` endpoint references, ensure `POST /needs/capture` and `POST /needs/validate` are documented with request/response shapes, update `GET /needs` to reflect that it no longer triggers auto-extraction. |
| `docs/backend/state-machine/index.md` | 2 CG mentions, 0 needsValidated mentions | Replace `commonGroundConfirmed` gate with `needsValidated` everywhere it appears. |
| `docs/backend/state-machine/retrieval-contracts.md` | **14 CG mentions**, 0 new mentions | Remove `commonGround` from the context bundle description. This is the heaviest drift in the doc set. |
| `docs/backend/prompts/stage-3-needs.md` | **13 CG mentions**, 0 new mentions | Update prompt guidance: introduce CONFIRMING mode, document post-reveal phases, refresh the FORBIDDEN list to drop CG-specific bans and add new ones (no pre-extraction, no AI-authored common ground). |

## Risks To Flag While Iterating

The dead extraction polling in `useNeeds` (item 3 above) is the highest-leverage cleanup. It runs every 3s waiting for a flag the backend never sets, which:

- wastes requests under sustained Stage 3 sessions
- is exactly the class of cache/realtime drift that has been generating Stage 4 bugs
- silently keeps the loading UI in a state that may mask real failures

Recommend tackling this item first, even if the rest of #253 stays paused, because it removes a confounder from ongoing gold-session debugging.

## Sequencing

1. Item 3 (dead polling removal) — small, safe, immediate value, can land independently of #345.
2. Items 1, 2, 5 together — Reveal phase, capture hook, realtime events. These are the spec's substantive remaining work.
3. Items 4, 6 — renaming and copy cleanup. Easy follow-up once 1/2/5 are stable.
4. Doc migrations (#254 list) — best done after the mobile changes land so the docs reflect what the code actually does.

## Out Of Scope

- Stage 4 / Tending redesign (`docs/product/stage-4-tending-technical-spec.md`, #212)
- Eval harness (#244)
- Anything in Stage 0/1/2

## Resume Procedure

When ready to release Wave 4/5 to bot work:

1. Land Item 3 manually (or hand-off to an agent with this plan as the brief).
2. Close #345.
3. Pipeline-monitor will re-promote #253 and #254 to `bot:pr` on its next tick.
4. Re-add `bot:milestone-builder` to #247 if you want the orchestrator to coordinate further waves.
