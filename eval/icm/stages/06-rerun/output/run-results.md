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

### james-catherine / bounded-stage-2 / after Stage 0 prompt patch

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Partial run dir: `eval/runs/20260507-073948-james-catherine-iter-01`
- Exit status: `1` from operator `KeyboardInterrupt` after the user reported a product UI issue in the invitation-confirmation path.
- Score: none.
- `score.json`: absent.
- `invariants.json`: absent.
- Transcripts: incomplete.
- Scratch logs: partial Catherine scratch log present.
- Cleanup: services stopped in `eval/runs/20260507-073943-james-catherine-services/cleanup.json`; `cleanup-browsers` closed `0` sessions; no `mwf_gold_loop`, app dev server, Metro/Expo, or `agent-browser` daemon remains.
- Result: not evaluable for clean pass. Do not count this interrupted run as evidence of prompt quality.

### james-catherine / bounded-stage-2 / completed after Stage 0 prompt patch

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Run dir: `eval/runs/20260507-075001-james-catherine-iter-01`
- Summary: `eval/runs/20260507-075001-james-catherine-loop-summary.md`
- Score: `3.5`
- Exit status: `0`
- `score.json`: present
- `invariants.json`: pass
- Transcripts: complete through Stage 2 for Catherine and James.
- Scratch logs: present.
- Cleanup: services stopped in `eval/runs/20260507-074956-james-catherine-services/cleanup.json`.
- Remaining failure: Stage 2 share suggestion/context-share state surfaced before James completed his own empathy attempt.

### james-catherine / bounded-stage-2 / after share-offer fetch gating patch

- Command: `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
- Run dir: `eval/runs/20260507-080727-james-catherine-iter-01`
- Summary: `eval/runs/20260507-080727-james-catherine-loop-summary.md`
- Score: `4.0`
- Exit status: `0`
- `score.json`: present, verdict `eval_pass`
- `invariants.json`: pass
- Transcripts: complete through Stage 2 for Catherine and James.
- Scratch logs: present.
- Cleanup: services stopped in `eval/runs/20260507-080723-james-catherine-services/cleanup.json`.
- Result: target reached; required bounded gate passed.

## Budget

- Fresh `adam-eve` reruns this cycle: `1`.
- Fresh completed `james-catherine` reruns this cycle: `4` of `4`.
- Interrupted partial `james-catherine` attempts: `1`, not counted as a completed scoring rerun.
- Snapshot replays: `0`.
- Full-flow gates: `0`.
- Budget status: human approved raising the fresh real-LLM rerun allowance to at least `4` full fresh runs per scenario. The final approved `james-catherine` bounded rerun reached target.

## Snapshot Replay

- Not used.
