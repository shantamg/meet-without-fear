# Stage 03: Repair Plan

## Inputs

- `../02-triage/output/triage.md`
- Product and eval-machine source paths named by triage
- `GOVERNANCE.md`

## Process

Choose the highest-priority blocker. Plan the smallest fix that can be verified by focused tests or browser evidence, then rerun the affected scenario.

## Outputs

- `output/repair-plan.md`

## Audit

The plan must name files to change, evidence justifying the change, expected verification, rollback notes, and any human decision required.
