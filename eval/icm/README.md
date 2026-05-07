# MWF Gold Loop ICM

This directory implements the control plane described in `eval/icm-build-plan.md`.

ICM owns durable routing, governance, completion criteria, failure taxonomy, stage contracts, regression records, self-improvement proposals, and cycle reporting conventions. Existing scripts and MWF gold-loop skills remain the mechanical and specialist execution layer.

To run the autonomous self-improvement loop, start with `RUN_SELF_IMPROVEMENT_LOOP.md`.

Start with `CONTEXT.md` when manually inspecting or resuming a repair-test-rerun cycle.

MWF gold skills are repo-backed under `eval/skills/`. To make Codex use those versions at runtime, run `scripts/install_mwf_gold_skills.sh`. See `references/skills-index.md`.

## Canonical Inputs

- `docs/product/source-material/golden-transcripts/`
- `eval/gold-profiles/`
- `eval/gold-scenarios.json`
- `eval/gold-snapshot-registry.json`
- `eval/moments/`
- `eval/baselines/`
- `eval/scorer/`
- `eval/skills/`
- `eval/prompt-versions/`

## Usually Local Only

- `eval/runs/`
- `docs/product/gold-session-scratch/`
- `backend/scripts/transcripts/`

Promote generated material only when it becomes a fixture, regression record, or gold reference.
