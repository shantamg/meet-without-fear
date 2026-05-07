# Stage 04: Implement

## Inputs

- `stages/03-repair-plan/output/repair-plan.md`
- Relevant code, prompt, test, ICM, or skill files named by the plan.
- Evidence paths from triage.

## Process

Make the smallest justified change that addresses the planned blocker. Preserve existing harnesses and specialist skills unless the plan identifies an eval-machine issue.

Do not weaken rubrics, hard invariants, completion criteria, or actor difficulty without explicit human approval.

## Outputs

- `output/change-log.md`

## Audit

Every changed file must map to a failure and evidence item. The change log must separate product, prompt, and eval-machine edits.
