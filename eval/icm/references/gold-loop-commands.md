# Gold Loop Commands

Use `scripts/mwf_gold_loop.py` as the canonical bounded loop runner. Do not replace it with ICM logic.

## Required Reruns

Read required scenarios from `eval/gold-scenarios.json`. Rerun every scenario where `live_enabled` is `true` or omitted with real LLM mode. Exclude only scenarios with `live_enabled: false`.

Use the scenario's `gate` values when present:

- `target_score`
- `stop_after_stage`
- `max_iterations`

Use bounded defaults for legacy entries that omit gate settings: target score `4.0`, stop after Stage `2`, and max iterations `1`.

Command template:

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario <scenario-id> --max-iterations <max-iterations> --stop-after-stage <stop-after-stage> --target-score <target-score> --start-services --no-improve-on-final-fail
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
    gate = item.get("gate", {})
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

## Audit

Every rerun record must include command, environment, run directory, exit status, score path, invariant path, and cleanup status.
