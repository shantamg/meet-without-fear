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

## Service And Cleanup Artifacts

- `eval/runs/20260507-020604-adam-eve-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-022720-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-024640-james-catherine-services/cleanup.json`: backend and web stopped.
- `python3 scripts/mwf_gold_loop.py cleanup-browsers`: closed `0` sessions; no stale `mwf-gold` sessions reported.

## Git And Runtime State

- `git status --short` before the cycle was clean.
- Current repo change made by this cycle: `eval/skills/mwf-gold-loop-actor/SKILL.md`.
- Runtime actor skill at `/Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md` was not a symlink to repo source at intake. The same actor guidance patch was mirrored there for the immediate rerun.
