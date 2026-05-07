# Stage 01: Intake

## Inputs

- Latest `eval/runs/*-loop-summary.md`, if present.
- Latest Adam/Eve and James/Catherine run directories under `eval/runs/`, if present.
- `git status --short`.
- Prior `eval/icm/cycles/<cycle-id>/cycle-report.md`, if resuming.

## Process

Build an artifact index. Prefer paths and short descriptions over copied content.

Check for expected run outputs: transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.

## Outputs

- `output/latest-artifact-index.md`

## Audit

Every referenced artifact path must exist or be explicitly marked missing. The index must identify whether the cycle is starting fresh, resuming, or blocked by missing artifacts.
