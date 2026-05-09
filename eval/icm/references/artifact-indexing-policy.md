# Artifact Indexing Policy

ICM indexes canonical artifacts. It does not duplicate raw run data.

## Canonical Evidence

- `docs/product/source-material/golden-transcripts/`
- `eval/gold-profiles/`
- `eval/gold-scenarios.json`
- `eval/gold-snapshot-registry.json`
- `eval/moments/`
- `eval/baselines/`
- `eval/scorer/`
- `eval/prompt-versions/`

## Working Memory

- `eval/runs/`
- `docs/product/gold-session-scratch/`
- `backend/scripts/transcripts/`
- local SQL snapshots under `backend/snapshots/`

Cycle reports may link to working-memory artifacts. Do not commit raw generated folders unless a specific file is promoted into a fixture, regression record, or gold reference.
