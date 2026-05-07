# Gold Snapshot Registry

`eval/gold-snapshot-registry.json` names saved DB/app-state snapshots that are valid starting points for focused MWF gold-loop replay.

The registry is metadata only. It does not store raw SQL dumps, dashboard artifacts, or run transcripts.

## Entry Shape

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
    "Both users completed Stage 3"
  ],
  "target_behaviors": [
    "MWF honors no shared agreement"
  ],
  "required_invariants": [
    "hard invariants pass"
  ],
  "last_verified": {
    "run_dir": "eval/runs/...",
    "verified_at": "YYYY-MM-DD",
    "result": "pass"
  }
}
```

## Snapshot Values

`snapshot` may be any value accepted by `scripts/ec2-bot/scripts/restore-snapshot.sh`:

- dashboard snapshot id;
- local snapshot name fragment;
- local SQL snapshot path.

Dashboard IDs are filesystem-bound until their SQL file exists on the runner machine.

## Commands

```sh
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario <scenario-id> \
  --from-snapshot <snapshot-id-or-name> \
  --snapshot-session-id <session-id-if-needed> \
  --start-services
```

See `eval/icm/references/snapshot-replay-policy.md`.
