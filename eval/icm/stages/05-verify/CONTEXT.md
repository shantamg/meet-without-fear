# Stage 05: Verify

## Inputs

- `stages/04-implement/output/change-log.md`
- `stages/03-repair-plan/output/repair-plan.md`
- Relevant focused test commands.

## Process

Run focused tests that cover changed behavior before full bounded reruns. Include unit, integration, moment, invariant, or manual browser checks as appropriate.

Use `scripts/mwf_moment_eval.py` and `scripts/test_mwf_moment_eval.py` when the repair plan calls for moment-level or evaluator checks.

## Outputs

- `output/test-results.md`

## Audit

Test results must include commands, exit status, and why the tests cover the changed behavior. Passing unrelated tests is not enough.
