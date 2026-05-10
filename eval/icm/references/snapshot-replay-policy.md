# Snapshot Replay Policy

Use the existing snapshot system for later-stage focused reruns. Do not create a parallel checkpoint mechanism in ICM.

## Existing Execution Layer

- Save snapshots: `scripts/ec2-bot/scripts/save-snapshot.sh`
- Restore snapshots: `scripts/ec2-bot/scripts/restore-snapshot.sh`
- Gold loop replay: `scripts/mwf_gold_loop.py run --from-snapshot <snapshot-id-or-name>`
- Optional restored session selection: `--snapshot-session-id <session-id>`
- Synthetic stage seed alternative: `scripts/mwf_gold_loop.py run --seed-target-stage <target-stage>`

## When To Use Snapshot Replay

Use `snapshot_replay` when:

- the failure is in Stage 3, Stage 4, or another later state that is expensive or noisy to reach from Stage 1;
- the snapshot was produced by a real app flow close enough to the failed state;
- the targeted behavior depends on persisted session state, partner membership, stage progress, messages, empathy attempts, needs, rankings, or strategy records;
- the repair plan can name exactly what the replay must verify.

Prefer `seed_target_stage` when a deterministic synthetic state is enough and the failure does not depend on a real historical transcript or nuanced app state.

Use a fresh gold loop when testing onboarding, actor fidelity, Stage 1/2 pacing, fresh E2E session creation, transcript extraction, or final integration.

## Registry

Durable snapshot metadata lives in `eval/gold-snapshot-registry.json`.

Each entry should use this shape:

```json
{
  "id": "james-catherine-stage-4-no-agreement",
  "scenario": "james-catherine",
  "snapshot": "stage-4-no-agreement",
  "snapshot_session_id": null,
  "starts_at_stage": 4,
  "starts_for": ["James", "Catherine"],
  "purpose": "Verify no-shared-agreement closure without replaying Stages 1-3.",
  "expected_state": [
    "Session.currentStage is 4",
    "Both users completed Stage 3",
    "The session is on the no-shared-agreement path"
  ],
  "target_behaviors": [
    "MWF honors no shared agreement",
    "No pressure toward repair or false consensus"
  ],
  "required_invariants": [
    "hard invariants pass",
    "no internal control tags",
    "copy promising input implies input visible"
  ],
  "last_verified": null
}
```

Snapshot IDs may be dashboard IDs, local name fragments, or local SQL paths supported by `restore-snapshot.sh`. Dashboard IDs remain filesystem-bound until snapshot SQL files are copied to the runner machine.

## Audit Requirements

Every snapshot replay record must include:

- snapshot id/name/path;
- snapshot registry entry id, if present;
- restored session id or lookup rule;
- scenario id;
- command and `MOCK_LLM=false` status;
- run directory;
- target behavior;
- why replay is valid evidence for the routed failure;
- what the replay does not prove;
- cleanup status.

If restore fails because the SQL file is missing locally, route the blocker to `eval_harness` or `human_decision` and do not claim prompt-quality evidence.
