# Gold Loop Commands

Use `scripts/mwf_gold_loop.py` as the canonical bounded loop runner. Do not replace it with ICM logic.

## Required Reruns

Run both canonical pairs with real LLM mode:

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario adam-eve --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail
```

If the CLI shape changes, inspect `python scripts/mwf_gold_loop.py --help` and record the exact commands used in `stages/06-rerun/output/run-results.md`.

## Focused Checks

Use `scripts/mwf_moment_eval.py` and `scripts/test_mwf_moment_eval.py` for focused moment and invariant checks when the repair plan names them.

## Audit

Every rerun record must include command, environment, run directory, exit status, score path, invariant path, and cleanup status.
