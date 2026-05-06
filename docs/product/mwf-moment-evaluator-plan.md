# MWF Moment Evaluator — Plan

Status: proposal
Date: 2026-05-05
Related: `docs/product/mwf-gold-self-improvement-loop-plan.md`, `docs/product/mwf-gold-autonomous-loop-remaining-plan.md`, `docs/product/gold-flow-eval-harness-spec.md`, #244, #282

## Why this exists

The existing self-improvement loop (`scripts/mwf_gold_loop.py`) drives Codex actors through the real local web app over Playwright, then scores the resulting transcript. That harness is the right tool for end-to-end smoke runs but the wrong tool for prompt-quality iteration:

- A single iteration takes minutes (browser session, two actors, real services). The improver's signal-to-cost ratio is poor.
- Most failures are infrastructure, not conversation: web-server death, transcript extraction misses, stale Eve resumes, scheduler stop conditions.
- Iterating on a single stage requires the entire prior flow to work first. Stage 4 prompt iteration today demands that Stages 0-3 all succeed live.
- The improver burns iterations on integration noise that prompt edits cannot resolve.

The Moment Evaluator is a faster, narrower complement: a stage-segmented loop that seeds a known conversational state directly into the database, drives one or two AI turns through direct API calls, and scores the AI's response against a gold-aligned rubric for that specific moment. No browser. No two-actor orchestration. No service supervision.

The existing E2E loop continues to exist for nightly integration smoke. The Moment Evaluator handles the high-frequency prompt-quality work.

## Goal

A user can name a moment — for example "Stage 2 partner validates the empathy attempt" or "Stage 0 to Stage 1 transition" — and run a self-improving loop that:

1. Seeds the database into the exact state preceding that moment (using gold-aligned content as direct implants).
2. Drives a deterministic actor turn or two through the backend API.
3. Captures the AI's response and any state mutations.
4. Scores the response against a moment-specific rubric anchored to the gold transcript.
5. If the score is below threshold, the improver patches the MWF prompt for that moment **or** the actor skill for that moment, depending on which is the higher-leverage owner of the gap.
6. Re-seeds and re-runs until the score reaches threshold or the user sets a stop condition.

Iteration time goal: tens of seconds per loop, not minutes. Prompt edits should land, hot-reload, and rerun in the same session.

## Scope

In scope:

- Per-moment seeded eval against direct backend API calls.
- Per-moment rubrics anchored to specific gold transcript line ranges.
- Improver targets: MWF stage prompts, actor skill prompts, MWF stage rubrics, and combinations.
- Version tracking and diffing across iterations.
- Patch verification through deterministic rerun.
- Reuse of existing loop machinery wherever it does not depend on browser/two-actor I/O.
- Coverage of Stage 0, Stage 1, Stage 2, Stage 3, Stage 4, Tending, plus all stage transitions.

Out of scope:

- Replacing the existing E2E loop. The two coexist: Moment Evaluator for prompt-quality iteration, E2E loop for integration smoke.
- Mobile UI evaluation. The Moment Evaluator scores the AI's behavior, not the rendered UI. UI verification stays with Playwright.
- Real-time evaluation against live production sessions.

## Architecture

```
scripts/
  mwf_moment_eval.py              entry point, mirrors mwf_gold_loop.py shape
eval/
  moments/
    stage-2-empathy-validation.yaml
    stage-3-reveal-consent.yaml
    ...                            one yaml per moment, see Moment Library below
  seeds/
    seeder.py                      reads moment yaml, writes DB state via Prisma
    fixtures/                      gold-aligned content snippets (named facts, empathy drafts, needs lists, proposals) usable as implants
  runner/
    moment_runner.py               seed -> API call -> capture response and state delta
  scorer/
    moment_scorer.py               loads moment rubric, scores response against it
    rubrics/
      stage-2-empathy-validation.md
      ...                          one rubric per moment, anchored to gold transcript line ranges
  improver/
    prompt_improver.py             reuses existing prompt-improver patterns
    actor_skill_improver.py        new: targets actor skill prompts when the moment depends on actor behavior
  versioning/                      reuse existing version tracking from the E2E loop
```

The runner does not start the web bundle, does not spawn Playwright, does not run two Codex actors. It calls the backend Express handlers directly with seeded request shapes.

## Moment yaml shape

Each moment is one yaml file. Example:

```yaml
id: stage-2-empathy-validation
stages: [2]
description: |
  Adam has submitted an empathy draft. Eve is reviewing. The AI must produce
  the validation prompt that lets Eve either confirm understanding, request
  refinement, or skip the refinement loop.

# Seed state preceding the moment
seed:
  session:
    status: ACTIVE
    stage: 2
  participants:
    - role: invitor
      name: Adam
      compactSigned: true
      stageGates:
        2:
          empathyDraftReady: true
          empathyConsented: true
    - role: invitee
      name: Eve
      compactSigned: true
      stageGates:
        2:
          partnerConsented: true
  facts:
    fixture: gold/adam-eve/stage-1-facts.yaml
  empathy_attempt:
    author: Adam
    fixture: gold/adam-eve/stage-2-empathy-draft.md

# Test input that drives the AI turn under evaluation
trigger:
  type: api_call
  endpoint: POST /sessions/:id/messages
  actor: Eve
  body:
    role: USER
    content: "I am about to read his draft."

# What to capture from the response
capture:
  - ai_message_text          # the streamed assistant message
  - new_messages_in_db
  - stage_progress_diff
  - realtime_events_published

# Rubric (see eval/scorer/rubrics/<id>.md for full text)
rubric:
  reference_transcript_lines: adam-eve.md:415-460
  dimensions:
    - id: invitation_to_validate
      description: "AI invites Eve to confirm or refine, not direct her to a verdict."
      pass_threshold: 4
    - id: no_grading_voice
      description: "AI does not praise or grade the draft."
      pass_threshold: 4
    - id: refinement_path_offered
      description: "AI offers a path to refinement that does not force one."
      pass_threshold: 3
  overall_pass_threshold: 3.5
  hard_invariants:
    - "AI does not reveal Adam's empathy text without Eve's consent first."
    - "AI does not introduce content from Stage 3 or Stage 4."

# Improver targeting
improver:
  candidate_owners: [mwf_prompts, actor_skill, eval_rubric]
  default_owner: mwf_prompts
```

## Seed strategy

Two implants are allowed:

- **Direct DB writes via Prisma.** Sessions, participants, stage progress, message history, empathy attempts, needs, proposals. The seeder uses Prisma client directly inside a transaction.
- **Gold-aligned content fixtures.** Named facts, empathy drafts, needs lists, proposals. Stored under `eval/seeds/fixtures/gold/<scenario>/<moment>.{md,yaml}`. The fixtures are extracted from the gold transcripts so the seeded state is aligned with the gold ground truth, not invented.

The seeder must be idempotent and tear-down-able. Each moment run starts from a clean session created by the seeder; no shared state across runs.

## Moment library, first cut

Start with the moments where prompt quality matters most and where the gold transcripts give the clearest evidence. Expand later.

| Moment id | Stage(s) | Gold reference |
|---|---|---|
| stage-0-compact-signed-self-heal | 0 | core-protocol-update.md introduction |
| stage-0-to-1-transition | 0->1 | adam-eve.md initial messages |
| stage-1-fact-naming | 1 | adam-eve.md Stage 1 segment |
| stage-1-to-2-transition | 1->2 | adam-eve.md Stage 1 close |
| stage-2-empathy-draft-creation | 2 | adam-eve.md Stage 2 mid |
| stage-2-empathy-validation | 2 | adam-eve.md ~ll. 415-460 |
| stage-2-refinement-round | 2 | adam-eve.md refinement segment |
| stage-2-to-3-transition | 2->3 | adam-eve.md Stage 2 close |
| stage-3-needs-identification | 3 | adam-eve.md Stage 3 opening |
| stage-3-needs-confirmation | 3 | adam-eve.md Stage 3 mid |
| stage-3-share-consent-gate | 3 | adam-eve.md Stage 3 consent |
| stage-3-mutual-reveal | 3 | adam-eve.md reveal moment |
| stage-3-what-do-you-notice | 3 | adam-eve.md "what do you notice" |
| stage-3-validity-gate | 3 | adam-eve.md Stage 3 close |
| stage-3-to-4-transition | 3->4 | adam-eve.md Stage 4 opening |
| stage-4-proposal-invitation | 4 | adam-eve.md Stage 4 opening |
| stage-4-ai-ideas-consent | 4 | adam-eve.md "want to hear them?" |
| stage-4-declined-ai-ideas | 4 | james-catherine.md Catherine's track |
| stage-4-proposal-removal | 4 | james-catherine.md "off the list" |
| stage-4-coverage-audit | 4 | core-protocol-update.md ~ll. 192-198 |
| stage-4-willingness-selection | 4 | adam-eve.md ~ll. 788-810 |
| stage-4-shared-agreement-closure | 4 | adam-eve.md ~ll. 814-838 |
| stage-4-no-shared-agreement-closure | 4 | james-catherine.md ~ll. 1257-1306 |
| tending-passive-reentry | Tending | core-protocol-update.md ~ll. 248-289 |
| tending-scheduled-checkin | Tending | adam-eve.md Tending segment |
| tending-one-sided-checkin | Tending | adam-eve.md ~l. 1039 |

The first three to build, ranked by the agent audit findings:

1. **stage-4-no-shared-agreement-closure** — Q4 confirmed, but the prompt audit found 3 contradictions. The clearest test for whether the resolved Q4 actually produces the right dialogue.
2. **stage-4-proposal-removal** — Catherine's "That comes off the list" was found to fail the capture regex. A moment-level test would have caught this.
3. **stage-2-empathy-validation** — most-iterated stage in the existing E2E loop, where prompt quality is the live blocker.

## Scoring

Two-tier:

- **Per-dimension scores** (1-5) from an LLM-as-judge anchored to the moment rubric and a verbatim transcript reference.
- **Hard invariants** that fail the run regardless of dimension scores. Examples: "AI does not reveal partner content before consent," "AI does not introduce content from a later stage."

Rubric dimensions are written in `eval/scorer/rubrics/<id>.md` as a markdown doc with explicit pass criteria and at least one verbatim quote from the gold transcript.

## Improver

Reuses the existing improver pattern. Two new things:

1. **Per-moment owner candidates.** Each moment yaml lists which owners are valid for that moment. The improver picks an owner based on the dimension that scored lowest, falling back to default_owner.
2. **Actor skill improver.** Some moments depend on the actor playing Adam or Eve faithfully (e.g. Catherine declining AI ideas — the actor must drive that branch). When the failing dimension is on actor behavior, the improver targets the actor skill prompt under `eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md`.

Patches go to:
- `backend/src/services/stage-prompts.ts` (or analog) for MWF prompts.
- `eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md` for actor skill.
- `eval/scorer/rubrics/<id>.md` for rubric corrections (rare; only when the rubric itself is the bug).

Same protected-branch guard as the E2E loop. Patch mode refuses `main` unless explicitly allowed.

## Verification and version tracking

Same shape as the existing E2E loop:

- Each iteration produces a run directory under `eval/runs/moment-<id>-<timestamp>-iter-<n>/`.
- Each run records: seeded state hash, AI response, captured state delta, score, dimension scores, hard-invariant outcomes, owner targeted, patch applied.
- Patch is verified by re-running the moment with the new prompt/skill and confirming the score moved in the right direction (or didn't regress on hard invariants).
- Across iterations, the loop summary tracks delta per dimension so it can detect "score moved up but hard invariant regressed."

## Integration with the existing loop

- The E2E loop's actor/scorer/improver code is the parent shape; the Moment Evaluator implements the same interfaces against a different I/O layer.
- The two share the version-tracking directory (`eval/prompt-versions/`, `eval/skills/`).
- A successful Moment Evaluator iteration on Stage 2 prompts produces a new version of `stage-prompts.ts`. The next E2E loop run picks up the same version automatically.
- Conversely, the Moment Evaluator does not block on the E2E loop. They run on independent cadences.

## Build phases

**Phase 1: minimal viable, one moment, end-to-end** (target: 2-3 days of focused work)

- Build the seeder for one moment (recommended: `stage-4-no-shared-agreement-closure`).
- Build the moment runner that calls the relevant backend handler directly.
- Build the LLM-as-judge scorer with the rubric for that one moment.
- Reuse the existing improver, pointed at MWF prompt only.
- Run the loop. Confirm an iteration completes in tens of seconds and produces a usable improvement-target signal.

**Phase 2: 5 load-bearing moments** (after Phase 1 ships)

- Add `stage-4-proposal-removal`, `stage-2-empathy-validation`, `stage-3-mutual-reveal`, `stage-3-validity-gate`.
- Add the actor-skill improver branch.
- Add per-moment dimension delta tracking across iterations.

**Phase 3: full single-moment coverage** (after Phase 2 ships)

- Build seeders and rubrics for the rest of the moment library.
- Add a CLI mode that picks a moment by id or by stage filter.

**Phase 4: stage-transition moments and chained moments** (after Phase 3 ships)

- Add support for moments that span two adjacent stages (e.g. Stage 2 -> Stage 3 transition).
- Add chained moments where the seeded state of moment N+1 is the captured state of moment N. This lets the loop iterate on a small flow segment without running the full E2E session.

## Open questions

- Should the moment runner stream the AI response (matching production) or wait for the full response before scoring? Streaming is more faithful but adds runner complexity. Recommendation: collect the full message for scoring; capture stream metadata as a side artifact for later.
- Where do hard invariants live? In the moment yaml (per-moment) or in a shared layer (cross-moment)? Recommendation: both. Per-moment invariants in yaml, cross-moment invariants (e.g. "AI never reveals partner content without consent") in a shared rubric layer applied to every run.
- Actor skill improver vs. MWF prompt improver — when both could apply, how to choose? Recommendation: lowest-dimension-score wins, with the moment yaml's `default_owner` breaking ties.

## Risks

- **Seeded state drift from gold reality.** If the seeder writes a session into a Stage 2 state that differs subtly from how production gets to Stage 2, the moment under test is not the moment the user actually sees. Mitigation: build seeders by extracting from successful E2E runs, then trim. Periodic cross-validation: pick one moment, run it both via Moment Evaluator and via the E2E loop, confirm the AI's response is functionally equivalent.
- **Improver overfits to the rubric.** A moment-specific rubric is narrower than full conversation quality. The improver may produce a prompt that scores well on the moment but degrades elsewhere. Mitigation: nightly E2E loop catches global regressions. When a moment-eval-applied patch causes E2E regression, version-tracking lets you revert.
- **Rubric drift over time.** Gold transcripts are stable; rubrics may drift if anchored loosely. Mitigation: every rubric must include at least one verbatim quote from the gold transcript with a line-range reference. Reviewers catching rubric drift have a concrete diff to evaluate.

## Phase 1 Status

Date: 2026-05-05
Goal spec: `docs/product/mwf-moment-evaluator-phase-1-goal.md`
Build progress: `docs/product/mwf-moment-evaluator-build-progress.md`

Phase 1 ships the viable end-to-end loop for one moment (`stage-4-no-shared-agreement-closure`).

What landed:

- Entry point: `scripts/mwf_moment_eval.py` (CLI with `run`, `seed`, etc.)
- Moment yaml: `eval/moments/stage-4-no-shared-agreement-closure.yaml`
- Tests: `scripts/test_mwf_moment_eval.py` — 7 cases, stdlib `unittest` style (matches `test_mwf_gold_loop.py` pattern; no pytest dependency)
- Run artifacts: `eval/runs/moment-<id>-<timestamp>-iter-<n>/{seed-state.json, ai-response.md, state-delta.json, score.json, score-rationale.md, run.json}`
- Improver: writes `improvement-plan.md` + `patch-summary.md`, records prompt versions under `eval/prompt-versions/mwf/stage-4/`, with branch protection (`--allow-protected-branch-patch`)
- Hard invariant `no_invented_shared_agreement` defined and enforced

Validation:

- `python3 scripts/test_mwf_moment_eval.py` — 7 passed, 0 failed
- `python3 scripts/mwf_moment_eval.py run --moment stage-4-no-shared-agreement-closure --max-iterations 1 --no-improve --mock-judge` — exit 0, created `eval/runs/moment-stage-4-no-shared-agreement-closure-20260506-055939-iter-01/`
- Mock judge one-iteration wall-clock observed with `/usr/bin/time -p`: `real 0.10`, `user 0.05`, `sys 0.02`
- `python3 scripts/mwf_moment_eval.py --help` — exit 0, mentions `run`, `--moment`, `--target-score`, `--max-iterations`, `--mock-judge`, `--allow-protected-branch-patch`
- `python3 scripts/mwf_gold_loop.py browser-smoke` — exit 0 after starting local backend/web services; preflight `services: ok`, spawned actor reported `{"browser_control":"ok","url":"http://localhost:8082/","error":null}`

Known limitations carrying into Phase 2:

- The runner is currently mock-only (deterministic AI response and deterministic scoring) so the loop closes end-to-end without external dependencies. Real-LLM judge and real backend API call are Phase 1.5 / Phase 2, so no real-judge one-iteration wall-clock was available in this worktree.
- The seeder writes a SeededState in-process; it does not yet write to a real Prisma DB. Direct DB writes are next.
- The improver pattern is fully wired but only proposes versioned prompt files; it does not yet patch `backend/src/services/stage-prompts.ts` directly.

Phase 2 starts when these become the bottleneck rather than the seed/runner shape itself.

## Real Mode Status

Date: 2026-05-05/06
Goal spec: `docs/product/mwf-moment-evaluator-real-mode-goal.md`
Build progress: `docs/product/mwf-moment-evaluator-build-progress.md`

Real mode is now wired for one moment: `stage-1-fact-reflection`.

What landed:

- Moment yaml: `eval/moments/stage-1-fact-reflection.yaml`, anchored to `docs/product/source-material/golden-transcripts/adam-eve.md:43-67`.
- Judge prompt: `eval/scorer/judge-prompts/stage-1-fact-reflection.md`.
- Real helper: `backend/src/scripts/mwf-moment-real.ts`.
- Python orchestration: `scripts/mwf_moment_eval.py` supports `--real`, `seed-cleanup`, real-mode artifacts, cost guard, deterministic Stage 1 invariants, and Stage 1 prompt-version reruns.
- Backend hook: `backend/src/services/stage-prompts.ts` reads `MWF_STAGE1_PROMPT_APPEND` inside `buildStage1Prompt`; this is Stage 1-only and does not touch Stage 4.
- Prompt version evidence: `eval/prompt-versions/mwf/stage-1/v03.md`.

Real seeder behavior:

- Creates a real `Session` with status `ACTIVE`, real `Relationship`, two `RelationshipMember` rows, two `User` rows, two `UserVessel` rows, both Stage 0 progress rows with `compactSigned: true`, both Stage 1 rows in `IN_PROGRESS`, and a 5-message Stage 1 history from Adam's fact-naming track.
- Tags sessions with `Session.topicFrame` prefix `[mwf-moment-eval]` so `python3 scripts/mwf_moment_eval.py seed-cleanup --older-than <Nh|Nd>` can remove only evaluator test sessions.

Runner contract:

- The Python runner shells out to the Node helper.
- The Node helper imports the Express app and uses `supertest` in-process against `POST /api/sessions/:id/messages/stream`; it does not spawn Playwright, Puppeteer, the mobile web bundle, or a long-running API server.
- Real runs capture `seed-state.json`, `ai-response.md`, `state-delta.json`, `score.json`, `score-rationale.md`, `run.json`, and raw judge metadata.

Judge config and cost:

- Real judge uses Bedrock Haiku, `global.anthropic.claude-haiku-4-5-20251001-v1:0`.
- Default guard: `--max-judge-cost-cents 5`.
- Cost guard refusal path was verified with a zero-cent cap and writes `judge-cost-guard.json`.
- The judge call sends the static system prompt and judge template as cache-control ephemeral blocks where supported by Bedrock; observed usage for the first verified run was 567 input tokens and 303 output tokens.

Observed wall-clock and score movement:

- Single real run: `real 18.45`, run dir `eval/runs/moment-stage-1-fact-reflection-20260506-061931-iter-01/`.
- Improvement run: `real 26.37`, run dirs `eval/runs/moment-stage-1-fact-reflection-20260506-062122-iter-01/` and `iter-02/`.
- Iteration 1: score `2.33`, verdict `eval_fail`; failed `no_advice_or_solutioning`.
- Iteration 2 with `eval/prompt-versions/mwf/stage-1/v03.md`: score `4.33`, verdict `eval_pass`; no hard invariant failures; delta `+2.0` overall and `+2.0` on every targeted dimension.

Known limitations carrying into moment-library expansion:

- Real mode is implemented for `stage-1-fact-reflection` only.
- Branch protection was unit-tested and manually verified from `main`. The checkout was switched back to `codex/mwf-gold-self-improve-stage1` afterward.
- Browser smoke passed after local services were reachable; the backend was already listening on port 3000, and the temporary Expo web server was stopped after the smoke.
- The Stage 1 runtime prompt hook is intentionally narrow. Future moments should either reuse that hook pattern with stage-specific env names or replace it with a cleaner prompt-version injection layer before broad expansion.

## Success criteria

- A user can run `python3 scripts/mwf_moment_eval.py run --moment stage-4-no-shared-agreement-closure --target-score 4.0 --max-iterations 5` and get a final report in under five minutes wall-clock.
- The improver produces a prompt diff that, after re-seeding and re-running, raises the score by at least 0.5 on the targeted dimension without regressing any hard invariant.
- The same prompt diff, picked up by the E2E loop on its next run, does not regress the global E2E score.
- Coverage reaches at least 10 distinct moments across Stages 0-4 and Tending.

## Autonomous Gold-Alignment System Status

Date: 2026-05-06
Goal spec: `docs/product/mwf-gold-alignment-system-goal.md`
Build progress: `docs/product/mwf-gold-alignment-system-build-progress.md`
Dashboard: `docs/product/mwf-alignment-status.md`

The Moment Evaluator now has an autonomous alignment layer on top of the single-moment runner:

- Moment library: 14 configured moments cover Stages 1-4, one Stage 2 to Stage 3 transition, the original Stage 1/Stage 4 baseline moments, and one multi-turn trajectory per stage.
- Cross-moment regularization: prompt proposals are rejected if they regress any same-stage moment below threshold or fail same-stage hard invariants; the gate can run through the real judge path.
- Autonomous loop: `scripts/mwf_alignment_loop.py` reads `eval/alignment-loop-config.yaml`, enforces per-run/per-day cost caps, records `eval/alignment-runs/<timestamp>/summary.md`, and opens `loop:auto-improvement` PRs from `loop/alignment-<moment-id>-<timestamp>` branches.
- Outer loop: when the alignment loop opens a candidate PR, it schedules `scripts/mwf_gold_loop.py run` as the slow E2E validation. Regressions greater than 0.5 versus baseline convert the PR back to draft and add an E2E regression comment.
- Gold onboarding: `scripts/mwf_add_gold_example.py <transcript.md>` validates markdown stage markers, copies the transcript into the golden transcript library, scaffolds `eval/moments/*.yaml.draft`, regenerates the moment index, and runs the evaluator tests.
- Status dashboard: `scripts/mwf_alignment_status.py` regenerates `docs/product/mwf-alignment-status.md` from prompt versions, score artifacts, alignment summaries, loop PRs, costs, E2E results, and transcript inventory.

The E2E loop remains a separate black-box harness. The alignment loop does not patch production prompt source directly; it writes versioned proposals and relies on PR review/merge for production changes.

## Out of scope, restated

- Replacing the existing E2E loop. The two are complementary.
- Mobile UI evaluation.
- Production-traffic evaluation.
- Tuning the rubric format itself once it stabilizes; that is its own workstream.
