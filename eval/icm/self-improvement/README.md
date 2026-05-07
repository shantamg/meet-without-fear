# Self-Improvement

Track eval-machine improvements here, separately from product fixes.

## Proposal Requirements

Each proposal must include:

- Evidence.
- Diagnosis.
- Files to change.
- Whether the change tightens, clarifies, or weakens the system.
- Regression coverage.
- Rollback notes.
- Whether a snapshot replay, seeded-stage check, fresh gate, or full-flow gate should verify the change.

Weakening scoring, hard invariants, completion criteria, or actor difficulty requires explicit human approval.

## Backlogs

- `actor/backlog.md`: actor persona and difficulty improvements.
- `judge/backlog.md`: scorer and rubric improvements.
- `reporter/backlog.md`: synthesis and handoff improvements.
- `harness/backlog.md`: runner, transcript, invariant, and cleanup improvements.
- `routing/backlog.md`: ICM policy and stage contract improvements.
- `proposals/`: promoted concrete proposals.

## Snapshot Replay

When repeated cycles spend most of their time replaying early stages to reach a later-stage failure, propose a snapshot replay entry in `eval/gold-snapshot-registry.json`.

Snapshot replay proposals must preserve required fresh gates. They are a speed and focus improvement, not a shortcut around clean-pass criteria.
