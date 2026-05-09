# Stage 03: Repair Plan

## Inputs

- `stages/02-triage/output/failure-routing.md`
- `GOVERNANCE.md`
- `FAILURE_TAXONOMY.md`
- `references/*-policy.md`
- `eval/gold-snapshot-registry.json`

## Process

Plan the highest-priority real blocker first. Keep product, prompt, and eval-machine fixes separate.

Name the exact files or modules likely to change, the evidence behind each change, and the tests or regression coverage required.

Choose the verification strategy before implementation. For later-stage failures, prefer an existing snapshot replay entry when it truthfully covers the state. If no snapshot entry exists but the failure would benefit from replay, plan either:

- add a `eval/gold-snapshot-registry.json` entry when a saved snapshot id/name/path is known; or
- use `--seed-target-stage` when a synthetic state is enough; or
- record a human-decision blocker asking for a snapshot to be created.

## Outputs

- `output/repair-plan.md`

## Audit

The plan must map every proposed change to a routed failure and evidence item. It must state whether any step requires human approval. The plan must name the rerun mode and explain why that mode is sufficient evidence for the targeted behavior.
