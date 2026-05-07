# Stage 06: Rerun

## Inputs

- `eval/gold-scenarios.json`
- `references/gold-loop-commands.md`
- `references/real-llm-policy.md`
- `stages/05-verify/output/test-results.md`

## Process

Rerun every live-enabled scenario from `eval/gold-scenarios.json` with `MOCK_LLM=false`.

Use each scenario's configured `gate` values for `target_score`, `stop_after_stage`, and `max_iterations`. If a legacy scenario omits one of these settings, use target score `4.0`, stop after Stage `2`, and max iterations `1`.

If a rerun is skipped, record the explicit blocker and route it to `human_decision` or the appropriate failure owner.

## Outputs

- `output/run-results.md`

## Audit

Commands must use `MOCK_LLM=false`. Every required scenario must be rerun or skipped only with explicit reason. Record scenario id, command, run dir, summary path, `score.json`, `invariants.json`, transcript status, exit status, and cleanup status.
