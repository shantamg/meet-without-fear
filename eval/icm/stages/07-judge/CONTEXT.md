# Stage 07: Judge

## Inputs

- `stages/06-rerun/output/run-results.md`
- Latest `score.json`
- Latest `invariants.json`
- `COMPLETION_CRITERIA.md`
- `references/scoring-policy.md`

## Process

Use `mwf-gold-session-scorer` as the specialist judging module. Compare actual artifacts to completion criteria.

Decide pass, fail, not evaluable, or human decision required.

## Outputs

- `output/eval-decision.md`

## Audit

The pass or fail decision must cite actual run artifacts, not summaries alone. A clean pass requires both real-LLM bounded loops and hard invariant success.
