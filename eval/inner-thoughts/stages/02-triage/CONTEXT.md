# Stage 02: Triage

## Inputs

- `../01-intake/output/latest-artifact-index.md`
- `FAILURE_TAXONOMY.md`
- Scenario scratch logs and run evidence

## Process

Classify each observed failure with one primary owner and a concrete evidence item. Separate product bugs from prompt-quality failures and eval-machine weaknesses.

## Outputs

- `output/triage.md`

## Audit

Every triaged failure must name scenario id, evidence, owner, severity, and next recommended action.
