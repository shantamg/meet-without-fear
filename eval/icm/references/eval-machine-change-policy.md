# Eval Machine Change Policy

Eval-machine fixes may touch ICM routing, actor skill behavior, scorer instructions, reporter templates, invariants, harness code, or cleanup policy.

Every eval-machine change must say whether it tightens, clarifies, or weakens the system. Weakening requires explicit human approval before implementation.

Use existing specialist skills and scripts as the execution layer. Do not create a parallel orchestrator that duplicates `scripts/mwf_gold_loop.py` without reviewed approval.

## Reviewed References

- PR #438, `scripts/mwf_eval_loop.py`: reference material only unless explicitly approved after review against `scripts/mwf_gold_loop.py` and the scorer flow.
- PR #432: closed as superseded by the bounded gold-loop calibration pass; do not revive as canonical without explicit approval.
