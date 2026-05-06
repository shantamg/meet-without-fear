# MWF Gold Autonomous Loop Remaining Plan

Last updated: 2026-05-05

## Goal

Get the gold loop to a point where it can run unattended, evaluate conversation quality against the gold transcripts, route failures to the right owner, patch or propose improvements, verify them, and rerun until it reaches the target score or hits a clear stop condition.

The loop must improve two separate surfaces:

- **Actor quality**: the Codex actor skill should play Adam/Eve/James/Catherine with gold-aligned persona fidelity, resistance, defensiveness, boundaries, and pace of insight.
- **MWF guidance quality**: Meet Without Fear internal prompts/product behavior should facilitate with gold-aligned witnessing depth, resistance handling, consent boundaries, stage pacing, and earned transitions.

## Current Baseline

Already working:

- Actor/scorer/improver orchestration through `scripts/mwf_gold_loop.py`.
- Patch/proposal modes with protected-branch guard.
- Runtime skill sync via `scripts/sync_mwf_gold_skills.sh`.
- Per-iteration `loop-summary.md`.
- Final failed iteration now runs the improver by default.
- Score routing fields:
  - `owner`
  - `recommended_action`
  - `improvement_targets`
- Owner categories:
  - `actor_skill`
  - `mwf_prompts`
  - `product_code`
  - `eval_harness`
- Gold-alignment scoring contract:
  - `gold_alignment.actor_fidelity`
  - `gold_alignment.mwf_guidance`
- Adam/Eve full two-side Stage 1 passed after `v03`:
  - `eval/runs/20260505-170842-adam-eve-iter-01`
  - score `4`
  - verdict `eval_pass`
- Adam/Eve live two-iteration Stage 2 regression loop after the Stage 2 prompt patch ran on 2026-05-05:
  - services: `eval/runs/20260505-193716-adam-eve-services`
  - iteration 1: `eval/runs/20260505-193719-adam-eve-iter-01`
  - iteration 2: `eval/runs/20260505-200823-adam-eve-iter-02`
  - loop summary: `eval/runs/20260505-193719-adam-eve-loop-summary.md`
  - command used `--stop-after-stage 2`, `--target-score 4.0`, `--max-iterations 2`, `--max-actor-turns 8`, `--improvement-mode patch`, and `--start-services`
  - result: both iterations produced real Adam/Eve Stage 0-2 transcripts, invariants, score validation, `score.json`, improvement plans, patch summaries, verification artifacts, and a top-level summary.
  - scores: iteration 1 `3.0` / `eval_fail`; iteration 2 `3.0` / `eval_fail`; iteration 2 movement `neutral` with previous-run comparison populated.
  - score routing: primary owner remained `product_code` / `patch_product` for the Stage 2 exchange/context-share state machine; secondary `mwf_prompts` review for optional context-share timing and copy polish.
  - hard felt-heard invariant passed after the Stage 2 prompt patch; the previous early `felt heard` regression did not recur.
  - harness follow-up completed: actor scheduling and stage-limit invariant handling now treat a side at the requested stop stage with no legitimate action as satisfying the stop boundary, so the next loop process should stop and score instead of repeatedly resuming that actor. The two-iteration process itself started before that patch was loaded, so iteration 2 still showed the old hard-invariant wording.
  - prompt/proposal follow-up completed: patch mode created MWF prompt proposals `eval/prompt-versions/mwf/adam-eve/v05.md` and `eval/prompt-versions/mwf/adam-eve/v06.md`.
  - focused verification passed in patch verification:
    - `python3 -m unittest scripts/test_mwf_gold_loop.py`
    - `npm --workspace backend test -- stage2-copy.test.ts --runInBand`
    - `python3 -m py_compile scripts/mwf_gold_loop.py scripts/test_mwf_gold_loop.py`
  - cleanup note: `eval/runs/20260505-193716-adam-eve-services/cleanup.json` shows the loop-started web service stopped cleanly; the preexisting backend was left running.
- Fresh post-scheduler/product-guard verification ran on 2026-05-05:
  - services: `eval/runs/20260505-214102-adam-eve-services`
  - iteration: `eval/runs/20260505-214104-adam-eve-iter-01`
  - loop summary: `eval/runs/20260505-214104-adam-eve-loop-summary.md`
  - command used `--stop-after-stage 2`, `--target-score 4.0`, `--max-iterations 1`, `--max-actor-turns 8`, `--improvement-mode patch`, `--start-services`, and `--no-improve-on-final-fail`.
  - `run.json.start.mode` was `fresh`; `run.json.code_sha` was `4a2395e612d2d33a1f5b0b9ce316ca56e3bd4c35`.
  - stale Eve repeated resumes did not recur. The scheduler ran Adam once, then Eve once, then scored.
  - score stayed `3.0` / `eval_fail`, but the routed primary failure changed from unresolved Stage 2 share-offer wait to a concrete `product_code` Stage 2 blank empathy draft bug on Eve.
  - evidence:
    - `eval/runs/20260505-214104-adam-eve-iter-01/eve-stage2-draft-missing.png`
    - `eval/runs/20260505-214104-adam-eve-iter-01/eve-stage2-draft-still-missing.png`
    - `eval/runs/20260505-214104-adam-eve-iter-01/transcripts/eve-stage2.md`
    - `eval/runs/20260505-214104-adam-eve-iter-01/scratch/2026-05-05-cmotkkqf50008px2ijr9v48vc-eve.md`
  - `stage_limit_reached_correctly` failed only because Eve ended `bug_blocked` at Stage 2 on the blank draft, not because a side was in a no-action stop-stage wait.
  - service cleanup remained normal: `eval/runs/20260505-214102-adam-eve-services/cleanup.json` shows loop-started web stopped with `returncode: 0`; preexisting backend was not stopped.
  - focused product guard patch added on 2026-05-05:
    - `backend/src/utils/session.ts` now treats an active current-user `ReconcilerShareOffer` in `OFFERED` or `PENDING` as Stage 2 `selfActionNeeded`.
    - chat-router session queries and invitation list summaries now include active reconciler share-offer state.
    - `backend/src/utils/__tests__/session.test.ts` covers offered versus processed share suggestions.
  - Stage 2 blank-draft persistence patch added on 2026-05-05:
    - `backend/src/controllers/messages.ts` and `backend/src/services/chat-router/session-processor.ts` now persist any non-empty hidden Stage 2 `<draft>` as an empathy draft, even if `ReadyShare:Y` is missing.
    - This prevents a stripped hidden draft from leaving user-visible copy that says "Here's what I drafted" with an empty body.
    - `backend/src/services/__tests__/semantic-router-integration.test.ts` covers a Stage 2 draft emitted without a `ReadyShare` flag.
  - focused verification passed:
    - `npm --workspace backend test -- semantic-router-integration.test.ts --runInBand`
    - `npm --workspace backend test -- session.test.ts --runInBand`
    - `npm --workspace backend test -- stage2-copy.test.ts --runInBand`
    - `python3 -m unittest scripts/test_mwf_gold_loop.py`
    - `python3 -m py_compile scripts/mwf_gold_loop.py scripts/test_mwf_gold_loop.py`
    - `npm --workspace backend run check`
  - attempted `npm --workspace backend run typecheck`, but the backend package has no `typecheck` script; `check` is the valid TypeScript command.
- Blank-draft live verification rerun attempted on 2026-05-05:
  - services: `eval/runs/20260505-215923-adam-eve-services`
  - iteration: `eval/runs/20260505-215926-adam-eve-iter-01`
  - loop summary: `eval/runs/20260505-215926-adam-eve-loop-summary.md`
  - command used `--stop-after-stage 2`, `--target-score 4.0`, `--max-iterations 1`, `--max-actor-turns 8`, `--improvement-mode patch`, `--start-services`, and `--no-improve-on-final-fail`.
  - result: score `2.0` / `eval_fail`, routed mainly to `eval_harness` because the run became unscoreable before Eve launched.
  - objective blocker: the loop-started E2E web process on `localhost:8082` died during Adam Stage 2. Adam ended `bug_blocked`; Eve had no final status; transcript extraction wrote `transcript-extract-error.txt` with `Session cmotl8cf40008pxix894u0yyw not found`.
  - evidence:
    - `eval/runs/20260505-215926-adam-eve-iter-01/scratch/2026-05-05-cmotl8cf40008pxix894u0yyw-adam.md`
    - `eval/runs/20260505-215926-adam-eve-iter-01/adam.last.md`
    - `eval/runs/20260505-215926-adam-eve-iter-01/transcript-extract-error.txt`
    - `eval/runs/20260505-215923-adam-eve-services/web.log`
    - `eval/runs/20260505-215923-adam-eve-services/cleanup.json`
  - `stage_limit_reached_correctly` failed because Adam ended `bug_blocked` and Eve was missing, not because of no-action stop-stage wait.
  - `transcript_side_stage_complete` failed for all expected side/stage transcripts because extraction could not find the session.
  - cleanup still wrote `cleanup.json`; web was marked stopped with `returncode: -9`, backend was preexisting and not stopped.
  - The Stage 2 blank-draft patch was not live-verified by this rerun because the run never reached Eve's Stage 2 draft review.

## Remaining Work

### 1. Reliable Transcript Extraction

Status: first slice implemented on 2026-05-05.

Done:

- Orchestrator now normalizes extractor output into stable scorer-facing files:
  - `<run-dir>/transcripts/adam-stage0.md`
  - `<run-dir>/transcripts/adam-stage1.md`
  - `<run-dir>/transcripts/eve-stage0.md`
  - `<run-dir>/transcripts/eve-stage1.md`
- Mock loop runs now create those same transcript artifacts so tests and summaries exercise the contract.
- Unit coverage exists in `scripts/test_mwf_gold_loop.py` for splitting broad extractor markdown into side/stage files and for mock transcript creation.

Still needs live verification:

- Live verified on 2026-05-05 with `eval/runs/20260505-184527-adam-eve-iter-01`.
- The local DB extractor produced non-empty normalized files for real Adam/Eve data:
  - `transcripts/adam-stage0.md`
  - `transcripts/adam-stage1.md`
  - `transcripts/adam-stage2.md`
  - `transcripts/eve-stage0.md`
  - `transcripts/eve-stage1.md`
  - `transcripts/eve-stage2.md`
- Scorer accepted the run schema using those artifacts and did not route the run to `eval_harness` for missing transcript evidence.

Build clean run transcripts that the scorer can trust without scraping large Codex JSONL files.

Required artifacts:

```text
<run-dir>/transcripts/adam-stage0.md
<run-dir>/transcripts/adam-stage1.md
<run-dir>/transcripts/eve-stage0.md
<run-dir>/transcripts/eve-stage1.md
```

Each transcript should include:

- side,
- stage,
- speaker,
- message text,
- timestamp or ordering index,
- visible CTA/state changes when relevant,
- whether content was private or shared.

Acceptance criteria:

- A full Adam/Eve Stage 1 run produces non-empty transcripts for both sides.
- Scorer can use `transcripts/*.md` as primary evidence.
- `human_review.notes` no longer says scoring relied mainly on Codex JSONL.

### 2. Scorer Schema Validation And Retry

Status: first slice implemented on 2026-05-05.

Done:

- Orchestrator validates `score.json` before accepting it.
- Validation covers required top-level fields, required dimensions, required `gold_alignment` sections, `improvement_targets`, and owner/action routing for weak dimensions.
- Live scorer runs get one repair retry prompt when validation fails.
- If validation still fails, the loop writes a replacement `eval_needs_review` score with an `eval_harness` improvement target.
- Every scorer attempt writes `<run-dir>/score-validation.json`.
- Mock tests cover missing `gold_alignment`, missing owners/actions, and malformed score JSON fallback.

Still needs live verification:

- Live schema acceptance verified on 2026-05-05 with `eval/runs/20260505-184527-adam-eve-iter-01`.
- `score-validation.json` recorded a valid initial scorer output with no repair retry needed.
- Still needs an intentionally malformed live scorer/repair case to inspect `codex-score-repair.jsonl`.

Make the orchestrator validate `score.json` before accepting it.

Required schema fields:

- `overall_score`
- `verdict`
- `dimensions.actor_fidelity`
- `dimensions.mwf_handling`
- `gold_alignment.actor_fidelity`
- `gold_alignment.mwf_guidance`
- `improvement_targets`
- owner/action routing for failed or weak dimensions.

Behavior:

- If scorer output is missing required fields, run one repair/retry prompt.
- If retry still fails, mark the run `eval_needs_review` and add an `eval_harness` target.

Acceptance criteria:

- Mock tests cover missing `gold_alignment`, missing owners, and malformed scores.
- Real scorer output either passes schema validation or produces a clear repair artifact.

### 3. Deterministic Invariant Checks

Status: first slice implemented on 2026-05-05.

Done:

- Orchestrator writes `<run-dir>/invariants.json` before scoring.
- Initial hard checks cover:
  - visible internal control tag leakage in stable transcripts,
  - expected side/stage transcript files and metadata,
  - CTA/input state metadata presence,
  - explicit partner-private leak markers,
  - final stage-limit status for each scenario side,
  - actor status side matching the assigned side,
  - felt-heard marker not appearing before any substantive transcript context.
- Hard invariant failures force final `score.json` to `verdict: eval_fail`, cap the score below target, populate `hard_invariants`, and add owner-routed improvement targets.
- Mock loop verification writes a passing `invariants.json`.
- Unit coverage exists for clean invariants, visible tag leakage, wrong-side actor status, and score override behavior.

Still needs live verification:

- Live checked on 2026-05-05 with `eval/runs/20260505-184527-adam-eve-iter-01`.
- DB-derived transcripts passed transcript completeness, CTA metadata, visible control tag, privacy marker, stage-limit, and actor-side checks.
- The hard felt-heard gate invariant failed for both Stage 2 sides because the Stage 2 transition copy included `until you felt heard` before Stage 2 witnessing. The patch-mode improver removed that phrase from fallback transition copy and added a focused regression test.
- Replace the explicit-marker privacy check with structured DB/transcript metadata once the extractor exposes enough data to compare private/shared content deterministically.

Add pre-scorer checks for failures that should not depend on LLM judgment.

Output:

```text
<run-dir>/invariants.json
```

Initial invariants:

- no visible internal control tags,
- no partner-private content leakage,
- stage limit reached correctly,
- felt-heard gate appears only after substantive witnessing,
- CTA/input visibility state is sane,
- no actor operated the wrong side.

Behavior:

- Hard invariant failures force `verdict: eval_fail`.
- Scorer still explains the qualitative impact, but cannot override hard failures.

Acceptance criteria:

- Existing tag leakage cases would fail deterministically.
- Passing Stage 1 run has no hard invariant failures.

### 4. Patch Verification Contract

Status: first slice implemented on 2026-05-05.

Done:

- Patch-mode improver prompt now requires `<run-dir>/patch-summary.md` with:
  - files changed,
  - owner addressed,
  - score dimension addressed,
  - tests to run,
  - expected next-run score movement,
  - rollback/regression risk.
- Orchestrator verifies patch mode after the improver runs.
- Verification extracts test commands from `patch-summary.md`, runs each command, stores per-command logs, and writes `<run-dir>/verification.json`.
- Missing `patch-summary.md`, missing required sections, missing test commands, failed commands, and timeouts mark verification as failed.
- Failed verification sets `run.json.verification_failed: true` and stops later loop iterations.
- Mock patch-mode runs now create a patch summary and record verification status.
- Unit coverage exists for command extraction, missing summary failure, passing verification, and failing command recording.

Still needs live verification:

- Live verified on 2026-05-05 with `eval/runs/20260505-184527-adam-eve-iter-01`.
- Patch-mode improver wrote `patch-summary.md`, `improvement-plan.md`, and `verification.json`.
- Initial verification failed because `patch-summary.md` listed an invalid loop command; after replacing it with `python3 -m unittest scripts/test_mwf_gold_loop.py`, verification passed.

Make patch mode safer before rerunning.

Improver must write:

```text
<run-dir>/patch-summary.md
```

With:

- files changed,
- owner addressed,
- score dimension addressed,
- tests to run,
- expected next-run score movement,
- rollback/regression risk.

Orchestrator should:

- parse or detect listed test commands,
- run focused tests after patch mode,
- write `verification.json`,
- skip rerun if verification fails.

Acceptance criteria:

- Patch-mode mock or fixture run records verification status.
- Failed verification stops the loop with a clear next action.

### 5. Run-Level Summary Across Iterations

Status: first slice implemented on 2026-05-05.

Done:

- After the loop stops, the orchestrator writes `eval/runs/<timestamp>-<scenario>-loop-summary.md`.
- Summary includes:
  - iteration run dirs,
  - scores and verdicts,
  - score deltas,
  - improvement targets grouped by owner,
  - improvement plans, patch summaries, verification artifacts, and recent prompt proposals,
  - tests recorded by patch verification,
  - final recommendation,
  - whether the target was reached.
- Multi-iteration mock CLI run verified the top-level summary is written.
- Unit coverage exists for a two-iteration fixture with targets, patch artifacts, verification commands, and next-action text.

Still needs live verification:

- Live single-iteration summary verified on 2026-05-05 at `eval/runs/20260505-184527-adam-eve-loop-summary.md`.
- The summary identified score, verdict, owner-routed targets, prompt proposal `v04`, tests run, service metadata, and final recommendation.
- Real two-iteration summary verified on 2026-05-05 at `eval/runs/20260505-193719-adam-eve-loop-summary.md`.
- The summary included both iteration directories, scores, neutral score movement, prompt/skill version change counts, owner-routed targets, patch/proposal artifacts, verification commands, and final recommendation.
- Fresh one-iteration summary verified on 2026-05-05 at `eval/runs/20260505-214104-adam-eve-loop-summary.md` after the scheduler/stop-boundary patch:
  - run started fresh from code SHA `4a2395e612d2d33a1f5b0b9ce316ca56e3bd4c35`;
  - stale Eve repeated resumes did not recur;
  - the summary records score `3.0`, `eval_fail`, service metadata, and owner-routed targets;
  - final recommendation correctly says no improver ran and the latest improvement targets should be inspected.
- Service-failure summary verified on 2026-05-05 at `eval/runs/20260505-215926-adam-eve-loop-summary.md`:
  - records score `2.0`, `eval_fail`, fresh start mode, service metadata, owner-routed targets, and no patch verification commands;
  - correctly makes `eval_harness` the dominant next owner because missing transcripts and a missing Eve final status made the run unscoreable.

Add a top-level loop summary after all iterations.

Output:

```text
eval/runs/<timestamp>-<scenario>-loop-summary.md
```

Include:

- iteration run dirs,
- scores and verdicts,
- score deltas,
- improvement targets by owner,
- patches/proposals generated,
- tests run,
- final recommendation,
- whether the target was reached.

Acceptance criteria:

- Multi-iteration mock run writes a top-level summary.
- Summary makes the next action obvious without opening individual run directories.

### 6. Regression Memory

Status: first slice implemented on 2026-05-05.

Done:

- Each iteration now records `previous_run_dir`, `regression_context`, and `score_movement` in `run.json`.
- `regression_context` includes:
  - previous run dir,
  - previous score and verdict,
  - previous `gold_alignment`,
  - previous `improvement_targets`,
  - prior prompt/skill version fields when available,
  - prior invariants and verification status,
  - previous patch summary and improvement plan excerpts when present.
- Scorer prompts now receive regression context and are instructed to compare against previous score, alignment, targets, and patch/proposal artifacts.
- Improver prompts now receive regression context and are instructed to identify likely regression causes before proposing or patching new changes.
- Score movement is classified as `improvement`, `neutral`, `regression`, or `incomparable`.
- Top-level loop summaries now show each iteration's `score_movement.classification` alongside the numeric score delta.
- Multi-iteration mock CLI run verified iteration 2 receives previous-run context and score movement.
- Unit coverage exists for context extraction and movement classification.

Still needs live verification:

- Live first-iteration run on 2026-05-05 recorded `classification: incomparable`, as expected with no linked previous run.
- Live second iteration on 2026-05-05 at `eval/runs/20260505-200823-adam-eve-iter-02` recorded `comparison.previous_run` as `eval/runs/20260505-193719-adam-eve-iter-01` and `classification: neutral`.
- The comparison correctly identified a persistent Stage 2 share-offer/wait-state failure rather than a score regression.
- After item 7, replace placeholder prompt/skill version fields with exact hashes for every run.

Pass prior run context into scorer and improver.

Include:

- previous run dir,
- previous score,
- previous `gold_alignment`,
- previous `improvement_targets`,
- prompt/skill versions used,
- code diff or patch summary when available.

Acceptance criteria:

- Scorer comparison is no longer usually `incomparable`.
- Improver can identify likely regression cause when score drops.

### 7. Prompt And Skill Version Tracking

Status: first slice implemented on 2026-05-05.

Done:

- Each run now records `prompt_skill_versions` in `run.json`.
- Version state includes SHA-256 hashes and byte sizes for:
  - runtime actor skill,
  - runtime scorer skill,
  - runtime improver skill,
  - runtime tester skill,
  - repo-owned actor skill,
  - repo-owned scorer skill,
  - repo-owned improver skill,
  - `backend/src/services/stage-prompts.ts`,
  - scenario prompt proposal files under `eval/prompt-versions/*/<scenario>/v*.md`.
- Regression context now carries these exact version fingerprints into later iterations.
- Mock loop verification confirmed runtime skill hashes, MWF prompt hash, and Adam/Eve prompt proposal hashes are recorded.
- Prompt/skill version diffs are now computed for every run:
  - first iterations record `status: incomparable`;
  - later iterations record `changed`, `unchanged`, or `incomparable`;
  - added, removed, and changed files include before/after SHA-256 values;
  - second-iteration regression context includes the diff for scorer/improver prompts.
- Top-level loop summaries include a `Prompt And Skill Versions` section with per-iteration version-change status and counts.
- Unit coverage exists for file fingerprinting, version-state shape, and version diffing.
- Mock two-iteration verification on 2026-05-05 confirmed iteration 2 records `status: unchanged` in both `run.json.prompt_skill_version_changes` and `run.json.regression_context.prompt_skill_version_changes`.

Still needs live verification:

- Real prompt proposal `eval/prompt-versions/mwf/adam-eve/v04.md` was created on 2026-05-05 by the patch-mode improver.
- The post-patch live attempt `eval/runs/20260505-193719-adam-eve-iter-01` recorded exact prompt/skill hashes including MWF prompt SHA `23e09bc51c31d6b7fdfb8477092b794afbe343186b53331cd3d9c683801ad852` and prompt proposal `v04` SHA `053c8f325b9e4bb27f681672403a711ed2d652b4e88e30d156c9e75e4de7d537`.
- Live prompt/skill version diffs verified on 2026-05-05 in `eval/runs/20260505-200823-adam-eve-iter-02`:
  - `prompt_skill_version_changes.status` was `changed`;
  - `eval/prompt-versions/mwf/adam-eve/v05.md` was recorded as added with SHA `15a1fba2db58f437947d4a4963c8da1e5792c0e710de5c397513105bd066087a`.
- Patch mode also created `eval/prompt-versions/mwf/adam-eve/v06.md` after iteration 2 for the next run.

Record the exact prompt/skill state used by each run.

Add to `run.json`:

- actor skill version or hash,
- scorer skill hash,
- improver skill hash,
- MWF prompt file hash,
- versioned prompt proposal files applied or referenced.

Acceptance criteria:

- A run can be tied to the actor/MWF prompt state that produced it.
- Regression comparison can say which prompt/skill changed.

### 8. Snapshot And Seeded Start Points

Status: first slice implemented on 2026-05-05.

Done:

- Added main-loop CLI hooks:
  - `--seed-target-stage <TargetStage>` to start from the E2E state factory instead of a fresh gold session.
  - `--from-snapshot <id-or-name-or-path>` to restore a backend DB snapshot before actor launch.
  - `--snapshot-session-id <session-id>` to choose which restored session to open; defaults to newest restored session.
- Supported target stages come from `backend/src/testing/state-factory.ts`.
- Main loop rejects single-participant target stages for two-actor runs and currently accepts both-participant stages:
  - `FEEL_HEARD_B`
  - `RECONCILER_SHOWN_B`
  - `CONTEXT_SHARED_B`
  - `EMPATHY_REVEALED`
  - `NEED_MAPPING_COMPLETE`
  - `STRATEGIC_REPAIR_COMPLETE`
- Run metadata now records the start mode in `run.json.start`.
- Top-level loop summaries now include start-point mode, target stage, snapshot id/name, and restored session id when available.
- Snapshot restore writes `snapshot-restore.log` in the run directory and then opens restored participant URLs.
- Unit coverage exists for seeded-stage mapping, single-participant stage rejection, and parser support.

Still needs live verification:

- Seeded target-stage start was smoke-verified on 2026-05-05 with `eval/runs/20260505-192923-adam-eve-iter-01`:
  - command used `--seed-target-stage EMPATHY_REVEALED`, `--max-actor-turns 0`, `--mock-scorer`, `--skip-transcripts`, and `--start-services`;
  - the real E2E seed endpoint created session `cmotfvdf6000apx8nuinrx20l`;
  - `run.json.start` recorded `mode: target_stage` and `target_stage: EMPATHY_REVEALED`;
  - Adam/Eve URLs were generated on `http://localhost:8082` with distinct E2E user IDs/emails;
  - the top-level summary surfaced the target-stage start mode and service metadata.
- Run a real loop from `--seed-target-stage EMPATHY_REVEALED` to refine Stage 3 without replaying Stages 0-2.
- Restore a real snapshot with `--from-snapshot` and confirm the actor URLs resolve to the intended saved state.
- Add richer dashboard snapshot lineage fields to top-level summaries once real snapshot IDs are used routinely.

Acceptance criteria:

- Later-stage refinement can start from a known DB state without replaying earlier stages.
- `run.json` and top-level summaries identify whether the run started fresh, from a seeded target stage, or from a snapshot.
- Snapshot failures stop before actor launch with a clear restore log.

### 9. Service Management

Status: first slice implemented on 2026-05-05.

Done:

- Added `--start-services` to the main `run` command.
- When enabled, the loop:
  - checks whether backend `/health` is already reachable,
  - starts backend only if missing with `E2E_AUTH_BYPASS=true`, `MOCK_LLM=true`, and `E2E_APP_BASE_URL=<app-url>`,
  - checks whether the E2E web app is already reachable,
  - starts E2E web only if missing with `EXPO_PUBLIC_E2E_MODE=true` and `EXPO_PUBLIC_API_URL=<api-url>`,
  - waits for health/reachability before normal preflight,
  - writes service logs and `services.json` under `eval/runs/<timestamp>-<scenario>-services/`,
  - records service metadata in each iteration's `run.json.services`,
  - terminates only processes started by the loop and writes `cleanup.json`.
- Existing user-started services are recorded as `started: false` and are not killed.
- Top-level loop summaries now include service names, whether they were started by the loop, PIDs, and log paths.
- Unit coverage exists for parser support, JSON-safe service records, and no-op cleanup for existing services.

Still needs live verification:

- `--start-services --dry-run` verified on 2026-05-05 at `eval/runs/20260505-184416-adam-eve-services`.
- Backend was already running and recorded as `started: false`; web was started by the loop and `cleanup.json` shows only that loop-started web process was stopped.
- `--start-services --dry-run` re-verified on 2026-05-05 at `eval/runs/20260505-192847-adam-eve-services` after adding startup failure reporting:
  - `services.json` recorded `status: pass`;
  - backend was preexisting and left running;
  - web was started by the loop and then stopped in `cleanup.json`;
  - `web.log` captured the Expo startup command and initial bundler output.
- Startup failure handling was tightened on 2026-05-05:
  - `services.json` is now written with `status: fail`, the failure message, service records, and cleanup status when backend or web startup fails.
  - Any process started before the failure is terminated immediately, even though startup aborts before returning to the main loop.
  - Unit coverage simulates a backend health-check timeout and verifies failure reporting plus cleanup.
- Confirm logs are sufficient when Expo or backend startup fails.
- Live service management for `eval/runs/20260505-193719-adam-eve-iter-01` used `eval/runs/20260505-193716-adam-eve-services`:
  - backend was preexisting and recorded as `started: false`;
  - web was started by the loop on PID `50960`;
  - cleanup completed normally after the two-iteration loop; `cleanup.json` records `web.stopped: true` and `backend.stopped: false`.
  - Follow-up: confirm startup failure logs remain sufficient for failure cases.
- Fresh live service management re-verified on 2026-05-05 with `eval/runs/20260505-214102-adam-eve-services`:
  - backend was preexisting and recorded as `started: false`;
  - web was started by the loop on PID `4515`;
  - cleanup completed normally after the one-iteration run; `cleanup.json` records `web.stopped: true`, `web.returncode: 0`, and `backend.stopped: false`.
  - Follow-up: confirm startup failure logs remain sufficient for failure cases.
- Service instability reproduced on 2026-05-05 with `eval/runs/20260505-215923-adam-eve-services`:
  - web was started by the loop on PID `22728`;
  - Adam's scratch log reports `localhost:8082` refused connections during Stage 2 and the web PID was defunct;
  - cleanup recorded `web.stopped: true` with `returncode: -9`;
  - the service log captured normal Metro startup and bundling, but no obvious crash reason after bundling.
  - Next service work should make this failure easier to diagnose or prevent: capture child process status during actor runs, surface premature web death before scoring as a service failure, and preserve enough log/process evidence to distinguish actor-observed service death from normal cleanup.

Add `--start-services`.

Behavior:

- start backend if not healthy,
- start E2E web on `8082` if not reachable,
- set required env vars,
- write logs under the run directory,
- clean up only services started by the loop.

Acceptance criteria:

- A cold local checkout can run the loop with one command when dependencies are installed.
- Existing user-started services are not killed.

## Recommended Build Order

1. Reliable transcript extraction.
2. Scorer schema validation and retry.
3. Deterministic invariant checks.
4. Patch verification contract.
5. Run-level summary across iterations.
6. Regression memory.
7. Prompt and skill version tracking.
8. Snapshot and seeded start points.
9. Service management.

## Next Command After Reliability Work

Once transcript extraction and scorer validation are in place, run the next quality-expansion loop:

```bash
python3 scripts/mwf_gold_loop.py run \
  --scenario adam-eve \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 2 \
  --max-actor-turns 8 \
  --actor-timeout 900 \
  --scorer-timeout 900 \
  --improver-timeout 900 \
  --improvement-mode patch \
  --start-services
```

Expected behavior:

- If actor fidelity is weak, the loop routes improvement to `actor_skill`.
- If MWF guidance is weak with faithful actors, it routes improvement to `mwf_prompts`.
- If state/privacy/UI behavior fails, it routes to `product_code`.
- If evidence is insufficient, it routes to `eval_harness`.

## Next-Session Handoff Prompt

Every session that continues this plan should update this section before stopping. The final response should also include the exact prompt recommended for the next Codex session.

Current recommended prompt:

```text
Continue /Users/shantam/Software/meet-without-fear/docs/product/mwf-gold-autonomous-loop-remaining-plan.md.

Focus on the next highest-leverage remaining work without adding new brittle hard invariants. Prioritize:
1. Start from the latest attempted blank-draft verification at `eval/runs/20260505-215926-adam-eve-loop-summary.md` and the iteration artifacts under `eval/runs/20260505-215926-adam-eve-iter-01`.
2. Inspect these artifacts before changing code: `score.json`, `invariants.json`, `adam.last.md`, `scratch/2026-05-05-cmotl8cf40008pxix894u0yyw-adam.md`, `transcript-extract-error.txt`, and service artifacts under `eval/runs/20260505-215923-adam-eve-services/`.
3. The Stage 2 blank-draft product fix is already applied and focused-test verified: non-empty hidden Stage 2 `<draft>` content is persisted even when `ReadyShare:Y` is missing. Do not rework that path unless a live rerun reaches Eve Stage 2 and still shows blank draft content.
4. Apply the next highest-leverage objective harness/service fix: the loop-started E2E web service died during Adam Stage 2, leaving Adam `bug_blocked`, Eve without a final status, and transcript extraction unable to find the session. Improve service lifecycle diagnostics or supervision so premature web death is caught with clear evidence before scoring, and so the next rerun can reliably reach both actors.
5. Preserve the existing share-offer actor-drivability guard: current-user `ReconcilerShareOffer` records in `OFFERED` or `PENDING` should keep Stage 2 `selfActionNeeded` active. Do not replace this with qualitative string checks.
6. Rerun focused tests, then rerun a fresh one-iteration Stage 2 loop with `--start-services --no-improve-on-final-fail`. Confirm stale Eve resumes remain gone, `stage_limit_reached_correctly` does not fail for no-action stop-stage waits, service death no longer makes the run unscoreable, and if the run reaches Eve Stage 2, blank draft review disappears.
7. If live services or actor orchestration still block progress, improve the harness only where the failure is objective: service cleanup, transcript extraction, scorer schema repair, seeded/snapshot start metadata, patch verification, scheduler stop conditions, or explicit bug-blocked classification.
8. Keep qualitative conversation-quality checks in scorer/rubric territory, not deterministic string rules.

Before changing code, inspect the plan doc and current git status. After changes, run focused tests and update the plan doc with exact run directories and verification notes. Before stopping, update the Next-Session Handoff Prompt section with the exact prompt to use next.
```
