# Stage 01: Intake

## Inputs

- `eval/gold-scenarios.json`.
- Latest `eval/runs/*-loop-summary.md`, if present.
- Latest run directories under `eval/runs/` for every live-enabled scenario, if present.
- `git status --short`.
- Prior `eval/icm/cycles/<cycle-id>/cycle-report.md`, if resuming.

## Process

Build an artifact index. Prefer paths and short descriptions over copied content.

Identify the required scenario set from `eval/gold-scenarios.json`. Include every scenario where `live_enabled` is `true` or omitted, exclude scenarios with `live_enabled: false`, and record gate settings when present.

Check for expected run outputs: transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.

## Outputs

- `output/latest-artifact-index.md`

## Audit

Every referenced artifact path must exist or be explicitly marked missing. The index must identify whether the cycle is starting fresh, resuming, or blocked by missing artifacts.
