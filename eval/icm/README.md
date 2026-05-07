# MWF Gold Loop ICM

This directory implements the control plane described in `eval/icm-build-plan.md`.

ICM owns durable routing, governance, completion criteria, failure taxonomy, stage contracts, regression records, self-improvement proposals, and cycle reporting conventions. Existing scripts and MWF gold-loop skills remain the mechanical and specialist execution layer.

Start with `CONTEXT.md` for a repair-test-rerun cycle.

## Canonical Inputs

- `docs/product/source-material/golden-transcripts/`
- `eval/gold-profiles/`
- `eval/gold-scenarios.json`
- `eval/moments/`
- `eval/baselines/`
- `eval/scorer/`

## Usually Local Only

- `eval/runs/`
- `docs/product/gold-session-scratch/`
- `backend/scripts/transcripts/`

Promote generated material only when it becomes a fixture, regression record, or gold reference.
