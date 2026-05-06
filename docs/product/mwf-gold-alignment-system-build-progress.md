# MWF Gold Alignment System Build Progress

Status: Phase 3 implemented; Phase 4 not started
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

- [ ] Not started.

## Phase 5 - Outer Loop + Gold Onboarding + Dashboard

- [ ] Not started.

## Questions For Shantam

- None.
