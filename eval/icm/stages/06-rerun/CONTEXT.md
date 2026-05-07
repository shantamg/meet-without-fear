# Stage 06: Rerun

## Inputs

- `references/gold-loop-commands.md`
- `references/real-llm-policy.md`
- `stages/05-verify/output/test-results.md`

## Process

Rerun both bounded gold loops with `MOCK_LLM=false`:

- Adam/Eve
- James/Catherine

If a rerun is skipped, record the explicit blocker and route it to `human_decision` or the appropriate failure owner.

## Outputs

- `output/run-results.md`

## Audit

Commands must use `MOCK_LLM=false`. Both bounded loops must be rerun or skipped only with explicit reason. Record run dirs, summary paths, `score.json`, `invariants.json`, transcript status, exit status, and cleanup status.
