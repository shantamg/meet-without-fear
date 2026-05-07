# Run Results

## Required Bounded Clean-Pass Gates

### adam-eve / bounded-stage-2

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario adam-eve --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Run dir: `eval/runs/20260507-020609-adam-eve-iter-01`
- Summary: `eval/runs/20260507-020609-adam-eve-loop-summary.md`
- Score: `4.0`
- Exit status: `0`
- `score.json`: present
- `invariants.json`: pass
- Transcripts: complete through Stage 2 for Adam and Eve.
- Scratch logs: present.
- Cleanup: services stopped in `eval/runs/20260507-020604-adam-eve-services/cleanup.json`.

### james-catherine / bounded-stage-2 / first run

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Run dir: `eval/runs/20260507-022725-james-catherine-iter-01`
- Summary: `eval/runs/20260507-022725-james-catherine-loop-summary.md`
- Score: `3.0`
- Exit status: `0`
- `score.json`: present
- `invariants.json`: pass
- Transcripts: complete through Stage 2 for Catherine and James.
- Scratch logs: present.
- Cleanup: services stopped in `eval/runs/20260507-022720-james-catherine-services/cleanup.json`.
- Primary failure: actor fidelity, James Stage 2 too polished/too compliant.

### james-catherine / bounded-stage-2 / after actor patch

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Run dir: `eval/runs/20260507-024645-james-catherine-iter-01`
- Summary: `eval/runs/20260507-024645-james-catherine-loop-summary.md`
- Score: `3.8`
- Exit status: `0`
- `score.json`: present
- `invariants.json`: pass
- Transcripts: complete through Stage 2 for Catherine and James.
- Scratch logs: present.
- Cleanup: services stopped in `eval/runs/20260507-024640-james-catherine-services/cleanup.json`.
- Remaining failures: MWF prompt topic shaping, transcript review/approval auditability.

## Budget

- Fresh `adam-eve` reruns this cycle: `1`.
- Fresh `james-catherine` reruns this cycle: `2` of `4`.
- Snapshot replays: `0`.
- Full-flow gates: `0`.
- Budget status: human approved raising the fresh real-LLM rerun allowance to at least `4` full fresh runs per scenario. `james-catherine` has `2` fresh reruns remaining in this cycle.

## Snapshot Replay

- Not used.
