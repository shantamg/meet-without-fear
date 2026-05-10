# Stage 04: Implement

## Inputs

- `stages/03-repair-plan/output/repair-plan.md`
- Relevant code, prompt, test, ICM, or skill files named by the plan.
- Evidence paths from triage.

## Process

Make the smallest justified change that addresses the planned blocker. Preserve existing harnesses and specialist skills unless the plan identifies an eval-machine issue.

Do not weaken rubrics, hard invariants, completion criteria, or actor difficulty without explicit human approval.

When changing prompt behavior, use `references/prompt-versioning-policy.md` to decide whether a versioned proposal should be added alongside production changes.

When adding or changing snapshot replay metadata, edit only `eval/gold-snapshot-registry.json` or ICM policy. Do not commit raw SQL snapshots unless explicitly promoted by a human.

## Outputs

- `output/change-log.md`

## Audit

Every changed file must map to a failure and evidence item. The change log must separate product, prompt, eval-machine, snapshot-registry, and prompt-version edits.
