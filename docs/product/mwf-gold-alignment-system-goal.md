# Codex Goal — Autonomous Gold-Alignment System

This is the large, terminal goal for the gold-alignment workstream. After it lands, you should not need to iterate on the meta-architecture again. The system runs on a cadence, opens PRs for prompt improvements that converge toward gold-example alignment, and accepts new gold examples without code changes.

This goal is bigger than previous goals. It is structured in five sequential phases, each with verifiable acceptance criteria. Codex must complete phases in order. If a Codex session hits its limit mid-phase, document where it stopped in the build progress doc; the next session resumes at the same phase.

Paste **Goal Statement** + **Success Criteria** + **Constraints** to a Codex goal session. The rest is supporting context.

## Goal Statement

Build the autonomous gold-alignment system on top of the existing Moment Evaluator (PR #374). When this goal is reached:

1. The system has a moment library covering all four stages plus key transitions, with at least one multi-turn trajectory moment per stage.
2. The improver enforces cross-moment regularization — a candidate prompt revision is only kept if it does not regress any other moment in the same stage.
3. A scheduled runner can iterate the loop autonomously on a configurable cadence with cost caps, opening PRs for revisions that pass all gates.
4. New gold examples can be added by dropping a transcript file into a directory and running a single onboarding command that scaffolds initial moment yamls.
5. The status dashboard surfaces the latest production prompts, the latest candidate revisions, score trends, cost spent, and open PRs in one place.
6. The end-to-end E2E loop (`mwf_gold_loop.py`) is integrated as the slow outer-loop validation: moment-level revisions only get auto-PR'd if a periodic E2E gold-session run confirms no whole-flow regression.

When this is done, the user's role becomes: review PRs from the loop, decide on merge, and add new gold examples when they want sharper alignment. The user does not iterate on the meta-architecture or write moment yamls by hand.

## Phases

Phases are sequential. Each ends with a hard checkpoint. If a session hits its limit, the next session resumes at the same phase.

### Phase 1 — Stage Coverage (moment library)

Add moments covering all four stages and one key transition. Build sequentially.

1. **`stage-1-emotional-pivot`** — User pivots from naming a fact to expressing a feeling; AI must stay in listening mode. Doubles as the v03 regression check.
2. **`stage-2-empathy-validation`** — Partner reviewing the empathy attempt; AI invites confirm-or-refine without forcing a verdict.
3. **`stage-2-refinement-round`** — User requests refinement; AI integrates feedback into a revised draft without losing thread.
4. **`stage-3-mutual-reveal`** — Both partners' needs revealed side-by-side; AI asks "what do you notice?" without analyzing or labeling overlap.
5. **`stage-3-validity-gate`** — Both partners affirm validity of all needs before Stage 4; AI surfaces this gate without rushing.
6. **`stage-4-willingness-selection`** — Both partners marking willingness on shared proposals; AI captures selections, surfaces closure path without inventing agreement.
7. **`stage-4-no-shared-agreement`** — One partner declines all shared proposals; AI closes with dignity, individual commitments persist, unmet needs named.
8. **`transition-stage-2-to-3`** — Hand-off moment: empathy validated, AI introduces Stage 3 without prematurely pivoting to needs language.

### Phase 2 — Cross-Moment Regularization

Modify the improver so a revision proposed for moment A is only kept if it does not regress any other moment in the same stage. The improver must:

- Run the candidate revision against every other moment in the same stage.
- Score each via the deterministic invariants AND the LLM judge.
- Refuse revisions that drop any other moment's score below its individual threshold OR fail any other moment's hard invariant.
- Log the cross-moment evaluation in the improvement-plan.md for transparency.

### Phase 3 — Trajectory Moments

Add support for multi-turn moments. A trajectory moment in the yaml schema describes a sequence of N user turns plus N AI turns. The seeded state advances forward; the AI's response to turn k feeds the seed for turn k+1. The judge scores the whole trajectory, not snapshots.

Build at least one trajectory moment per stage:

1. **`stage-1-trajectory-fact-to-handoff`** — User names two facts; AI reflects each; user pivots emotionally; AI handles without prematurely setting FeelHeardCheck:Y.
2. **`stage-2-trajectory-empathy-cycle`** — Partner reviews draft; refines; AI integrates; partner validates.
3. **`stage-3-trajectory-needs-flow`** — User identifies needs; confirms; consents to share; reveal; "what do you notice?"
4. **`stage-4-trajectory-willingness-to-close`** — Both name willingness; AI surfaces overlap or no-overlap; closure follows.

### Phase 4 — Autonomous Loop + PR Creation

Build the scheduled runner. Implementation:

1. New entrypoint `scripts/mwf_alignment_loop.py` that:
   - Reads a config file `eval/alignment-loop-config.yaml` listing which moments to run, score thresholds, cost caps, schedule cadence.
   - Iterates each moment in scope.
   - For moments scoring below threshold, runs the improver (with cross-moment regularization from Phase 2).
   - For revisions that pass all gates, OPENS A GITHUB PR with: the diff, the run artifacts as evidence, the score deltas per moment, and a clear PR title naming the affected stage.
   - Records summary to `eval/alignment-runs/<timestamp>/summary.md`.

2. Cost caps: per-run cap (default $5), per-day cap (default $20). Refuses to run if today's cumulative spend would exceed.

3. PR creation rules:
   - Branch name: `loop/alignment-<moment-id>-<timestamp>`
   - PR title: `loop: improve <stage> prompt for <moment-id> (+<delta> overall)`
   - PR body: improvement-plan.md content, run-artifact links, cross-moment regression check results.
   - PR has a `loop:auto-improvement` label.
   - PR is opened as draft if any score is borderline; ready-for-review if all clear.

4. The runner must be cron-installable; provide a `crontab.example` with a sane default cadence (suggest weekly).

### Phase 5 — Outer Loop Integration + Gold Example Onboarding + Dashboard

1. **E2E outer-loop integration.** When the alignment loop produces a candidate PR, automatically schedule a slower E2E gold-session run via `mwf_gold_loop.py` against the proposed prompt. If the E2E run regresses overall score by more than 0.5 vs. baseline, the PR is automatically converted to draft and a comment is added: "E2E regression detected — see <link>." If no regression, mark PR ready-for-review.

2. **Gold example onboarding.** New entrypoint `scripts/mwf_add_gold_example.py <transcript-path>` that:
   - Validates the transcript file (must be markdown, must have stage markers `## Stage N` or equivalent).
   - Copies it to `docs/product/source-material/golden-transcripts/<derived-name>.md`.
   - Scaffolds initial moment yamls for each clearly-identifiable moment in the new transcript by extracting the trigger turn and the AI's response, plus a draft rubric pointing at the line range. Stub yamls go to `eval/moments/<derived-id>.yaml.draft` for human review.
   - Updates the moment library index doc.
   - Runs `python3 scripts/test_mwf_moment_eval.py` to verify nothing broke.

3. **Status dashboard.** New file `docs/product/mwf-alignment-status.md` (regenerated by a script `scripts/mwf_alignment_status.py`) showing:
   - Current production prompt SHA + version.
   - Latest candidate revisions per stage with score deltas.
   - Open `loop:auto-improvement` PRs.
   - Score trends per moment over the last N runs.
   - Cost spent this week, this month.
   - Last E2E outer-loop run date and verdict.
   - Gold examples currently in the library.

The dashboard regenerates from artifacts; no manual editing.

## Success Criteria

Each phase must hit all its criteria before moving to the next.

### Phase 1 (Moment Library)

1. Eight new moments authored: yaml + judge prompt + at least 2 deterministic hard invariants each + at least 3 unit test cases each.
2. Each moment runs end-to-end with `--real --max-iterations 1 --no-improve` and produces a real run directory with the standard artifacts.
3. The full moment library can be invoked with one command: `python3 scripts/mwf_moment_eval.py run-library --real --no-improve` (extend the existing CLI).

### Phase 2 (Cross-Moment Regularization)

4. Improver tested with two cases: a revision that improves moment A without regressing B → kept; a revision that improves A but regresses B → rejected with logged reason.
5. Test coverage: `scripts/test_mwf_moment_eval.py` includes at least 4 new tests on the cross-moment evaluation.
6. The cross-moment evaluation runs in under 90 seconds for a stage with 4 moments at default judge cost.

### Phase 3 (Trajectory Moments)

7. Yaml schema extended to support `trajectory: [...]` sequences. Schema validation rejects malformed sequences (e.g. unbalanced turn counts).
8. Four trajectory moments authored, one per stage.
9. The trajectory runner correctly threads state from turn k to turn k+1 (verifiable by inspecting `state-delta.json` showing intermediate AI responses persisted).
10. Each trajectory moment has at least one unit test exercising the multi-turn flow with a mocked judge.

### Phase 4 (Autonomous Loop + PR Creation)

11. `scripts/mwf_alignment_loop.py` runs end-to-end producing a summary file. Test by running it once with `--dry-run` (no PR creation) on the existing 13-moment library.
12. Cost caps enforced: a deliberately tight `--per-run-cap-cents 5` setting causes the loop to abort partway through with a clear diagnostic and partial summary.
13. PR creation tested in isolation: feed the PR-creation function a known good revision and confirm it opens a PR with the expected title, body, label, and branch name.
14. Cron-installable: `crontab.example` exists; the script can be invoked from cron without any TTY-dependent prompts.

### Phase 5 (Outer Loop + Gold Onboarding + Dashboard)

15. E2E outer-loop integration: when an auto-PR is opened, the loop schedules a `mwf_gold_loop.py` run against the proposed prompt; on regression, the PR is converted to draft with a comment. Test by feeding it a known-bad revision and confirming the PR ends up draft.
16. Gold-example onboarding: `python3 scripts/mwf_add_gold_example.py <new-transcript.md>` against a fixture transcript correctly: copies the transcript, scaffolds yaml drafts, updates the index, runs tests. Verified by a fixture-based test.
17. Status dashboard: `scripts/mwf_alignment_status.py` regenerates `docs/product/mwf-alignment-status.md` with all required sections. Idempotent (regenerating twice produces identical output absent state changes).

### Cross-cutting

18. Existing E2E loop browser smoke (`python3 scripts/mwf_gold_loop.py browser-smoke`) still exits 0.
19. All existing tests pass: `python3 scripts/test_mwf_moment_eval.py` (will grow from 15 to 50+).
20. Backend typecheck passes: `npm run check --workspace backend`.
21. Documentation updated: `mwf-moment-evaluator-plan.md` reflects the system as built; `mwf-alignment-status.md` exists; `mwf-gold-alignment-system-build-progress.md` records per-criterion validation.

## Stop conditions (declare goal NOT reached and ask Shantam)

- Authoring a moment requires backend refactor beyond a small additive helper.
- A hard invariant cannot be made deterministic in a way that's both correct and testable.
- The PR-creation path interacts with branch protection rules in a way that requires changes to repository settings.
- The cron-installability check reveals environment dependencies (credentials, paths) that vary by deployment context.
- E2E outer-loop integration reveals that the existing loop is structurally incompatible with the slot-in pattern the goal expects (e.g., it can't be invoked headlessly with a specific prompt revision).
- Cumulative judge cost across all phases exceeds $30. Stop and ask before continuing.
- A criterion can only be met by softening the criterion (e.g. lowering the cross-moment regression threshold to make tests pass).

## Constraints

- Working directory: `/Users/shantam/Software/meet-without-fear` (main checkout). Branch from main as `feat/gold-alignment-system-<datestamp>`.
- Each phase commits to the same branch. PR opens at the end of the goal, NOT phase-by-phase. (Reasoning: phases are interdependent; a partial PR is hard to review.)
- The autonomous loop must NOT push directly to `main`. It opens PRs only.
- The autonomous loop must NOT modify `backend/src/services/stage-prompts.ts` source directly. It only writes versioned files; PRs from the loop are the mechanism for source modification.
- Cost caps must be enforced before LLM calls, not after.
- Gold transcripts under `docs/product/source-material/golden-transcripts/` are READ-ONLY to the loop. Onboarding writes new transcripts under that path; the loop does not modify existing ones.
- Existing E2E loop (`mwf_gold_loop.py`) is integrated as a callable, but its core code is unchanged. Treat it as a black-box subprocess.
- Worktree-only edits per the existing pattern; no edits to other workstreams' branches.
- Validate every phase boundary: tests pass, typecheck clean, smoke clean. Record in build progress doc.
- If a decision is ambiguous and materially affects product behavior, add to "Questions For Shantam" and proceed only along a conservative reversible path.

## Required reading

In this order:

1. `docs/product/mwf-gold-flow-next-session-plan.md` — overall direction.
2. `docs/product/mwf-moment-evaluator-plan.md` — Moment Evaluator plan, especially the moment library section.
3. `docs/product/mwf-moment-evaluator-build-progress.md` — what shipped in PR #374.
4. `docs/product/stage-4-gold-question-analysis.md` — gold posture for Stage 4 moments.
5. The four golden transcripts under `docs/product/source-material/golden-transcripts/`.
6. `eval/moments/stage-1-fact-reflection.yaml` and `eval/scorer/judge-prompts/stage-1-fact-reflection.md` — pattern to mirror.
7. `scripts/mwf_moment_eval.py`, `scripts/test_mwf_moment_eval.py`, `backend/src/scripts/mwf-moment-real.ts` — extend in place.
8. `scripts/mwf_gold_loop.py` — for the outer-loop integration; understand its CLI contract before integrating.
9. `backend/src/services/stage-prompts.ts` — Stage 1, 2, 3, 4 prompt sections; understand existing hooks.

## Build progress

Codex must maintain `docs/product/mwf-gold-alignment-system-build-progress.md` updated per criterion. Phase-section headings; checkbox per criterion; commit shas; validation commands; decisions; questions; never silently un-tick.

## Before declaring goal reached

1. Run all 21 success criteria commands or test invocations in sequence.
2. Confirm the dashboard generates and looks reasonable.
3. Run `mwf_alignment_loop.py --dry-run` once on the full library and confirm a clean summary.
4. Open the goal's PR with all phases included; confirm CI passes.
5. Only then declare goal reached.

---

## Notes for Shantam (do not paste to Codex)

- This goal is roughly 3-5 days of Codex runtime if the architecture holds. Expect partial completion in any single session; the phase structure handles handoff.
- Cumulative cost: estimated $15-30 in Bedrock judge calls across the whole goal. The $30 stop condition is a hard cap.
- The two riskiest phases are 4 (autonomous loop + PR creation — interacts with GitHub APIs) and 5 (E2E integration — depends on `mwf_gold_loop.py` being CLI-compatible). If either hits a stop condition, you'll need to manually unblock once and restart.
- After this lands, your role is: (a) review auto-PRs from `loop:auto-improvement`, (b) decide which to merge, (c) add new gold examples when you want sharper alignment. You do not iterate on the meta-architecture.
- The system as designed assumes the existing E2E loop's CLI is stable enough to be called as a subprocess. If it isn't, Phase 5 needs adjustment — but that's also fixable in one focused session.
- Known limitation: the system optimizes for moments you've authored. Moments that don't exist can't be fixed by it. The gold-example onboarding (Phase 5 part 2) is the mitigation: when you notice a posture issue not covered by existing moments, drop a new gold example and the system scaffolds the moment yamls for you.
