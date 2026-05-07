# Stage 01: Intake

## Inputs

- `eval/gold-scenarios.json`.
- `eval/gold-snapshot-registry.json`.
- Latest `eval/runs/*-loop-summary.md`, if present.
- Latest run directories under `eval/runs/` for every live-enabled scenario, if present.
- `git status --short`.
- Prior `eval/icm/cycles/<cycle-id>/cycle-report.md`, if resuming.

## Process

Build an artifact index. Prefer paths and short descriptions over copied content.

Identify the required scenario set from `eval/gold-scenarios.json`. Include every scenario where `live_enabled` is `true` or omitted, exclude scenarios with `live_enabled: false`, and record gate settings when present.

Index every gate from each scenario. If a scenario has a `gates` array, record each gate id, mode, required status, score target, stage target, iteration cap, and any `snapshot_ref` or `seed_target_stage`. If it has only legacy `gate`, record it as `legacy-gate`.

Index `eval/gold-snapshot-registry.json` entries by id and scenario. Mark missing or empty registry entries explicitly; an empty registry is valid when no later-stage snapshot replay is currently required.

Check for expected run outputs: transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.

## Outputs

- `output/latest-artifact-index.md`

## Audit

Every referenced artifact path must exist or be explicitly marked missing. The index must identify whether the cycle is starting fresh, resuming, or blocked by missing artifacts. Snapshot replay entries must state whether their underlying snapshot id/name/path is expected to be local, dashboard-backed, or unresolved.
