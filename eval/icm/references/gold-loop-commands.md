# Gold Loop Commands

Use `scripts/mwf_gold_loop.py` as the canonical bounded loop runner. Do not replace it with ICM logic.

## Required Reruns

Read required scenarios from `eval/gold-scenarios.json`. Rerun every scenario where `live_enabled` is `true` or omitted with real LLM mode. Exclude only scenarios with `live_enabled: false`.

Use each required gate from the scenario's `gates` array when present. If `gates` is absent, use the legacy/default `gate` object.

Use the gate's values when present:

- `target_score`
- `stop_after_stage`
- `max_iterations`
- `mode`
- `snapshot_ref`
- `seed_target_stage`

Use bounded defaults for legacy entries that omit gate settings: mode `fresh_gold_loop`, target score `4.0`, stop after Stage `2`, and max iterations `1`.

Fresh command template:

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario <scenario-id> --max-iterations <max-iterations> --stop-after-stage <stop-after-stage> --target-score <target-score> --start-services --no-improve-on-final-fail
```

Snapshot replay command template:

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario <scenario-id> --from-snapshot <snapshot-id-or-name> --snapshot-session-id <session-id-if-needed> --max-iterations <max-iterations> --stop-after-stage <stop-after-stage> --target-score <target-score> --start-services --no-improve-on-final-fail
```

Seeded-stage command template:

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario <scenario-id> --seed-target-stage <target-stage> --max-iterations <max-iterations> --stop-after-stage <stop-after-stage> --target-score <target-score> --start-services --no-improve-on-final-fail
```

Current registry expansion (run this to see actual commands — do not treat the output as static):

```sh
python3 - <<'PY'
import json
from pathlib import Path

payload = json.loads(Path("eval/gold-scenarios.json").read_text())
for item in payload.get("scenarios", []):
    if not item.get("live_enabled", True):
        continue
    gates = item.get("gates") or [{"id": "legacy-gate", **item.get("gate", {})}]
    for gate in gates:
        if gate.get("required_for_clean_pass", True) is False:
            continue
        mode = gate.get("mode", "fresh_gold_loop")
        if mode not in ("fresh_gold_loop", "full_flow_gate"):
            print(f"# {item['id']} {gate.get('id', mode)} uses {mode}; see snapshot/seed policy")
            continue
        print(
            "MOCK_LLM=false python3 scripts/mwf_gold_loop.py run "
            f"--scenario {item['id']} "
            f"--max-iterations {gate.get('max_iterations', 1)} "
            f"--stop-after-stage {gate.get('stop_after_stage', 2)} "
            f"--target-score {gate.get('target_score', 4.0)} "
            "--start-services --no-improve-on-final-fail"
        )
PY
```

If the CLI shape changes, inspect `python scripts/mwf_gold_loop.py --help` and record the exact commands used in `stages/06-rerun/output/run-results.md`.

## Focused Checks

Use `scripts/mwf_moment_eval.py` and `scripts/test_mwf_moment_eval.py` for focused moment and invariant checks when the repair plan names them.

Use `references/snapshot-replay-policy.md` for later-stage replay from saved real app state.

## Audit

Every rerun record must include command, environment, run directory, exit status, score path, invariant path, and cleanup status.
