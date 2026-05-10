# Inner Thoughts Cycle Report

Cycle ID: `20260510-bootstrap-and-home-composer`
Date: 2026-05-10
Branch: `codex/inner-thoughts-self-improvement`

## Objective

Turn Inner Thoughts back on from the home composer, improve the partner-session CTA contract and context handoff, and create a durable self-improvement eval workspace with actor guidance and scenarios.

## Changes

- Added the full `eval/inner-thoughts/` workspace with completion criteria, governance, references, stage contracts, scenario definitions, and cycle report template.
- Added repo-backed actor skill `eval/skills/mwf-inner-thoughts-loop-actor/`.
- Added `scripts/install_mwf_eval_skills.sh` while preserving `scripts/install_mwf_gold_skills.sh`.
- Changed the home composer to route the typed message to a real Inner Thoughts session instead of `comingSoonMode`.
- Tightened `buildInnerWorkPrompt` so partner-session CTAs are earned, low-pressure, and not triggered merely by ambiguous person mentions.
- Preserved `innerThoughtsId` traceability when the new-session flow returns an existing active session.
- Fixed inner-thoughts memory-detection telemetry so real-LLM BrainActivity rows connect to `InnerWorkSession` instead of attempting to connect the inner-work id as a partner `Session`.
- Added progress and scratch evidence docs.

## Verification

- `python3 -m json.tool eval/inner-thoughts/scenarios.json >/dev/null`: passed.
- `bash -n scripts/install_mwf_eval_skills.sh && bash -n scripts/install_mwf_gold_skills.sh`: passed.
- `git diff --check`: passed.
- `npm test -- --runTestsByPath 'app/(auth)/(tabs)/__tests__/index.test.tsx' --runInBand` from `mobile/`: passed, 16 tests.
- `npm --workspace mobile run check`: passed.
- `npm --workspace backend test -- --runTestsByPath src/services/__tests__/stage-prompts.test.ts --runInBand`: passed, 105 tests.
- `npm --workspace backend test -- --runTestsByPath src/routes/__tests__/invitations.test.ts --runInBand`: passed, 14 tests.
- `npm --workspace backend run check`: passed after `npm --workspace backend run prisma:generate` in the fresh worktree.
- `npm --workspace backend test -- --runInBand backend/src/services/__tests__/memory-detector.test.ts`: passed, 25 tests.

## Live Run

Scenario: `journal-organize-ambition`

- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-journal-organize-ambition.md`
- Status: `pass`
- Backend: worktree backend with `MOCK_LLM=false` and real Bedrock credentials.
- Result: home composer creation passed; solo reflection stayed on topic; no partner-session CTA appeared; the AI organized the user's scattered ambition/work thoughts into useful non-checklist buckets.
- Additional finding: the real-LLM run exposed a BrainActivity relation bug in memory detection for inner thoughts. The bug was patched and verified with a subsequent real turn.

## Remaining Risks

- Real-LLM live pass exists only for `journal-organize-ambition`.
- No live evidence yet for the person-to-partner CTA, generated-context banner, or Stage 0 context use.
- No live evidence yet for ambiguous person mentions being held inside Inner Thoughts.
- The created-session route keeps the URL at `/inner-work/self-reflection/new?id=new` while holding the real session id in state. This avoids flicker but weakens URL-only actor evidence.

## Current State

The human cleared use of real model credentials. The environment blocker is removed for this worktree. Completion is still not claimable because the person-specific CTA and ambiguous-person scenarios have not been run to live evidence yet.

## Cleanup

- Cleanup will be performed when this active continuation stops.
