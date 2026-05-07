# Stage 02: Triage

## Inputs

- `stages/01-intake/output/latest-artifact-index.md`
- `score.json`
- `invariants.json`
- transcripts
- scratch logs
- `FAILURE_TAXONOMY.md`

## Process

Classify each failure to exactly one primary owner. Determine severity, evidence, and whether prompt quality is evaluable.

Use `not_evaluable_for_prompt_quality` only for invalid or incomplete artifacts, not for weak product or prompt behavior.

## Outputs

- `output/failure-routing.md`

## Audit

Every failure must have owner, severity, evidence path, prompt-quality evaluability, and a short rationale. Missing evidence must route to `eval_harness`, `scorer`, or `human_decision` as appropriate.
