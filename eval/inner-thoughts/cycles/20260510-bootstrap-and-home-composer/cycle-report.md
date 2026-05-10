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

## Live Run

Scenario: `journal-organize-ambition`

- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-local-journal-organize-ambition.md`
- Status: `error`
- Blocker: backend used for local browser run had `MOCK_LLM=true`.
- Evidence: `ps eww -p 84909` showed `E2E_AUTH_BYPASS=true` and `MOCK_LLM=true`.
- Result: home composer creation evidence passed; reflection quality could not be evaluated.

## Remaining Risks

- No real-LLM live pass exists for any of the three scenarios.
- No live evidence yet for the person-to-partner CTA, generated-context banner, or Stage 0 context use.
- The created-session route keeps the URL at `/inner-work/self-reflection/new?id=new` while holding the real session id in state. This avoids flicker but weakens URL-only actor evidence.

## Human Decision / Environment Blocker

The remaining completion criteria require `MOCK_LLM=false` live runs. This shell has no model credentials in the environment, and the only running backend was a main-checkout process with `MOCK_LLM=true`. A human needs to provide or start a real-LLM backend before the loop can honestly judge reflection quality and CTA timing.

## Cleanup

- Closed `agent-browser` session `mwf-inner-journal`.
- Stopped the mobile E2E web server started from this worktree.
