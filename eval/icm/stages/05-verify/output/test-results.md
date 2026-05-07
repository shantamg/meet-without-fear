# Test Results

## Focused Verification

- Command: `diff -u eval/skills/mwf-gold-loop-actor/SKILL.md /Users/shantam/.codex/skills/mwf-gold-loop-actor/SKILL.md`
  - Exit status: `0` after runtime mirror update.
  - Coverage: confirms the active runtime actor skill matched the repo actor skill before the rerun.

## Real-LLM Verification

- Command:
  - `MOCK_LLM=false python3 scripts/mwf_gold_loop.py run --scenario james-catherine --max-iterations 1 --stop-after-stage 2 --target-score 4.0 --start-services --no-improve-on-final-fail`
  - Run dir: `eval/runs/20260507-024645-james-catherine-iter-01`
  - Exit status: `0`
  - Score: `3.8`
  - Hard invariants: pass
  - Coverage: verifies the actor-skill change against the same required bounded gate that exposed the actor-fidelity failure.
  - Result: actor fidelity improved to pass (`4`), but clean pass still failed because MWF handling scored `3`.

## Cleanup Verification

- `eval/runs/20260507-020604-adam-eve-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-022720-james-catherine-services/cleanup.json`: backend and web stopped.
- `eval/runs/20260507-024640-james-catherine-services/cleanup.json`: backend and web stopped.
- Command: `python3 scripts/mwf_gold_loop.py cleanup-browsers`
  - Exit status: `0`
  - Output: `closed 0 mwf-gold browser session(s)`.
