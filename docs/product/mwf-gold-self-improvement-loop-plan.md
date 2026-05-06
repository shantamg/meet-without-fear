# MWF Gold Self-Improvement Loop Plan

Last updated: 2026-05-05
Branch: `codex/mwf-gold-self-improve-stage1`

## Purpose

Build an automated evaluation loop where Codex can run Meet Without Fear gold-session scenarios as both participants, score the app against golden references, propose or patch prompt/product fixes, and rerun until a target score is reached.

The first working slice is Adam/Eve through Stage 1, with the app driven through the real local E2E web app by Codex CLI actor sessions using `agent-browser`.

## What Exists Now

### Orchestrator

Main entrypoint:

```bash
python3 scripts/mwf_gold_loop.py
```

Implemented subcommands:

- `run`: runs the actor/scorer/improver loop.
- `browser-smoke`: verifies a spawned Codex CLI session can use `agent-browser`.
- `stage1-smoke`: seeds Adam directly at Stage 1 and runs one Adam actor turn.
- `parse-status`: parses an actor final status block.
- `cleanup-browsers`: closes stale `mwf-gold-*` `agent-browser` sessions.
- `improve-run`: runs the improver against an existing run directory.

Important run options:

```bash
--scenario adam-eve
--stop-after-stage 1
--target-score 4.0
--max-iterations 3
--improvement-mode proposal|patch
--mock-actor
--mock-scorer
--skip-transcripts
--no-browser-cleanup
```

Patch mode is branch-protected. It refuses protected branches such as `main` unless `--allow-protected-branch-patch` is passed.

### Skills

Versioned repo copies live under `eval/skills/`.

Manual group:

- `eval/skills/manual/mwf-gold-session-tester/SKILL.md`

Self-improvement group:

- `eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md`
- `eval/skills/self-improvement/mwf-gold-session-scorer/SKILL.md`
- `eval/skills/self-improvement/mwf-gold-prompt-improver/SKILL.md`

Runtime copies live in `~/.codex/skills/`. Sync them with:

```bash
scripts/sync_mwf_gold_skills.sh
```

The manual tester skill is still preserved for hands-on Codex Desktop Browser Use runs. The self-improvement loop uses `mwf-gold-loop-actor` and `agent-browser`.

### Artifacts

Run artifacts are ignored by git under:

```text
eval/runs/<timestamp>-<scenario>-iter-<n>/
```

Typical files:

- `run.json`: scenario, iteration, session id, URLs, Codex session ids, status history, score, browser cleanup result.
- `codex-adam.jsonl`, `codex-eve.jsonl`: raw Codex event streams.
- `adam.last.md`, `eve.last.md`: final actor status messages.
- `scratch/`: copied scratch logs from `docs/product/gold-session-scratch/`.
- `score.json`: scorer output.
- `improvement-plan.md`: improver diagnosis and next iteration plan.
- `patch-summary.md`: patch-mode file changes, tests, and expected score movement.

Versioned prompt proposals are tracked under:

```text
eval/prompt-versions/mwf/adam-eve/
eval/prompt-versions/tester/adam-eve/
```

Current MWF proposals:

- `v01.md`: canonical `FeelHeardCheck` control-tag leakage.
- `v02.md`: Stage 1 felt-heard CTA/input handoff defect.
- `v03.md`: snake_case `<feel_heard>Y</feel_heard>` leakage.

### Browser Cleanup

The orchestrator uses named `agent-browser` sessions:

```text
mwf-gold-<side>-<session-id>
mwf-gold-smoke
```

Actor runs close those sessions in a `finally` block unless `--no-browser-cleanup` is used.

Manual cleanup:

```bash
python3 scripts/mwf_gold_loop.py cleanup-browsers --json
```

E2E web startup was changed to avoid opening the user's normal Chrome by setting `BROWSER=none` in:

- `mobile/package.json`
- `e2e/playwright.config.ts`
- `e2e/playwright.live-ai.config.ts`

### Product Fixes Already Made By The Loop

The loop identified and patched these Stage 1 issues:

1. Visible internal control tag:
   - `<FeelHeardCheck>Y</FeelHeardCheck>`
   - Patched in `backend/src/utils/visible-text.ts` and `backend/src/utils/micro-tag-parser.ts`.

2. Feel-heard CTA hiding input while the latest AI message still asked a substantive question:
   - Patched in `mobile/src/utils/chatUIState.ts`.
   - Prompt tightened in `backend/src/services/stage-prompts.ts`.

3. Snake-case visible internal marker:
   - `<feel_heard>Y</feel_heard>`
   - Patched by extending visible-text cleanup and micro-tag parsing to aliases.

Focused tests were added or updated in:

- `backend/src/utils/__tests__/visible-text.test.ts`
- `backend/src/utils/__tests__/micro-tag-parser.test.ts`
- `mobile/src/utils/__tests__/chatUIState.test.ts`

## Tests And Runs Completed

### Tooling Tests

Passed:

```bash
python3 -m py_compile scripts/mwf_gold_loop.py scripts/test_mwf_gold_loop.py
python3 -m unittest scripts/test_mwf_gold_loop.py
```

Backend focused tests passed:

```bash
npm --workspace backend test -- --watchman=false --runTestsByPath src/utils/__tests__/visible-text.test.ts src/utils/__tests__/micro-tag-parser.test.ts
```

Mobile focused tests passed:

```bash
npm --workspace mobile test -- chatUIState.test.ts --runInBand --no-watchman
```

Watchman-backed Jest invocations can fail locally because Watchman cannot write to `/Users/shantam/.local/state/watchman/shantam-state`; use `--no-watchman` or `--watchman=false`.

### Loop Runs

Useful run directories:

- `eval/runs/20260505-155605-adam-eve-stage1-smoke-iter-01`
  - One-sided Adam Stage 1 smoke.
  - Found visible `<FeelHeardCheck>Y</FeelHeardCheck>`.
  - Score: `3`, `eval_fail`.

- `eval/runs/20260505-161010-adam-eve-stage1-smoke-iter-01`
  - One-sided Adam Stage 1 smoke after canonical tag fix.
  - Score: `4`, `eval_pass`.

- `eval/runs/20260505-162548-adam-eve-iter-01`
  - Full Adam/Eve Stage 1 run.
  - Score: `3.5`, `eval_fail`.
  - Found felt-heard CTA/input handoff defect.
  - Patch-mode improver wrote `v02.md` and patched prompt/UI behavior.

- `eval/runs/20260505-164520-adam-eve-iter-01`
  - Full Adam/Eve Stage 1 rerun after `v02` patch.
  - Score: `3.5`, `eval_fail`.
  - Found `<feel_heard>Y</feel_heard>` leakage.
  - Patch-mode improver wrote `v03.md` and patched snake_case control-marker handling.

- `eval/runs/20260505-170842-adam-eve-iter-01`
  - Full Adam/Eve Stage 1 rerun after `v03` patch.
  - Score: `4`, `eval_pass`.
  - Both `actor_fidelity` and `mwf_handling` scored `4`.
  - No hard invariants failed and no visible internal control tags appeared.
  - Scorer required human review because `transcripts/*.md` artifacts were still missing; it scored from `run.json`, status files, scratch logs, and Codex JSONL browser snapshots.

Adam/Eve Stage 1 is now passing for the current full two-side loop slice.

## Current Score Scale

Scores are on a 1-5 rubric, not out of 100.

- `1`: broken, unsafe, or unusable.
- `2`: significant failure.
- `3`: mixed or partially working.
- `4`: passing/good for the scoped run.
- `5`: excellent, close to the gold standard.

`target-score 4.0` means the loop stops when the scoped scenario passes. Hard invariant failures, such as visible internal control tags, should fail a run even when the average score is close.

## How To Continue From Here

Start backend and E2E web app if needed:

```bash
npm run dev:api
npm run dev:mobile:e2e
```

`dev:mobile:e2e` now uses `BROWSER=none`, so it should not open Chrome.

The `v03` validation run has passed. The next useful expansion is Adam/Eve Stage 1-2:

```bash
python3 scripts/mwf_gold_loop.py run \
  --scenario adam-eve \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 2 \
  --max-actor-turns 8 \
  --improvement-mode patch
```

If score is still below `4.0`, run the improver against that run:

```bash
python3 scripts/mwf_gold_loop.py improve-run \
  <run-dir> \
  --scenario adam-eve \
  --improvement-mode patch
```

## What Is Left To Build

### Orchestrator Reliability

- Add a first-class `loop-summary.md` at the end of each `run`.
  - Include iteration scores, improvements, regressions, patches applied, tests run, and final recommendation.
  - Done for per-iteration run directories: each iteration now writes `loop-summary.md` with score, actor status, artifacts, improver status, and next action.
- Make `run` optionally call the improver even on the final iteration when score is below threshold.
  - Done: final failed iterations now run the improver by default.
  - Use `--no-improve-on-final-fail` to keep the old behavior.
  - `--always-improve` still forces the improver even when the target score is reached.
- Add a `--seed-stage1` or `--start-stage` option to `run`.
  - Current full `run` starts from normal session creation, so Stage 1 tests are slower than `stage1-smoke`.
- Add server management helpers.
  - Preflight currently fails if `8082` is down.
  - A future `--start-services` could launch backend/web with tracked logs and clean shutdown.
- Add per-command timeout around child `agent-browser` calls inside actor instructions where possible.
  - The parent actor timeout exists, but individual browser waits can still make runs feel slow.
- Normalize previous-run comparison.
  - Current scorer often marks runs `incomparable` because prior run metadata is not explicitly passed.
  - The orchestrator should pass prior run path/score/prompt versions.

### Scoring And Summaries

- Extract transcripts reliably instead of relying mostly on Codex JSONL and scratch logs.
- Add deterministic checks before LLM scoring:
  - no visible internal tags,
  - input visibility when CTA is present,
  - stage advancement gates,
  - no partner-private content leakage.
- Split score dimensions by stage when running Stage 1-2 or later:
  - `stage1_witnessing`,
  - `stage2_perspective`,
  - `state_and_consent`,
  - `actor_fidelity`,
  - `prompt_contract`.
- Add a machine-readable `score_delta.json` or summary block to compare iteration `n` to `n-1`.

### Prompt And Patch Versioning

- Split score failures by improvement owner.
  - Done: scorer instructions now require `owner`, `recommended_action`, and top-level `improvement_targets`.
  - Current owners: `actor_skill`, `mwf_prompts`, `product_code`, `eval_harness`.
  - Current actions: `patch_skill`, `patch_prompt`, `patch_product`, `patch_eval`, `human_review`, `none`.
  - The orchestrator normalizes older score output into this routing shape before the improver runs.
  - `loop-summary.md` now surfaces improvement targets so a failed run says whether to improve the actor skill, MWF prompts, product code, or eval harness.
- Add per-side, per-stage gold-alignment scoring.
  - Done: scorer instructions now require `gold_alignment.actor_fidelity` and `gold_alignment.mwf_guidance`.
  - Actor fidelity checks include persona alignment, resistance preserved, too compliant, too articulate, copied gold lines, and forced gold path.
  - MWF guidance checks include guidance alignment, witnessing depth, resistance handling, earned transition, premature repair, and privacy/consent issues.
  - The orchestrator preserves this section when present and adds an `eval_harness` target when it is missing.
- Record exact prompt version files used in `run.json`.
- Add versioned tester prompt proposals under `eval/prompt-versions/tester/adam-eve/` when actor fidelity regresses.
- Decide how versioned MWF prompt proposals become production patches:
  - direct patch-mode edits,
  - explicit human review step,
  - or a generated PR plan.
- Add a rollback/regression strategy:
  - when score decreases, improver should compare against prior prompt/code diffs and identify likely regression cause.

### Git And Branch Flow

- Keep patch loops on a dedicated `codex/*` branch.
- Add optional `--create-branch <name>` to the orchestrator.
- Add optional `--commit-each-iteration` only after the patch loop is reliable.
  - Commits should include run id, score delta, and summary.
- Decide whether ignored run artifacts should ever be force-added for review bundles.

### Browser And Environment

- Keep `BROWSER=none` in all E2E web start commands.
- Keep `cleanup-browsers` before and after full loops.
- Consider a workspace-local `agent-browser` profile root for easier cleanup.
- Later, evaluate running the loop in a separate git worktree.
  - For now branch-in-place is simpler because dev servers, DB, ports, and browser sessions are shared.

### Scenario Expansion

- Complete Adam/Eve Stage 1 to passing full two-side score after `v03`.
  - Done: `eval/runs/20260505-170842-adam-eve-iter-01` scored `4`, `eval_pass`.
- Expand to Adam/Eve Stage 1-2.
- Add a direct seed for Stage 2 once Stage 1 is stable.
- Revisit James/Catherine after fixture mismatch is fixed.
- Add no-repair/no-agreement benchmarks for later stages.

## Known Caveats

- `eval/runs/` is ignored, so run summaries and score files are local artifacts unless force-added.
- Scratch logs under `docs/product/gold-session-scratch/` are currently untracked by default and may accumulate.
- Some mobile files had pre-existing unrelated modifications before this loop work; do not blindly attribute all dirty worktree changes to the self-improvement loop.
- The latest full Stage 1 run after `v03` passed, but human review is still marked required because transcript extraction is missing.
- The current expected next risk is Stage 2 quality and state gating, not Stage 1 control-tag leakage.
