# Latest Artifact Index

Cycle: `20260507-self-improvement-01`
State: fresh cycle started from empty ICM stage outputs.

## Required Scenario Gates

Source: `eval/gold-scenarios.json`.

- `adam-eve`, live-enabled: true
  - `bounded-stage-2`: mode `fresh_gold_loop`, required, target score `4.0`, stop after Stage `2`, max iterations `1`.
  - `full-flow-stage-4`: mode `full_flow_gate`, optional for bounded clean pass, target score `4.0`, stop after Stage `4`, max iterations `1`.
- `james-catherine`, live-enabled: true
  - `bounded-stage-2`: mode `fresh_gold_loop`, required, target score `4.0`, stop after Stage `2`, max iterations `1`.
  - `full-flow-stage-4`: mode `full_flow_gate`, optional for bounded clean pass, target score `4.0`, stop after Stage `4`, max iterations `1`.

## Snapshot Registry

Source: `eval/gold-snapshot-registry.json`.

- Registry contains no entries: `{"snapshots": []}`.
- No snapshot replay was required or used in this cycle.

## Run Artifacts

- `eval/runs/20260507-020609-adam-eve-iter-01`
  - Scenario: `adam-eve`
  - Mode: fresh
  - Score: `4.0`, target reached
  - Transcript files: present under `transcripts/`
  - `score.json`: present
  - `invariants.json`: present, status `pass`
  - Scratch logs: present under `scratch/`
  - Loop summary: `eval/runs/20260507-020609-adam-eve-loop-summary.md`
- `eval/runs/20260507-022725-james-catherine-iter-01`
  - Scenario: `james-catherine`
  - Mode: fresh
  - Score: `3.0`, target not reached
  - Transcript files: present under `transcripts/`
  - `score.json`: present
  - `invariants.json`: present, status `pass`
  - Scratch logs: present under `scratch/`
  - Loop summary: `eval/runs/20260507-022725-james-catherine-loop-summary.md`
- `eval/runs/20260507-024645-james-catherine-iter-01`
  - Scenario: `james-catherine`
  - Mode: fresh, after actor-skill patch
  - Score: `3.8`, target not reached
  - Transcript files: present under `transcripts/`
  - `score.json`: present
  - `invariants.json`: present, status `pass`
  - Scratch logs: present under `scratch/`
  - Loop summary: `eval/runs/20260507-024645-james-catherine-loop-summary.md`
- `eval/runs/20260507-073948-james-catherine-iter-01`
  - Scenario: `james-catherine`
  - Mode: fresh, after Stage 0 prompt patch
  - Status: interrupted by operator after user-reported product UI issue
  - Score: none
  - Transcript files: incomplete/absent from run dir
  - `score.json`: absent
  - `invariants.json`: absent
  - Scratch logs: partial Catherine scratch log present
  - Loop summary: absent
  - Clean-pass evidence: invalid; do not count this partial run
- `eval/runs/20260507-075001-james-catherine-iter-01`
  - Scenario: `james-catherine`
  - Mode: fresh, after Stage 0 prompt patch
  - Score: `3.5`, target not reached
  - Transcript files: present under `transcripts/`
  - `score.json`: present
  - `invariants.json`: present, status `pass`
  - Scratch logs: present under `scratch/`
  - Loop summary: `eval/runs/20260507-075001-james-catherine-loop-summary.md`
  - Remaining failure: share suggestion/context-share state surfaced before James had completed his own empathy attempt.
- `eval/runs/20260507-080727-james-catherine-iter-01`
  - Scenario: `james-catherine`
  - Mode: fresh, after share-offer fetch gating patch
  - Score: `4.0`, target reached
  - Transcript files: present under `transcripts/`
  - `score.json`: present, verdict `eval_pass`
  - `invariants.json`: present, status `pass`
  - Scratch logs: present under `scratch/`
  - Loop summary: `eval/runs/20260507-080727-james-catherine-loop-summary.md`
  - Evidence: `transcripts/james-stage2.md` shows James's share suggestion after his empathy statement submission at `2026-05-07 15:21:49`.

## Service And Cleanup Artifacts

- `eval/runs/20260507-020604-adam-eve-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-022720-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-024640-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-073943-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-074956-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-080723-james-catherine-services/cleanup.json`: backend and web stopped.
- Process check after final run: no `mwf_gold_loop`, app dev server, Metro/Expo, codex actor, or `agent-browser` daemon remains.

## Git And Runtime State

- `git status --short` before the cycle was clean.
- Current repo change made by this cycle: `eval/skills/mwf-gold-loop-actor/SKILL.md`.
- Additional current repo changes made by this cycle: `backend/src/services/stage-prompts.ts`, `backend/src/services/__tests__/stage-prompts.test.ts`, `mobile/src/screens/UnifiedSessionScreen.tsx`, `mobile/src/hooks/useUnifiedSession.ts`, `mobile/src/hooks/useSharingStatus.ts`, `mobile/src/utils/shareOfferEligibility.ts`, `mobile/src/utils/__tests__/shareOfferEligibility.test.ts`, `eval/prompt-versions/mwf/stage-0/v01.md`.
- Runtime actor skill at `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md` was not a symlink to repo source at intake. The same actor guidance patch was mirrored there for the immediate rerun.
