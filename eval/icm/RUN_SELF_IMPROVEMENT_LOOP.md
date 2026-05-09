# Run MWF Gold-Loop Self-Improvement

This is the canonical entrypoint for the autonomous Meet Without Fear gold-loop self-improvement cycle.

## How To Start

Use Codex slash goal from the repository root:

```text
/goal Follow eval/icm/RUN_SELF_IMPROVEMENT_LOOP.md exactly.
```

## Mission

Run the MWF gold-loop self-improvement cycle until `eval/icm/COMPLETION_CRITERIA.md` passes or a human decision is required.

The loop may improve either MWF itself or the eval machine, depending on artifact evidence.

## Required Loop

1. Read `eval/icm/CONTEXT.md`.
2. Run Stage 01 intake.
3. Run Stage 02 triage.
4. Run Stage 03 repair plan.
5. Implement the highest-priority artifact-backed fix.
6. Run focused verification.
7. Rerun the appropriate gate mode with `MOCK_LLM=false`: fresh required gates for clean pass, snapshot replay or seeded-stage checks for focused later-stage verification, and full-flow gates when claiming all-stage readiness.
8. Judge against `eval/icm/COMPLETION_CRITERIA.md`.
9. Write report outputs.
10. Improve the eval machine if the cycle exposed routing, scoring, actor, reporter, harness, or ICM weaknesses.
11. Repeat until completion criteria pass or a human decision is required.

## Allowed Changes

The loop may modify these areas when artifact evidence justifies the change:

- MWF product code
- MWF prompts
- product and prompt tests
- gold-loop harness code
- scorer and reporter instructions
- actor guidance
- ICM routing, policy, stage contracts, and regression records
- snapshot replay registry entries and prompt-version proposals

## Required Evidence

Every change must cite evidence from at least one of:

- run directory
- transcript
- `score.json`
- `invariants.json`
- loop summary
- scratch log
- screenshot
- backend/browser log
- failing test
- code location
- snapshot registry entry

## Forbidden Changes

Do not weaken these without explicit human approval:

- completion criteria
- hard invariants
- scoring rubrics
- actor difficulty
- persona difficulty
- real-LLM requirements

Do not replace `scripts/mwf_gold_loop.py`.
Do not replace the existing `mwf-gold-*` skills.
Do not duplicate raw run artifacts into `eval/icm/`.
Do not create a second snapshot/checkpoint mechanism; use `scripts/ec2-bot/scripts/save-snapshot.sh`, `scripts/ec2-bot/scripts/restore-snapshot.sh`, and `scripts/mwf_gold_loop.py --from-snapshot`.

## Required Outputs

Each cycle must keep stage outputs current under `eval/icm/stages/*/output/`.

Each completed cycle must write:

- `eval/icm/stages/08-report/output/cycle-report.md`
- `eval/icm/cycles/<cycle-id>/cycle-report.md`

Confirmed bugs must get regression coverage or a tracked exception under `eval/icm/regressions/`.

Snapshot replay decisions must cite `eval/icm/references/snapshot-replay-policy.md` and record why replay is valid evidence for the targeted failure.

## Stop Only When

Stop only when one of these is true:

- `eval/icm/COMPLETION_CRITERIA.md` passes.
- A human decision is required by `eval/icm/GOVERNANCE.md`.
- A blocker prevents execution after reasonable local diagnosis, and the cycle report names the blocker, evidence, attempted fixes, and next human action.
- Cycle budget limits in `eval/icm/references/cycle-budget-policy.md` are reached and more real-LLM runs require human approval.

Before stopping, clean up local test services, browser sessions, and gold-loop child processes started by the cycle.
