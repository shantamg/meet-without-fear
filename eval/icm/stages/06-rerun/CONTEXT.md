# Stage 06: Rerun

## Inputs

- `eval/gold-scenarios.json`
- `eval/gold-snapshot-registry.json`
- `references/gold-loop-commands.md`
- `references/real-llm-policy.md`
- `references/stage-coverage-policy.md`
- `references/snapshot-replay-policy.md`
- `references/cycle-budget-policy.md`
- `stages/05-verify/output/test-results.md`

## Process

Rerun the gate mode required by the repair plan and completion criteria with `MOCK_LLM=false`.

For bounded clean-pass judgment, rerun every required gate for every live-enabled scenario from `eval/gold-scenarios.json`. If a scenario has a `gates` array, use every gate where `required_for_clean_pass` is `true` or omitted. If it has only legacy `gate`, treat that as a required `fresh_gold_loop` gate.

For all-stage readiness, also rerun every `full_flow_gate` for every live-enabled scenario, including optional gates where `required_for_clean_pass` is `false`.

For focused repair, select the minimum truthful rerun mode from `references/stage-coverage-policy.md`:

- `moment_eval` for direct prompt/invariant checks;
- `seed_target_stage` with `--seed-target-stage <target-stage>` for deterministic synthetic app state;
- `snapshot_replay` with `--from-snapshot <snapshot-id-or-name>` for saved real app state;
- `fresh_gold_loop` for bounded fresh integration;
- `full_flow_gate` for all-stage readiness.

Use each gate's configured `target_score`, `stop_after_stage`, and `max_iterations`. If a legacy scenario omits one of these settings, use mode `fresh_gold_loop`, target score `4.0`, stop after Stage `2`, and max iterations `1`.

Respect `references/cycle-budget-policy.md`. Stop for human decision rather than running unbounded real-LLM cycles.

If a rerun is skipped, record the explicit blocker and route it to `human_decision` or the appropriate failure owner.

## Outputs

- `output/run-results.md`

## Audit

Commands must use `MOCK_LLM=false`. Every required scenario gate must be rerun or skipped only with explicit reason. Record scenario id, gate id, mode, command, run dir, summary path, `score.json`, `invariants.json`, transcript status, exit status, and cleanup status.

For snapshot replay, also record snapshot registry id if present, snapshot id/name/path, restored session id, target behavior, why replay is valid evidence, and what it does not prove.
