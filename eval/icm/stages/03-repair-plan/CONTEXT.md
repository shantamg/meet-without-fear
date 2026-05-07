# Stage 03: Repair Plan

## Inputs

- `stages/02-triage/output/failure-routing.md`
- `GOVERNANCE.md`
- `FAILURE_TAXONOMY.md`
- `references/*-policy.md`

## Process

Plan the highest-priority real blocker first. Keep product, prompt, and eval-machine fixes separate.

Name the exact files or modules likely to change, the evidence behind each change, and the tests or regression coverage required.

## Outputs

- `output/repair-plan.md`

## Audit

The plan must map every proposed change to a routed failure and evidence item. It must state whether any step requires human approval.
