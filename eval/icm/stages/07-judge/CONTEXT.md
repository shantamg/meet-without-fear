# Stage 07: Judge

## Inputs

- `stages/06-rerun/output/run-results.md`
- Latest `score.json`
- Latest `invariants.json`
- `COMPLETION_CRITERIA.md`
- `references/scoring-policy.md`
- `references/stage-coverage-policy.md`

## Process

Use `mwf-gold-session-scorer` as the specialist judging module. Compare actual artifacts to completion criteria.

Decide pass, fail, not evaluable, or human decision required.

Judge focused replay separately from clean pass:

- A passing `snapshot_replay` or `seed_target_stage` can close a targeted later-stage repair.
- It does not satisfy a fresh required gate unless the gate explicitly requires that mode.
- All-stage readiness requires required `full_flow_gate` results.

## Outputs

- `output/eval-decision.md`

## Audit

The pass or fail decision must cite actual run artifacts, not summaries alone. A clean pass requires all required real-LLM gates and hard invariant success. The decision must state whether it is bounded readiness, focused replay success, or all-stage readiness.
