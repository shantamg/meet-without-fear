# Stage 08: Report

## Inputs

- `stages/01-intake/output/latest-artifact-index.md`
- `stages/02-triage/output/failure-routing.md`
- `stages/03-repair-plan/output/repair-plan.md`
- `stages/04-implement/output/change-log.md`
- `stages/05-verify/output/test-results.md`
- `stages/06-rerun/output/run-results.md`
- `stages/07-judge/output/eval-decision.md`

## Process

Write a concise cycle report. Use `mwf-gold-session-reporter` for specialist synthesis when needed, while keeping this stage responsible for final ICM audit shape.

Copy the final report to `cycles/<cycle-id>/cycle-report.md`.

## Outputs

- `output/cycle-report.md`
- `cycles/<cycle-id>/cycle-report.md`

## Audit

The report must include run dirs, scores, invariant status, fixes, tests, reruns, cleanup status, remaining risks, and human decisions. It must separate product, prompt, eval-machine, snapshot-registry, and prompt-version changes.

For snapshot replay, include snapshot id/name/path, restored session id, target behavior, why replay was sufficient for the repair, and what still requires a fresh or full-flow gate.
