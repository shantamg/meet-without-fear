# Codex Goal — MWF Moment Evaluator, Real Mode End-to-End

This goal supersedes the original Phase 1 goal (`mwf-moment-evaluator-phase-1-goal.md`) which shipped a mock-only skeleton. The skeleton works (`python3 scripts/test_mwf_moment_eval.py` is 7/7) but doesn't actually iterate against real prompts. This goal makes it actually work end-to-end for one moment, with real backend API calls, real Prisma seeded state, real LLM-as-judge, and a demonstrable score improvement after a real prompt patch.

**Important: the first real-mode moment is `stage-1-fact-reflection`, NOT a Stage 4 moment.** The original Phase 1 yaml seeded a Stage 4 moment for skeleton purposes; that yaml stays as historical reference only. Stage 4 prompts are owned by a separate active workstream (`codex/stage4-tending-focus`, the Stage 4 realignment goal) and the moment evaluator must not touch them while that work is in flight. Stage 1 is mature, stable, has clean gold transcript references, and nobody else is iterating on its prompt code right now.

Paste **Goal Statement** + **Success Criteria** + **Constraints** to a Codex goal session. The rest is supporting context Codex must read first.

## Goal Statement

Take the existing mock-only Moment Evaluator (`scripts/mwf_moment_eval.py`) and make it work for real, end-to-end, on one moment: `stage-1-fact-reflection`. The goal is reached when a single command can:

1. Seed a real Postgres session (via Prisma) into the Stage 1 state preceding a fact-reflection moment: a session with both compacts signed, both users at Stage 1 (in-progress), one user (the actor) about to name a fact about their partner. The seeded message history must include a few prior fact statements so the AI has context but has not yet hit any Stage-1-to-2 transition signal.
2. Invoke the real backend `messages.ts` controller in-process (supertest pattern) so the actual `stage-prompts.ts` flow runs (Stage 1 prompt path) and a real Bedrock/Anthropic call generates the AI response to the actor's new fact-statement turn.
3. Capture the streamed response, the resulting message rows, and any state mutations.
4. Score the response with a real LLM-as-judge against the moment's rubric, with cost-guard enforcement.
5. If the score is below threshold, the improver patches the Stage 1 prompt and re-runs the full real loop, with a fresh seed, until the score improves by at least 0.5 on the targeted dimension or `--max-iterations` is hit. **Do NOT modify any Stage 4 prompt code.** Stage 4 is owned by the realignment goal in flight.
6. Produce an artifact directory with all the evidence (seed-state, ai-response, judge-rationale, score, prompt-version, etc.).

The moment yaml `eval/moments/stage-1-fact-reflection.yaml` does not yet exist. Authoring it (and its judge prompt template under `eval/scorer/judge-prompts/stage-1-fact-reflection.md`) is part of this goal. The existing `eval/moments/stage-4-no-shared-agreement-closure.yaml` from the Phase 1 skeleton stays in place as historical reference; do not touch it.

The moment library expansion is **out of scope** for this goal — that's the next goal. This one proves real-mode works for one moment.

## Success Criteria

Each criterion is verifiable by running a command. Codex must self-verify before declaring goal reached.

### Real seeder

1. **Real Prisma seed writes real rows.**
   - Command: `python3 scripts/mwf_moment_eval.py seed --moment stage-1-fact-reflection --real --print-state`
   - Expected: exit 0; printed summary shows a real session id (cuid, not a mock prefix), and the rows can be confirmed via `psql` or a Prisma query script. The session must include: `Session` (status `ACTIVE`), two `RelationshipMember` rows with two `User` rows, both `StageProgress` rows for Stage 0 with `compactSigned: true`, both `StageProgress` rows for Stage 1 in `IN_PROGRESS`, and a `Message` history of 4-6 prior turns (mix of user fact statements and AI reflective replies, gold-aligned in tone — pulled from the gold-transcript fixture content).
   - Re-running creates a new clean session each time; old sessions are not reused.
   - The seeder must be tear-down-able: `python3 scripts/mwf_moment_eval.py seed-cleanup --older-than 1d` removes test sessions without affecting non-test data. Test sessions are tagged (e.g. `Session.metadata` flag, or naming prefix on `Relationship` records — pick one and document).

### Real runner (direct backend API call)

2. **Runner calls the real `messages.ts` controller in-process via supertest.**
   - The runner must NOT spawn Playwright, Puppeteer, browser automation, or shell out to `npm run dev:api` to spawn a long-running web server. It must invoke the Express app directly via supertest (or equivalent in-process HTTP client) inside the Node test runtime.
   - Implementation hint: the existing pattern in `backend/src/routes/__tests__/stage4.test.ts` is what to mirror. The Python orchestrator either shells out to a small Node script that uses supertest, or uses a Node child process with stdin/stdout. Pick whichever is simpler and document.
   - Command: `python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --max-iterations 1 --no-improve`
   - Expected: exit 0; new run directory contains `seed-state.json` (with real session id), `ai-response.md` (the actual streamed AI message text — multiple lines, looks like real prose, NOT a hardcoded fixture), `state-delta.json` (showing real `Message` rows created), `score.json`, `score-rationale.md`, `run.json` (with `mode: real` field).
   - Wall-clock for a single real iteration: under 60 seconds end-to-end (seed + API call + Bedrock + judge + scoring). If your environment is slower, document the actual time and proceed.

3. **Real backend run hits the real Bedrock/Anthropic API.**
   - The AI response in `ai-response.md` from criterion 2 must be different across two consecutive runs (because real LLMs are non-deterministic). Verify by running twice and diffing.
   - If `ANTHROPIC_API_KEY` / `AWS_BEDROCK_*` env vars are unset, the runner exits with a clear error message naming the missing var. Do not silently fall back to mock.

### Real LLM-as-judge

4. **Judge is a real LLM call with cost guard.**
   - The scorer in real mode calls Anthropic (Claude Sonnet or Haiku — your choice; document) with a structured prompt that includes: the moment rubric, the gold transcript reference excerpt, the AI's response under evaluation, and instructions to return JSON with per-dimension scores + rationale + hard-invariant pass/fail.
   - The judge prompt and the parsing of its output must be in the repo, not embedded in code as a string literal beyond ~10 lines. Put the judge prompt template in `eval/scorer/judge-prompts/stage-1-fact-reflection.md` (or shared if generic across moments).
   - Cost guard: a new flag `--max-judge-cost-cents <N>` defaults to 5 (5 cents per iteration). If the judge call would exceed this, the runner aborts before making the call and writes a diagnostic to the run directory.
   - The same response text scored twice must produce verdicts that agree on the hard-invariant pass/fail (deterministic on invariants). Per-dimension scores may vary by ≤1 point; document the observed variance.

5. **Hard invariants enforced via deterministic code, NOT the LLM judge.**
   - For the Stage 1 fact-reflection moment, define at least these hard invariants in deterministic Python code (in addition to any others the rubric calls out):
     - `no_stage_jump_content`: the AI response must not contain content that belongs to Stage 2 (empathy attempts), Stage 3 (needs language), or Stage 4 (proposals/strategies). Detect by keyword/regex on stage-specific tokens that the prompt code's existing helpers can identify.
     - `no_advice_or_solutioning`: the AI response must not give advice, propose solutions, or push toward action. Detect by phrases like "you should", "have you tried", "what if you", etc.
     - `no_grading_of_user`: the AI must not grade or evaluate the user's fact-statement (no "good", "great", "that's important" praise tokens).
   - The LLM judge only scores soft dimensions (e.g. reflection quality, openness, faithfulness to the named fact).
   - Test: pass a deliberately-bad response via `--mock-response` that proposes a solution. Verdict must be `eval_fail` regardless of what the LLM judge would say about other dimensions.

### Real improver, real iteration

6. **Improver patches the real prompt and the rerun shows score movement.**
   - When real-mode iteration 1 produces a sub-threshold score, the improver:
     - Generates a candidate revision to `backend/src/services/stage-prompts.ts` (specifically the **Stage 1** section — NOT Stage 4).
     - Saves the diff as `improvement-plan.md` with reasoning anchored to the failing dimensions and the gold-transcript reference.
     - Applies the patch in a new prompt version under `eval/prompt-versions/mwf/stage-1/v0N.md` (and writes the diff to disk) — NOT directly to `stage-prompts.ts` unless `--apply-to-source` is passed.
     - For the rerun, swaps the prompt version into the running prompt at the appropriate hook point.
   - **Hard rule**: the improver must refuse to modify any line of `stage-prompts.ts` that is inside the Stage 4 section, even if a soft dimension would be helped by changes there. Detect the Stage 4 region by file region markers or function name (`buildStage4Prompt` and adjacent). If the improver believes a Stage 4 change is needed, it logs the suggestion to the run directory as `out-of-scope-suggestion.md` and does not patch.
   - Command: `python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --target-score 4.0 --max-iterations 3`
   - Expected: at least one iteration shows `score.json.delta` of `>= +0.3` on at least one dimension over the prior iteration, with no hard invariant regression. Document the observed delta.

7. **Branch protection holds in real mode.**
   - Patch mode in real mode still refuses `main` unless `--allow-protected-branch-patch` is passed. Confirm with: `git branch --show-current && python3 scripts/mwf_moment_eval.py run --moment stage-1-fact-reflection --real --target-score 4.0 --max-iterations 1 --improvement-mode patch` from `main` exits non-zero with a clear message.

### Tests + integration

8. **Unit tests pass, with new real-mode coverage.**
   - Existing 7 tests still pass.
   - New tests added covering: real-mode flag plumbing (mocked at the boundary so tests don't need network), cost-guard refusal path, hard-invariant evaluation independence from judge, branch-protection in real mode.
   - Command: `python3 scripts/test_mwf_moment_eval.py` — exit 0; at least 12 tests total now pass.
   - Mocked tests must use `unittest.mock.patch` (not network); real-network smoke is criterion 2/3.

9. **Existing E2E loop still passes its smoke check.**
   - Command: `python3 scripts/mwf_gold_loop.py browser-smoke` (assuming local services are running per the existing protocol)
   - Expected: exit 0. Codex may rely on the user/loop having services up. If services aren't running, the smoke check is skipped and recorded in the build progress doc as "deferred to next manual smoke run."

10. **Backend typecheck passes.**
    - Command: `npm run check --workspace backend` exit 0.
    - The new in-process supertest helper (whether in `scripts/`, `backend/`, or a new shared dir) must compile cleanly with the rest of backend.

11. **Documentation updated.**
    - `docs/product/mwf-moment-evaluator-plan.md` updated with a "Real Mode Status" section recording: real seeder behavior, runner contract, judge config and cost, observed wall-clock, observed score deltas across iterations, and any known limitations carrying into the moment-library-expansion goal.
    - `docs/product/mwf-moment-evaluator-build-progress.md` updated per criterion with commit shas, validation commands, and observed outputs.

## Stop conditions (declare goal NOT reached and ask Shantam)

- The supertest-style in-process invocation of `messages.ts` requires significant refactor of backend startup code (e.g. tight coupling to `app.listen()`). Document the coupling and stop; do not refactor the backend extensively as part of this goal.
- The Bedrock/Anthropic credentials path requires changes to deployment config or .env handling. Document and stop.
- The judge LLM produces invariant-evaluation deltas across runs (criterion 4 deterministic-on-invariants is violated). The fix is to move more checks to deterministic code, not to retrain the judge. Document and stop.
- A success criterion can only be met by softening the criterion (e.g. by lowering the score-delta threshold). Document the conflict and stop.
- The cost-guard would refuse a normal-priced run at the 5-cent default. Either the prompt is too large or the judge is too expensive; flag and stop, do not silently raise the default.

## Constraints

- Working directory: `/Users/shantam/Software/meet-without-fear` (main checkout — the current evaluator code lives here). Do NOT create a worktree for this goal; the in-flight uncommitted moment-evaluator changes need to stay in this tree.
- The existing E2E loop (`scripts/mwf_gold_loop.py`) must continue to function unchanged. No edits to that file as part of this goal.
- No Playwright, no browser automation, no live web bundle inside the moment evaluator runner. The existing loop's browser path stays exactly where it is.
- Patch mode targets the worktree branch only; refuses `main` without `--allow-protected-branch-patch`.
- Validate every change with `python3 scripts/test_mwf_moment_eval.py` and `npm run check --workspace backend` before committing. Record commands and results in the build progress doc.
- Commit at natural sub-checkpoints. Push when an acceptance criterion is met. Do not hoard work locally across sessions.
- If a decision is ambiguous and materially affects product behavior or data shape, add it to "Questions For Shantam" in the build progress doc and proceed only along a conservative reversible path. Do not guess.
- The judge prompt must use prompt caching where applicable (cache the rubric + gold transcript + system prompt; vary only the AI response under evaluation). This is a real cost driver.

## Required reading (in this order)

1. `docs/product/mwf-moment-evaluator-plan.md` — full plan; this goal completes the missing real-mode parts.
2. `docs/product/mwf-moment-evaluator-build-progress.md` — what's already done.
3. `docs/product/source-material/golden-transcripts/adam-eve.md` — the Stage 1 segment is the gold reference for fact-reflection. Pick a 30-50 line range where the AI is reflecting named facts without grading or pushing; record the exact line range in the moment yaml.
4. `docs/product/source-material/golden-transcripts/james-catherine.md` — Stage 1 reflection in a different couple's voice; useful for cross-validating the rubric.
5. `docs/product/source-material/golden-transcripts/core-protocol-update.md` — Stage 1 protocol-level posture.
5. `scripts/mwf_moment_eval.py` — the existing skeleton; modify in place.
6. `backend/src/routes/__tests__/stage4.test.ts` — supertest-pattern reference.
7. `backend/src/controllers/messages.ts` — the real handler being invoked.
8. `backend/src/services/stage-prompts.ts` — the prompt under iteration.
9. `backend/src/lib/prisma.ts` (or wherever the Prisma client is exported) — for the seeder integration.
10. `eval/skills/self-improvement/mwf-gold-prompt-improver/SKILL.md` — improver patterns to mirror.

## Build progress

Codex must maintain `docs/product/mwf-moment-evaluator-build-progress.md` updated per criterion. Same shape as before: per-criterion checkboxes, files touched, validation runs, decisions, questions for Shantam, never silently un-tick.

Add a new top-level section "Real Mode" under which the 11 criteria above are tracked. Keep the existing Phase 1 section as historical record (don't delete).

## Before declaring goal reached

1. Run all 11 criteria commands in sequence.
2. Paste each command and its outcome into the build progress doc.
3. Demonstrate at least one full real iteration with a score improvement (criterion 6) and link the run directory.
4. Confirm `git status` is clean except for intentional untracked files (run artifacts under `eval/runs/`, prompt versions under `eval/prompt-versions/`).
5. Only then declare goal reached.

---

## Notes for Shantam (do not paste to Codex)

- This goal replaces both the original Phase 1 goal (already shipped) and the Phase 1.5 I was about to draft. One coherent push for real-mode end-to-end.
- Cost: real Bedrock/Anthropic calls. The cost guard at 5 cents/iteration is conservative; 3 iterations of a real loop should be well under 50 cents total.
- Risk: the supertest-pattern in-process invocation might require backend refactor. The stop condition is explicit so Codex won't go off and rewrite backend startup unprompted.
- Phase 2 (moment library expansion to 5+ moments) is the next goal once this lands. That one is mechanical: copy the pattern. The hard work is in this goal.
- After this lands, the loop becomes genuinely useful for prompt iteration — that's the value test we've been waiting for.
