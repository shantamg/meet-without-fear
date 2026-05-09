# Stage Coverage Policy

ICM supports multiple evaluation depths. Choose the shallowest mode that can truthfully test the routed failure, then use broader gates before declaring readiness.

## Coverage Modes

| Mode | Purpose | Clean-Pass Role |
|---|---|---|
| `moment_eval` | Direct prompt or invariant checks for one known state. | Focused verification only. |
| `seed_target_stage` | Synthetic app state seeded by `scripts/mwf_gold_loop.py --seed-target-stage`. | Focused product or prompt verification only. |
| `snapshot_replay` | Restore a saved real app DB state and continue from there. | Focused later-stage verification only unless a gate explicitly marks it required. |
| `fresh_gold_loop` | Start from a fresh gold session and run to the configured stage. | Required for current bounded clean pass. |
| `full_flow_gate` | Start fresh and run through the final configured stage. | Required when the cycle claims all-stage readiness. |

## Escalation Rule

- Use `moment_eval`, `seed_target_stage`, or `snapshot_replay` for fast repair loops.
- After a focused repair passes, rerun the narrowest fresh gate that could regress.
- Before claiming all-stage readiness, run each required `full_flow_gate` in `eval/gold-scenarios.json`.

## Not A Substitute

Snapshot replay does not prove actor fidelity, Stage 1/2 pacing, invite/access seeding, or end-to-end transcript extraction unless those surfaces are explicitly part of the restored-state test.

A Stage 3/4 snapshot replay can clear a Stage 3/4 blocker. It cannot replace a fresh bounded gate unless the cycle report records a human-approved exception.
