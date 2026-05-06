# MWF Truly Autonomous Alignment Build Progress

Status: Phase 1 implemented; Phase 2 next
Branch: `feat/autonomous-alignment-20260506`

## Baseline

- 2026-05-06: Created `feat/autonomous-alignment-20260506` from `main`.
- Required goal: `docs/product/mwf-truly-autonomous-alignment-goal.md`.
- Previous shipped system context read from:
  - `docs/product/mwf-gold-alignment-system-goal.md`
  - `docs/product/mwf-moment-evaluator-plan.md`
  - `docs/product/mwf-moment-evaluator-build-progress.md`
  - `docs/product/mwf-gold-alignment-system-build-progress.md`

## Phase 1 - Regularization Bug Fix

- [x] Replaced absolute-threshold cross-moment regularization with delta-based baseline regularization.
- [x] Cross-moment gate now accepts candidate revisions when every other moment remains at or above `previous_baseline - 0.05`.
- [x] Cross-moment gate still rejects deterministic hard-invariant failures.
- [x] Added baseline helpers for `eval/baselines/<moment-id>.json`.
- [x] Initial baselines are persisted only when absent during real alignment-loop scoring or first real cross-moment evaluation.
- [x] Existing baselines are not overwritten by normal runs; `update_merged_baseline()` is the explicit merged-revision update path.
- [x] Improvement plans now log baseline, minimum accepted score, tolerance, and rejection reason.
- [x] Added tests for equal-baseline acceptance, `0.03` degradation acceptance, `0.10` degradation rejection with logged baseline, and initial baseline non-overwrite.

### Phase 1 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 42 tests; OK.

### Phase 1 Notes

- The old gate rejected moments below their eventual rubric threshold even if they did not regress. The new gate treats below-threshold production moments as shippable baselines and blocks only meaningful deltas downward.
- The explicit Phase 1 live-loop PR-opening check is not run yet; the terminal goal opens the final human-review PR at the end, and the live loop creates side-effect GitHub PRs. This remains a Phase 5 verification item unless Shantam wants the auto-loop PR side effect earlier.

## Phase 2 - Auto-Extraction

- [ ] Transcript parser.
- [ ] AI-turn identification.
- [ ] Seed state generation.
- [ ] Rubric generation via Bedrock Haiku with prompt caching for shared transcript content.
- [ ] Hard invariant generation.
- [ ] `mwf_add_gold_example.py --auto` end-to-end onboarding command.
- [ ] Idempotence.

## Phase 3 - Coverage Parity

- [ ] `eval/moment-types.yaml` taxonomy.
- [ ] `mwf_alignment_status.py --coverage-check`.
- [ ] Cross-couple parity gate.

## Phase 4 - Backfill Existing Library

- [ ] Run auto onboarding against `adam-eve.md`.
- [ ] Run auto onboarding against `james-catherine.md`.
- [ ] Run auto onboarding against `core-protocol-update.md`.
- [ ] De-duplicate hand-authored and auto-generated moments.
- [ ] Confirm stage coverage requirements.

## Phase 5 - Re-Run And Validate

- [ ] Real-mode alignment loop with `--real --real-judge`.
- [ ] E2E browser smoke.
- [ ] Actual Adam/Eve gold session via existing skill if available.
- [ ] Documentation updates.
- [ ] Final PR opened.

## Questions For Shantam

- None.
