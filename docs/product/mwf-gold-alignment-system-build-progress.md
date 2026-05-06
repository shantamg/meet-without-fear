# MWF Gold Alignment System Build Progress

Status: Phase 5 implemented; final audit in progress
Branch: `feat/gold-alignment-system-20260506`

## Baseline

- 2026-05-06: Created `feat/gold-alignment-system-20260506` from `main`.
- 2026-05-06: Merged prerequisite Moment Evaluator baseline from `feat/moment-evaluator-real-mode` because the required evaluator files were not present on local `main`.
- Required reading note: `docs/product/mwf-gold-flow-next-session-plan.md` is absent on this checkout; read `docs/product/gold-flow-next-session-plan.md`, which appears to be the available equivalent.

## Phase 1 - Stage Coverage

- [x] Added requested moment yaml files for:
  - `stage-1-emotional-pivot`
  - `stage-2-empathy-validation`
  - `stage-2-refinement-round`
  - `stage-3-mutual-reveal`
  - `stage-3-validity-gate`
  - `stage-4-willingness-selection`
  - `stage-4-no-shared-agreement`
  - `transition-stage-2-to-3`
- [x] Added one judge prompt per new moment under `eval/scorer/judge-prompts/`.
- [x] Each new moment has at least three rubric dimensions and at least two deterministic hard invariants.
- [x] Generalized `scripts/mwf_moment_eval.py` moment loading beyond hard-coded ids.
- [x] Added `python3 scripts/mwf_moment_eval.py run-library --real --no-improve` CLI surface.
- [x] Run each new moment through the current `--real --mock-judge --max-iterations 1 --no-improve` command path and record run directories.
- [x] Validate full library command with current real-mode command surface and record run directories.
- [x] Upgrade non-Stage-1 moments from deterministic local execution under `--real` to real backend execution.
- [x] Re-run each new moment end-to-end with strict `--real --max-iterations 1 --no-improve` after real backend support is generalized.

### Phase 1 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 20 tests; OK. Coverage added for Phase 1 moment shape, judge prompt presence, deterministic invariant negative cases, expected response pass cases, and `run-library`.
- `python3 scripts/mwf_moment_eval.py run-library --real --mock-judge --no-improve --max-iterations 1` - exit 0; produced:
  - `eval/runs/moment-stage-1-emotional-pivot-20260506-071513-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-2-empathy-validation-20260506-071524-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-2-refinement-round-20260506-071524-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-3-mutual-reveal-20260506-071524-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-3-validity-gate-20260506-071524-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-4-willingness-selection-20260506-071524-iter-01` - `eval_pass`, score `4.2`
  - `eval/runs/moment-stage-4-no-shared-agreement-20260506-071524-iter-01` - `eval_pass`, score `4.07`
  - `eval/runs/moment-transition-stage-2-to-3-20260506-071524-iter-01` - `eval_pass`, score `4.2`
- `npm run prisma:generate --workspace backend` - exit 0; regenerated Prisma client so local generated types match checked-in Stage 4/Tending schema.
- `npm run migrate:deploy --workspace backend` - exit 0; applied `20260506000000_add_stage4_tending_models` to local dev DB so generic Stage 4 seeding can write proposal/selections.
- `npm run check --workspace backend` - exit 0 after Prisma regeneration.
- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 22 tests; OK. Added real judge normalization coverage for flat and root-level dimension responses.
- `python3 scripts/mwf_moment_eval.py run --moment stage-2-empathy-validation --real --no-improve --max-iterations 1` - exit 0; produced `eval/runs/moment-stage-2-empathy-validation-20260506-072249-iter-01`; this verified real backend plus real judge on a new Phase 1 moment.
- `python3 scripts/mwf_moment_eval.py run-library --real --mock-judge --no-improve --max-iterations 1` - exit 0 with generic backend seeding after local DB migration; produced:
  - `eval/runs/moment-stage-1-emotional-pivot-20260506-071952-iter-01`
  - `eval/runs/moment-stage-2-empathy-validation-20260506-072012-iter-01`
  - `eval/runs/moment-stage-2-refinement-round-20260506-072020-iter-01`
  - `eval/runs/moment-stage-3-mutual-reveal-20260506-072028-iter-01`
  - `eval/runs/moment-stage-3-validity-gate-20260506-072035-iter-01`
  - `eval/runs/moment-stage-4-no-shared-agreement-20260506-072042-iter-01`
  - `eval/runs/moment-stage-4-willingness-selection-20260506-072104-iter-01`
  - `eval/runs/moment-transition-stage-2-to-3-20260506-072113-iter-01`
- `python3 scripts/mwf_moment_eval.py run-library --real --no-improve --max-iterations 1` - exit 0; produced strict real backend plus real judge artifacts:
  - `eval/runs/moment-stage-1-emotional-pivot-20260506-072343-iter-01` - `eval_pass`, score `4.5`
  - `eval/runs/moment-stage-2-empathy-validation-20260506-072411-iter-01` - `eval_fail`, score `0.0`, hard invariant failures `0`
  - `eval/runs/moment-stage-2-refinement-round-20260506-072423-iter-01` - `eval_fail`, score `0.97`, hard invariant failures `0`
  - `eval/runs/moment-stage-3-mutual-reveal-20260506-072435-iter-01` - `eval_fail`, score `0.67`, hard invariant failures `1`
  - `eval/runs/moment-stage-3-validity-gate-20260506-072445-iter-01` - `eval_fail`, score `0.33`, hard invariant failures `0`
  - `eval/runs/moment-stage-4-no-shared-agreement-20260506-072454-iter-01` - `eval_fail`, score `4.33`, hard invariant failures `1`
  - `eval/runs/moment-stage-4-willingness-selection-20260506-072522-iter-01` - `eval_fail`, score `0.0`, hard invariant failures `0`
  - `eval/runs/moment-transition-stage-2-to-3-20260506-072540-iter-01` - `eval_fail`, score `0.6`, hard invariant failures `1`

### Phase 1 Notes

- Generic real backend seeding is now implemented for non-Stage-1 moments. The low strict-real scores are expected product signal for later improver phases; Phase 1's acceptance criterion is that each authored moment runs and produces standard artifacts.
- Strict real library execution required applying the checked-in Stage 4/Tending migration to the local dev database.

## Phase 2 - Cross-Moment Regularization

- [x] Added same-stage moment discovery for cross-moment regression checks.
- [x] Improver now evaluates candidate revisions against every other moment sharing a stage before writing a prompt proposal.
- [x] Cross-moment evaluation checks deterministic hard invariants and score thresholds.
- [x] Cross-moment evaluation supports real LLM judge scoring via `real=True, mock_judge=False`.
- [x] Rejected revisions write `improvement-plan.md` with the rejection reason before raising.
- [x] Kept revisions log cross-moment results in `improvement-plan.md` for transparency.

### Phase 2 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 27 tests; OK. New Phase 2 tests cover:
  - non-regressing revision kept
  - score regression rejected
  - hard invariant regression rejected
  - real judge path is used when requested
  - improvement plan logs cross-moment evaluation
- `/usr/bin/time -p python3 - <<'PY' ... evaluate_cross_moment_regularization(stage-2-empathy-validation, real=True, mock_judge=False) ... PY` - exit 0; real `7.00`, under 90 seconds for a stage with same-stage checks. The real judge rejected the default candidate responses for the other Stage 2/transition moments (`stage-2-refinement-round`, `transition-stage-2-to-3`) by score threshold, confirming the LLM judge path runs and can reject candidates.

## Phase 3 - Trajectory Moments

- [x] Added `trajectory: [...]` schema validation for multi-turn moments.
- [x] Schema validation rejects malformed sequences, including missing AI turns.
- [x] Added one trajectory moment per stage:
  - `stage-1-trajectory-fact-to-handoff`
  - `stage-2-trajectory-empathy-cycle`
  - `stage-3-trajectory-needs-flow`
  - `stage-4-trajectory-willingness-to-close`
- [x] Mock trajectory runner persists intermediate AI responses in `state-delta.json` under `trajectory_steps`.
- [x] Real trajectory helper seeds once and sends each trajectory user turn through the backend SSE endpoint sequentially.
- [x] Added one judge prompt per trajectory moment.
- [x] Added unit tests exercising trajectory schema, malformed validation, mocked scoring, and state threading.
- [x] Extend real backend execution to drive each trajectory turn through the SSE endpoint instead of mocked trajectory responses.

### Phase 3 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 32 tests; OK. New trajectory tests cover schema validation, malformed rejection, expected response scoring, `state-delta.json` intermediate AI response persistence, and real trajectory helper routing.
- `python3 scripts/mwf_moment_eval.py run --moment stage-3-trajectory-needs-flow --max-iterations 1 --no-improve --mock-judge` - exit 0; produced `eval/runs/moment-stage-3-trajectory-needs-flow-20260506-073210-iter-01`; `state-delta.json` contains 4 `trajectory_steps`.
- `python3 scripts/mwf_moment_eval.py run --moment stage-1-trajectory-fact-to-handoff --real --mock-judge --max-iterations 1 --no-improve` - exit 0; produced `eval/runs/moment-stage-1-trajectory-fact-to-handoff-20260506-073314-iter-01`; `state-delta.json` contains 3 real backend `trajectory_steps`.
- `npm run check --workspace backend` - exit 0 after adding `run-trajectory` helper.

### Phase 3 Notes

- Strict real+judge runs for every trajectory were not run yet to control judge spend; the real backend trajectory path is verified on `stage-1-trajectory-fact-to-handoff`.

## Phase 4 - Autonomous Loop + PR Creation

- [x] Added `scripts/mwf_alignment_loop.py`.
- [x] Added `eval/alignment-loop-config.yaml` with all current moment ids, per-moment thresholds, schedule metadata, and default cost caps.
- [x] Loop writes `eval/alignment-runs/<timestamp>/summary.json` and `summary.md`.
- [x] Loop enforces per-run and per-day cost caps before each moment execution.
- [x] Dry-run mode scores moments and records summaries without writing prompt revisions or opening PRs.
- [x] Live mode runs the improver for below-threshold moments, then opens `loop/alignment-<moment-id>-<timestamp>` PRs with title, body, draft flag, and `loop:auto-improvement` label.
- [x] PR creation refuses protected source branches and restores the original branch after opening a loop PR.
- [x] Added `crontab.example` with weekly cadence, log-directory creation, and noninteractive `--real --real-judge` invocation.
- [x] Ignored generated `eval/alignment-runs/` artifacts.

### Phase 4 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 35 tests; OK. New Phase 4 tests cover dry-run summary generation, tight cost-cap partial abort, and isolated PR creation metadata/label/branch/draft behavior with GitHub commands mocked.
- `python3 scripts/mwf_alignment_loop.py --dry-run --timestamp phase4-dry-run-20260506-clean` - exit 0; produced `eval/alignment-runs/phase4-dry-run-20260506-clean/summary.md`; summary verdict `complete`; scored 14 configured moments; recorded `28.0` cents estimated spend; no PRs opened.
- `python3 scripts/mwf_alignment_loop.py --dry-run --per-run-cap-cents 5 --timestamp phase4-cap-20260506-clean` - expected exit 2; produced partial summary at `eval/alignment-runs/phase4-cap-20260506-clean/summary.json`; summary verdict `aborted`; stopped before `stage-1-trajectory-fact-to-handoff` with diagnostic `6.00c > 5.00c`; recorded the first 2 moments and `4.0` cents estimated spend.
- `python3 scripts/mwf_alignment_loop.py --help` - exit 0; confirms noninteractive cron flags are available, including `--real` and `--real-judge`.
- `npm run check --workspace backend` - exit 0 after Phase 4 changes.

### Phase 4 Notes

- The current library has 14 configured moments, not 13, because it includes the original Stage 1 and Stage 4 baseline moments plus the newly added coverage and trajectory moments.
- The checked-in cron command is a live real-backend/real-judge invocation. It is still noninteractive; missing credentials will fail as a command error rather than prompting for TTY input.

## Phase 5 - Outer Loop + Gold Onboarding + Dashboard

- [x] Restored `scripts/mwf_gold_loop.py` unchanged from existing repository history so the E2E loop is available as the required black-box subprocess.
- [x] Alignment PR creation now schedules outer-loop validation through `scripts/mwf_gold_loop.py run` for candidate prompt revisions.
- [x] Outer-loop regressions greater than `0.5` versus baseline convert the PR to draft and add an `E2E regression detected` comment with the local evidence path.
- [x] Added `scripts/mwf_add_gold_example.py <transcript-path>` for markdown transcript validation, transcript copying, draft moment scaffolding, moment index regeneration, and evaluator test execution.
- [x] Added generated moment library index `eval/moments/README.md`.
- [x] Added `scripts/mwf_alignment_status.py` to regenerate `docs/product/mwf-alignment-status.md` from artifacts.
- [x] Updated `docs/product/mwf-moment-evaluator-plan.md` with the autonomous alignment system as built.

### Phase 5 Validation

- `python3 scripts/test_mwf_moment_eval.py` - exit 0; ran 38 tests; OK. New Phase 5 tests cover:
  - known-bad outer-loop score converts the mocked PR to draft and adds the expected regression comment
  - fixture transcript onboarding copies the transcript, scaffolds two draft moment files, updates the index, and invokes the evaluator test command
  - status dashboard rendering is idempotent and contains all required sections
- `python3 scripts/mwf_alignment_status.py` - exit 0; regenerated `docs/product/mwf-alignment-status.md`.
- `python3 scripts/mwf_alignment_status.py` run twice with SHA comparison - exit 0; dashboard output was identical across regenerations.
- `python3 scripts/mwf_alignment_loop.py --dry-run --timestamp phase5-dry-run-20260506` - exit 0; produced `eval/alignment-runs/phase5-dry-run-20260506/summary.md`.
- `npm run check --workspace backend` - exit 0.
- `python3 scripts/mwf_gold_loop.py --help` - exit 0; confirms restored E2E loop exposes `run`, `browser-smoke`, `stage1-smoke`, and related commands.
- `python3 scripts/mwf_gold_loop.py browser-smoke` - first attempt exit 1 because `http://localhost:8082` was not running. After starting `npm run dev:mobile:e2e` with the backend already healthy on `http://localhost:3000`, retry exit 0; preflight `services: ok`; actor reported `browser_control: ok`, URL `http://localhost:8082/`, and visible page state.

### Phase 5 Notes

- `scripts/mwf_gold_loop.py` was absent from the current checkout but present in commit `a12a02c`; it was restored as the black-box E2E harness required by this goal.
- The onboarding command writes `.yaml.draft` files by design; authored moment yaml files remain a human-review step after scaffolding.

## Questions For Shantam

- None.
