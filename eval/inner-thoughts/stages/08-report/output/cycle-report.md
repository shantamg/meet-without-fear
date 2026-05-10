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

Scenario: `person-to-partner-session`

- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-person-to-partner-session.md`
- Status: `pass`
- Result: CTA did not appear just because Maya was named. It appeared after the user said they might need to talk with Maya and wanted to understand what to say.
- Handoff: `/session/new?partnerName=Maya&innerThoughtsId=cmozer39v000apx253x4y5efe` showed `From Inner Thoughts`, rendered generated context, and prefilled `Maya`.
- Partner session: created `/session/cmozeud490014px25t5xy0h50`, linked from the originating Inner Thoughts session with `linkedTrigger = suggestion_start`, and opened Stage 0.

Scenario: `ambiguous-person-boundary`

- Scratch log: `docs/product/inner-thoughts-scratch/2026-05-10-real-ambiguous-person-boundary.md`
- Status: `pass`
- Result: Jordan was named, but the user explicitly wanted private reflection. No partner-session CTA appeared, and the AI stayed with workplace boundaries and internal reassurance.

## Remaining Risks

- Real-LLM live passes exist for all three required scenarios.
- The Stage 0 opening prompt referenced Maya while keeping the private generated context out of the partner-session chat, which is expected for privacy.
- The created-session route keeps the URL at `/inner-work/self-reflection/new?id=new` while holding the real session id in state. This avoids flicker but weakens URL-only actor evidence.

## Current State

The human cleared use of real model credentials. The environment blocker is removed for this worktree, and the scoped completion criteria now have real-LLM evidence.

## Cleanup

- Cleanup will be performed when this active continuation stops.
