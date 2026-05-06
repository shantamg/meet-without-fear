# MWF Moment Evaluator Build Progress

Status: complete for the resumed criterion 9/10 verification pass
Branch: `codex/mwf-gold-self-improve-stage1`

## Real Mode

Status: implemented and real-run verified for `stage-1-fact-reflection` on 2026-05-05/06.

### Real Mode Criteria

- [x] 1. Real Prisma seed writes real rows.
- [x] 2. Runner calls the real `messages.ts` controller in-process through `supertest`.
- [x] 3. Real backend run hits the real Bedrock/Anthropic API.
- [x] 4. Judge is a real LLM call with a 5-cent default cost guard.
- [x] 5. Stage 1 hard invariants are deterministic Python checks independent of judge scoring.
- [x] 6. Real improver writes a Stage 1 prompt version and rerun shows score movement.
- [x] 7. Branch protection manually confirmed from `main`.
- [x] 8. Unit tests pass with new real-mode mocked-boundary coverage.
- [x] 9. Existing E2E browser smoke passes.
- [x] 10. Backend typecheck passes.
- [x] 11. Documentation updated with real-mode behavior and validation evidence.

### Real Mode Files Touched

- `scripts/mwf_moment_eval.py`
- `scripts/test_mwf_moment_eval.py`
- `backend/src/scripts/mwf-moment-real.ts`
- `backend/src/services/stage-prompts.ts`
- `eval/moments/stage-1-fact-reflection.yaml`
- `eval/scorer/judge-prompts/stage-1-fact-reflection.md`
- `eval/prompt-versions/mwf/stage-1/v03.md`
- `backend/package.json`
- `package-lock.json`
- `docs/product/mwf-moment-evaluator-build-progress.md`
- `docs/product/mwf-moment-evaluator-plan.md`

### Real Mode Decisions

- Test sessions are tagged by `Session.topicFrame` prefix: `[mwf-moment-eval] stage-1-fact-reflection`. Cleanup uses that tag and deletes the associated relationship and test users.
- The Python runner shells out to `backend/src/scripts/mwf-moment-real.ts`; the helper uses Prisma for seed/cleanup, `supertest` against the Express app for `POST /api/sessions/:id/messages/stream`, and Bedrock Haiku (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) for LLM judging.
- The real prompt rerun uses a Stage 1-only hook, `MWF_STAGE1_PROMPT_APPEND`, inside `buildStage1Prompt`. Stage 4 prompt regions were not edited.
- The judge template lives in `eval/scorer/judge-prompts/stage-1-fact-reflection.md`. The Bedrock call sends the system prompt and judge template as cache-control ephemeral blocks where supported.

### Real Mode Validation Runs

- Real-mode implementation commit: `d8627ae` (`Add real-mode moment evaluator`), pushed to `origin/codex/mwf-gold-self-improve-stage1`.
- Real Bedrock run artifacts were produced before the implementation commit at source SHA `4a2395e612d2d33a1f5b0b9ce316ca56e3bd4c35`; the scoped implementation was then committed as `d8627ae`.
- `python3 scripts/mwf_moment_eval.py seed --moment stage-1-fact-reflection --real --print-state` — exit 0; printed real cuid session `cmoto1z1x0007px37cw9mxaxp`, 2 users, 2 relationship members, 4 stage progress rows, 5 prior messages.
- `python3 scripts/mwf_moment_eval.py seed-cleanup --older-than 0h` — exit 0; removed 11 tagged test sessions, 11 relationships, 22 test users.
- `/usr/bin/time -p python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --max-iterations 1 --no-improve` — exit 0; created `eval/runs/moment-stage-1-fact-reflection-20260506-061931-iter-01/`; observed `real 18.45`. The run contains `seed-state.json`, `ai-response.md`, `state-delta.json`, `score.json`, `score-rationale.md`, `run.json`, and `judge-raw.json`.
- Real non-determinism evidence: consecutive real responses differed. `20260506-061931-iter-01` responded `That's the fear underneath all of it...`; `20260506-062008-iter-01` responded `That's the weight you've been carrying...`; `20260506-062122-iter-01` responded `That's a heavy thing to carry alone...`.
- Real improvement loop: `/usr/bin/time -p python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --target-score 4.0 --max-iterations 3 --allow-protected-branch-patch` — exit 0; created `eval/runs/moment-stage-1-fact-reflection-20260506-062122-iter-01/` and `iter-02/`; observed `real 26.37`.
- Improvement evidence: `iter-01` scored `2.33` and failed `no_advice_or_solutioning`; improver wrote `eval/prompt-versions/mwf/stage-1/v03.md`; `iter-02` scored `4.33`, verdict `eval_pass`, no hard invariant failures, delta `+2.0` overall and `+2.0` on `reflection_quality`, `openness`, and `faithfulness_to_fact`.
- Bad-response invariant test: `python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --max-iterations 1 --no-improve --mock-judge --mock-response 'You should try a new strategy and ask Eve what she needs next.'` — exit 0; latest score verdict `eval_fail`; deterministic failures on `no_stage_jump_content` and `no_advice_or_solutioning`.
- Cost guard refusal path: `python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --max-iterations 1 --mock-response 'Local response.' --max-judge-cost-cents 0` — exit 2 with clear guard message; wrote `judge-cost-guard.json` under `eval/runs/moment-stage-1-fact-reflection-20260506-062339-iter-01/`.
- `python3 scripts/test_mwf_moment_eval.py` — exit 0; ran 15 tests; OK. New tests cover real-mode flag plumbing at the helper boundary, cost-guard refusal before judge, deterministic hard invariants, Stage 1 prompt-version routing, and branch protection logic.
- `npm run check --workspace backend` — exit 0.
- `python3 scripts/mwf_gold_loop.py browser-smoke` — exit 0 after confirming services reachable; preflight reported `services: ok`; final actor JSON reported `{"browser_control":"ok","url":"http://localhost:8082/","visible_state":"Meet Without Fear page loaded. Visible interactive elements include Open session drawer, Open settings, Start new session, Inner Work, and a textbox labeled What's on your mind?","error":null}`.
- Protected-branch manual command: `git switch main && git branch --show-current && python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --target-score 4.0 --max-iterations 1 --improvement-mode patch; rc=$?; git switch codex/mwf-gold-self-improve-stage1; exit $rc` — exit 2; printed `main` then `mwf_moment_eval: Refusing patch mode on protected branch 'main'. Create a codex/* branch or pass --allow-protected-branch-patch.` Current branch was restored to `codex/mwf-gold-self-improve-stage1`.
- Final revalidation: `python3 scripts/test_mwf_moment_eval.py` — exit 0; ran 15 tests in 0.110s; OK.
- Final revalidation: `npm run check --workspace backend` — exit 0.
- Final `git status --short --branch` — current branch `codex/mwf-gold-self-improve-stage1`; not clean. There are substantial pre-existing dirty tracked files and untracked gold-loop artifacts outside the scoped moment-evaluator real-mode changes. This blocks the exact "clean except intentional run/prompt artifacts" declaration without either committing unrelated work or discarding user/other-agent changes.

## Criteria

- [x] 1. Entry point exists and `python3 scripts/mwf_moment_eval.py --help` runs.
- [x] 2. Moment yaml exists for `stage-4-no-shared-agreement-closure` and includes the required Phase 1 sections.
- [x] 3. Seeder command prints a clean Stage 4 no-overlap state summary.
- [x] 4. Runner creates one iteration directory with seed, response, delta, score, rationale, and run metadata artifacts.
- [x] 5. Scorer produces structured `score.json` with dimensions, hard invariants, verdict, and improvement targets when failing.
- [x] 6. Patch-mode improver writes `improvement-plan.md`, `patch-summary.md`, records a prompt version under `eval/prompt-versions/mwf/stage-4/`, and reruns with a fresh seed.
- [x] 7. Hard invariant for no invented shared agreement is defined and enforced by `--mock-response`.
- [x] 8. Reuses existing infrastructure where applicable: `scripts/mwf_moment_eval.py` imports `scripts/mwf_gold_loop.py` helpers for command execution, git SHA, and branch handling; prompt versions live under `eval/prompt-versions/`; patch mode refuses protected branches unless allowed.
- [x] 9. Tests pass.
- [x] 10. Documentation updated with Phase 1 status and validation results.

## Files Touched

- `scripts/mwf_moment_eval.py`
- `scripts/test_mwf_moment_eval.py`
- `eval/moments/stage-4-no-shared-agreement-closure.yaml`
- `docs/product/mwf-moment-evaluator-build-progress.md`
- `docs/product/mwf-moment-evaluator-plan.md`

## Decisions

- Phase 1 uses JSON-compatible YAML for the moment file so the evaluator can parse it with the Python standard library and avoid adding dependencies.
- The runner uses deterministic mocked backend/judge behavior by default for repeatable local validation. The hard invariant is evaluated by deterministic code, not by judge scoring.
- The required Stage 4 selection concept is represented as `Stage4ProposalSelection` in evaluator artifacts, mapped onto the repo's current `StrategyProposal` and `StrategyRanking` model shape.

## Questions For Shantam

- None.

## Validation Runs

- `python3 scripts/test_mwf_moment_eval.py` — exit 0; ran 7 tests in 0.080s; OK. Python emitted datetime deprecation warnings only.
- `python3 scripts/mwf_gold_loop.py browser-smoke` — first attempt exited 1 because `http://localhost:3000/health` was not running. After starting `npm run dev:api` with `E2E_AUTH_BYPASS=true MOCK_LLM=true` and `npm run dev:mobile:e2e`, retry exited 0; preflight `services: ok`; actor final JSON reported `browser_control: ok`, `url: http://localhost:8082/`, `error: null`.
- `/usr/bin/time -p python3 scripts/mwf_moment_eval.py run --moment stage-4-no-shared-agreement-closure --max-iterations 1 --no-improve --mock-judge` — exit 0; created `eval/runs/moment-stage-4-no-shared-agreement-closure-20260506-055939-iter-01/`; observed `real 0.10`, `user 0.05`, `sys 0.02`.
- Real judge wall-clock: not available in this worktree because `scripts/mwf_moment_eval.py` currently defaults to deterministic mock judging and explicitly treats real judge wiring as out of scope for Phase 1. Recorded in the plan's Phase 1 status as a Phase 1.5 / Phase 2 limitation.
