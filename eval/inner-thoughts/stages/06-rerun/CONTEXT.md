# Stage 06: Rerun

## Inputs

- `../05-verify/output/verification.md`
- `scenarios.json`
- Actor skill and browser policy

## Process

Rerun the affected live-enabled scenarios. Use real product behavior and real LLM behavior unless a human-approved exception is recorded.

## Outputs

- `output/rerun-results.md`

## Audit

Each rerun must cite run id, scenario id, scratch log, final status JSON, and pass/fail/blocker summary.
