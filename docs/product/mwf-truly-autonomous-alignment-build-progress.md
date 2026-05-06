# MWF Truly Autonomous Alignment Build Progress

Status: Phases 1-4 implemented; Phase 5 verification in progress
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

- [x] Added `scripts/mwf_extract_moments.py`.
- [x] Transcript parser extracts ordered turns with role, content, line range, stage, and inferred sub-state from bold speaker turns, plain speaker turns, and quoted protocol MWF turns.
- [x] AI-turn identification picks 4-8 moments by default while preserving up to two moments per stage where possible.
- [x] Seed generation writes a serializable seed with prior history, stage gates, participants, actor trigger, and transcript line references compatible with the existing generic moment runner.
- [x] Rubric generation writes moment-specific dimensions anchored to the selected transcript turn and surrounding line evidence.
- [x] Judge prompts are generated per moment under `eval/scorer/judge-prompts/`.
- [x] Hard invariant generation emits deterministic invariant ids consumed by `scripts/mwf_moment_eval.py`.
- [x] `python3 scripts/mwf_add_gold_example.py <transcript> --auto` writes ready `.yaml` moments and judge prompts, updates `eval/moments/README.md`, updates `eval/alignment-loop-config.yaml`, and runs evaluator tests by default.
- [x] Idempotence verified by re-running onboarding for Adam/Eve and James/Catherine; second run wrote no moment or judge-prompt files.

### Phase 2 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 45 tests; OK.
- `python3 scripts/mwf_add_gold_example.py docs/product/source-material/golden-transcripts/adam-eve.md --auto --max-moments 8` - exit 0; wrote 8 initial generated moments and judge prompts; tests exit 0.
- `python3 scripts/mwf_add_gold_example.py docs/product/source-material/golden-transcripts/james-catherine.md --auto --max-moments 8` - exit 0; wrote 8 initial generated moments and judge prompts; tests exit 0.
- `python3 scripts/mwf_add_gold_example.py docs/product/source-material/golden-transcripts/core-protocol-update.md --auto --max-moments 8` - after narrowing the advice invariant for gold protocol language, rerun exit 0; core protocol is prose, so extractor produced the quoted Stage 2/3 protocol turns.

## Phase 3 - Coverage Parity

- [x] Added `eval/moment-types.yaml` taxonomy.
- [x] Added `python3 scripts/mwf_alignment_status.py --coverage-check`.
- [x] Status dashboard now includes a coverage summary.
- [x] Cross-moment regularization now records stage transcripts, checked transcripts, coverage warnings, and a coverage parity verdict.
- [x] If only one transcript covers a stage, the gate logs a coverage-blind warning and proceeds. If multiple transcripts cover a stage, checked regularization moments must cover at least two transcripts.

### Phase 3 Validation

- `python3 scripts/mwf_alignment_status.py --coverage-check` - exit 0; reports covered and missing moment types for `adam-eve`, `james-catherine`, and `core-protocol-update`.
- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 45 tests; OK.

## Phase 4 - Backfill Existing Library

- [x] Ran auto onboarding against `adam-eve.md`.
- [x] Ran auto onboarding against `james-catherine.md`.
- [x] Ran auto onboarding against `core-protocol-update.md`.
- [x] Hand-authored and auto-generated moments coexist by line-derived ids; no exact `(transcript, line range, sub-state)` duplicates were generated.
- [x] Added generated moment ids to `eval/alignment-loop-config.yaml`; current config has 38 moments.
- [x] Confirmed per-transcript stage counts:
  - `adam-eve`: Stage 1 = 5, Stage 2 = 4, Stage 3 = 5, Stage 4 = 4.
  - `james-catherine`: Stage 1 = 2, Stage 2 = 4, Stage 3 = 2, Stage 4 = 5.
  - `core-protocol-update`: Stage 2 = 5, Stage 3 = 3; no turn-style Stage 1/4 content extracted from this prose protocol file.

### Phase 4 Validation

- `python3 scripts/mwf_alignment_loop.py --dry-run --timestamp autonomous-dry-run-20260506b --per-run-cap-cents 1000` - exit 0; wrote `eval/alignment-runs/autonomous-dry-run-20260506b/summary.md`.
- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 45 tests; OK.
- `npm run check --workspace backend` - exit 0.

## Phase 5 - Re-Run And Validate

- [ ] Real-mode alignment loop with `--real --real-judge`.
- [x] Real-mode alignment loop dry-run with `--real --real-judge`.
- [x] E2E browser smoke.
- [x] Actual Adam/Eve gold session via existing skill if available.
- [ ] Documentation updates.
- [x] Scoped live auto-loop PR creation verified.
- [ ] Final PR opened.

### Phase 5 Validation

- `npm run check --workspace backend` - exit 0.
- `python3 scripts/mwf_alignment_loop.py --dry-run --real --real-judge --timestamp autonomous-real-dry-run-20260506b --per-run-cap-cents 1000` - exit 0; scored all 38 configured moments; verdict `complete`; estimated spend `76.0` cents; initialized real-mode baselines under `eval/baselines/`; 5 moments at or above threshold and 33 below threshold.
- `python3 scripts/mwf_gold_loop.py browser-smoke` - exit 0 after starting the E2E web bundle on `localhost:8082`; preflight `services: ok`; browser control `ok`.
- `python3 scripts/mwf_gold_loop.py run --scenario adam-eve --max-iterations 1 --max-actor-turns 2 --actor-timeout 180 --scorer-timeout 120 --mock-scorer --no-improve-on-final-fail --start-services --skip-transcripts` - exit 1; seeded session `cmotuew6i000apx98q567i3d6`, then the Adam `codex exec` actor timed out after 180 seconds before returning `MWF_GOLD_STATUS`. Scratch log: `docs/product/gold-session-scratch/2026-05-06-cmotuew6i000apx98q567i3d6-adam.md`.
- Retry: `python3 scripts/mwf_gold_loop.py run --scenario adam-eve --max-iterations 1 --max-actor-turns 1 --actor-timeout 600 --scorer-timeout 120 --mock-scorer --no-improve-on-final-fail --start-services --skip-transcripts` - exit 0; one bounded Adam-side actor run reached Stage 2 and returned `needs_partner` blocked on Eve. Mock score `3.0`, target not reached because only Adam's side was driven. Scratch log: `docs/product/gold-session-scratch/2026-05-06-cmotukf3a001qpx98mymq0p7t-adam.md`.
- `python3 scripts/mwf_alignment_loop.py --config <1-moment temp config> --timestamp autonomous-live-scoped-real-20260506 --real --real-judge --skip-outer-loop` - exit 0; created loop PR #379 (`https://github.com/shantamg/meet-without-fear/pull/379`) for `adam-eve-stage-2-consent-gate-169`. The PR opened successfully; initial label add failed because `loop:auto-improvement` did not exist. Created the label and applied it manually, then patched `create_alignment_pr()` to create the label automatically if missing.
- `python3 scripts/mwf_alignment_loop.py --config <2-moment temp config> --timestamp autonomous-live-scoped-real2-20260506 --real --real-judge --skip-outer-loop` - exit 0; no additional PRs opened because real cross-moment regularization rejected both candidate revisions for baseline regressions. This is expected behavior from the stricter delta gate, but it means the old "at least 3 PRs" expectation did not hold under real judging.
- Final review PR: #380 (`https://github.com/shantamg/meet-without-fear/pull/380`).

### Phase 5 Notes

- The backend was already running on `localhost:3000`; a redundant `npm run dev:api` attempt hit `EADDRINUSE`.
- The E2E web server was started with `npm run dev:mobile:e2e` for browser smoke and stopped afterward.
- Full-batch live auto-loop was intentionally not run to avoid opening dozens of auto-PRs at once. Scoped live auto-loop PR creation is verified by #379. Two further scoped real candidates were correctly rejected by baseline regularization, so the Phase 1 "at least 3 PRs" expectation was not met under real judging. The bounded Adam-side gold run completed; a full two-sided Adam/Eve completion would require driving Eve in a second actor/session.

## Questions For Shantam

- None.
