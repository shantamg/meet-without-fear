---
title: Gold Loop ICM
sidebar_position: 4
description: Control plane for the MWF autonomous gold-loop self-improvement system.
created: 2026-05-07
updated: 2026-05-07
status: living
---
# Gold Loop ICM

The `eval/icm/` directory is the control plane for the MWF gold-loop self-improvement system. It owns durable routing, governance, completion criteria, failure taxonomy, stage contracts, regression records, and cycle reporting. The underlying scripts (`mwf_gold_loop.py`, `mwf_moment_eval.py`, etc.) and repo-backed specialist skills (`eval/skills/mwf-gold-*/`) remain the execution layer.

## What It Is

ICM (Iterative Calibration Machine) is an autonomous 9-stage pipeline that ingests a failing gold-loop result, triages the failure category, plans and implements a fix, verifies it, reruns the evaluation, judges the outcome, reports it, and optionally queues a self-improvement proposal.

## Stages

| Stage | Directory | Purpose |
|---|---|---|
| 01 Intake | `eval/icm/stages/01-intake/` | Receive a failing test result or regression report |
| 02 Triage | `eval/icm/stages/02-triage/` | Classify failure type (actor, eval-machine, product, prompt) |
| 03 Repair Plan | `eval/icm/stages/03-repair-plan/` | Select fix strategy |
| 04 Implement | `eval/icm/stages/04-implement/` | Apply the fix |
| 05 Verify | `eval/icm/stages/05-verify/` | Verify fix compiles / passes syntax checks |
| 06 Rerun | `eval/icm/stages/06-rerun/` | Re-run the gold-loop evaluation |
| 07 Judge | `eval/icm/stages/07-judge/` | Compare before/after scores |
| 08 Report | `eval/icm/stages/08-report/` | Write a cycle report to `eval/icm/cycles/` |
| 09 Self-Improve | `eval/icm/stages/09-self-improve/` | Queue a proposal to backlog if systemic issue found |

## Canonical Inputs

- `docs/product/source-material/golden-transcripts/` — Ground-truth session transcripts
- `eval/gold-profiles/` — Persona profiles (adam-eve, james-catherine) with per-stage moments
- `eval/gold-scenarios.json` — Scenario definitions driving gold-loop runs
- `eval/gold-snapshot-registry.json` — Registry of saved session snapshots for replay
- `eval/moments/` — Individual moment fixtures used in moment-level evaluation
- `eval/baselines/` — Baseline scores for regression detection
- `eval/scorer/` — Scoring rubrics and judge configurations
- `eval/skills/` — Repo-backed versions of MWF gold specialist skills
- `eval/prompt-versions/` — Versioned prompt artifacts for the gold loop

## Governance

Key policies live in `eval/icm/references/`:

| Policy | File |
|---|---|
| What counts as a regression | `regression-policy.md` |
| What changes are allowed per failure type | `product-change-policy.md`, `prompt-change-policy.md`, `eval-machine-change-policy.md` |
| How to version prompts | `prompt-versioning-policy.md` |
| Budget per cycle | `cycle-budget-policy.md` |
| When to use real LLM calls | `real-llm-policy.md` |
| Snapshot replay rules | `snapshot-replay-policy.md` |

## Running the Loop

- **Autonomous run**: Start with `eval/icm/RUN_SELF_IMPROVEMENT_LOOP.md`
- **Manual inspection / resume**: Start with `eval/icm/CONTEXT.md`
- **Skills install**: Run `scripts/install_mwf_gold_skills.sh` to install repo-backed skills for Codex

## CI Integration

The `python-eval` CI job in `.github/workflows/ci.yml` runs syntax checks and `scripts/test_mwf_moment_eval.py` whenever eval files change. See [CI Pipeline](../architecture/testing.md#ci-pipeline).

## Related

- [E2E Testing Architecture](./architecture.md)
- [Architecture: Testing](../architecture/testing.md)
