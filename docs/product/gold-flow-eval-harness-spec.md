# Gold Flow Evaluation Harness Spec

Status: draft
Related: #244, #282, #247, #212
Scope: specification only; no implementation in this workstream

## Purpose

Build an evaluation layer for the Gold Flow that can run golden-inspired two-person scenarios, capture the generated session output, score process quality, and show the result in the existing test dashboard.

The harness should measure effect and process fidelity, not exact wording. Adam/Eve is the resolution benchmark. James/Catherine is the non-resolution or no-shared-agreement benchmark. These references should anchor expectations, but a generated session can pass with different phrasing if it produces the right emotional and functional effect.

Canonical source material now lives in `docs/product/source-material/golden-transcripts/`:

- `adam-eve.md`
- `james-catherine.md`
- `core-protocol-update.md`

## Infrastructure Map

### Existing execution spine

| Area | Current files | Reusable behavior |
| --- | --- | --- |
| Standard E2E config | `e2e/playwright.config.ts` | Real backend, real test DB, mocked LLM through fixtures, single worker, screenshots/video/trace. Useful for deterministic structural regression tests. |
| Live AI E2E config | `e2e/playwright.live-ai.config.ts` | Real backend plus `MOCK_LLM=false`. This is the best starting point for evaluation runs because rubric quality depends on actual model output. |
| Two-browser harness | `e2e/helpers/two-browser-harness.ts` | Isolated User A/User B browser contexts, per-user fixture headers for mocked runs, session creation, invitation acceptance, navigation, cleanup. |
| Live two-browser scenario | `e2e/tests/live-ai-two-browser-full-flow.spec.ts` | End-to-end Stages 0-4 with real AI, structural assertions, API assists for long-running stages, transcript-producing DB messages. Best current template for the first eval runner. |
| Mocked full-flow scenario | `e2e/tests/two-browser-full-flow.spec.ts` | Deterministic two-user full flow with screenshots. Useful as a smoke baseline and for UI or state-machine regressions that should not involve LLM variance. |
| Interactive runner | `e2e/scripts/run-test.mjs` | Local operator workflow for selecting and running specs. Can eventually list eval specs, but not required for first slice. |
| Dashboard reporter | `e2e/reporters/test-dashboard-reporter.ts` | Writes `dashboard-summary.json` with scenario, status, timing, failures, stdout, page errors, screenshots. Needs extension for eval score artifacts, not replacement. |
| Publish wrapper | `scripts/ec2-bot/scripts/run-and-publish.sh` | Selects config by scenario prefix, runs Playwright, captures summary, queries Message rows into `dashboard-transcript.txt`, invokes writer. This is the right wrapper for on-demand eval runs. |
| Dashboard writer | `scripts/ec2-bot/scripts/write-test-result.ts` | Creates/updates test run rows, uploads screenshots, posts transcript and console artifacts. Can be extended to post score JSON as a new artifact or first-class eval table. |

### Existing review surface

| Area | Current files | Reusable behavior |
| --- | --- | --- |
| Dashboard schema | `tools/test-dashboard/db/schema.sql` | `test_runs`, `run_artifacts`, and `snapshots`. Good enough for first slice if eval score JSON is stored as an artifact; later needs first-class eval tables. |
| Dashboard API | `tools/test-dashboard/api/runs/index.ts`, `tools/test-dashboard/api/runs/[id].ts`, `tools/test-dashboard/api/artifacts/index.ts` | Run list/detail and artifact fetch/post. First slice can reuse artifacts; later add eval-specific endpoints. |
| Run detail UI | `tools/test-dashboard/src/pages/RunDetailPage.tsx` | Displays summary, screenshots, page errors, console logs, and transcript. First eval UI can add an "Evaluation" section beside the transcript. |
| Dashboard types | `tools/test-dashboard/src/types.ts` | Artifact type currently allows screenshot, transcript, page_error, console. Needs a new `eval_score` artifact type or new eval tables in a later implementation. |
| Snapshots | `tools/test-dashboard/api/snapshots/*`, `backend/snapshots/*` | Useful for repeatability and branching from captured states, but not required for the first vertical slice. |

### Existing transcript and fixture tooling

| Area | Current files | Reusable behavior |
| --- | --- | --- |
| DB transcript query | `scripts/ec2-bot/scripts/run-and-publish.sh` | Produces a simple ordered transcript from `Message` rows created during the run. This is sufficient input for v0 scoring. |
| Rich transcript extractor | `backend/scripts/extract-session-transcripts.ts` | Builds per-user markdown transcripts with milestones, empathy attempts, shared context, validations, and reconciler events. This is the better long-term scorer input. |
| Mock LLM fixtures | `backend/src/fixtures/*`, `backend/src/fixtures/types.ts`, `backend/src/lib/e2e-fixtures.ts` | Deterministic AI response fixtures for Playwright. Do not store golden eval scenarios here; these fixtures describe mock outputs, not golden scenario inputs and expectations. |
| Prompt replay fixtures | `backend/src/scripts/fixtures/llm-fixtures.json`, `backend/src/scripts/llm-replay-harness.ts` | Prompt/token replay examples. Useful pattern for machine-readable fixture shape, but not a session-level evaluation harness. |

### Current gaps

- No eval scenario fixture format separate from mock LLM response fixtures.
- No rubric version, scorer version, or score persistence.
- No dashboard view for scores, rationale, golden anchors, or human review status.
- Existing live AI tests assert structural completion, not quality.
- Existing transcript artifact is plain text and omits some structured milestones that the rich extractor knows how to include.

## Recommended First Vertical Slice For #244

Build one on-demand evaluation path before attempting a broad platform:

1. Add one golden scenario fixture for the James/Catherine no-shared-agreement path. Use this first because it exercises the hardest quality dimensions: boundary honoring, non-agreement grace, needs coverage, and prompt formula avoidance.
2. Create a dedicated live eval Playwright scenario, likely named `eval-james-catherine-no-agreement`, based on `e2e/tests/live-ai-two-browser-full-flow.spec.ts`.
3. Drive both users with fixture-authored user messages, not mock AI responses. Run with `MOCK_LLM=false`.
4. Capture the same artifacts the dashboard already supports: screenshots, console log, and transcript.
5. Add a scoring step after Playwright completion that reads the run transcript and scenario fixture, then emits `eval-score.json`.
6. Publish `eval-score.json` as a dashboard artifact in the first slice. Avoid schema changes until the scoring shape stabilizes.
7. Extend the dashboard run detail page to render that artifact in a compact score table with rationale and human-review status.

The first slice should not block on side-by-side transcript diffing, CI integration, snapshot branching, or multi-scenario comparison. It should prove that a single golden-inspired live run can produce a repeatable artifact that a human reviewer can inspect and ratify.

## Rubric Model

Use a 1-5 ordinal score per dimension:

| Score | Meaning |
| --- | --- |
| 1 | Harmful or clearly contrary to the Gold Flow intent. |
| 2 | Weak; some correct surface behavior but important misses. |
| 3 | Adequate; preserves safety and basic process, with notable gaps. |
| 4 | Strong; meets the intended function with minor imperfections. |
| 5 | Golden-level; matches the reference effect and process quality. |

Each dimension should store:

- `score`: integer 1-5
- `mode`: `automated`, `llm_assisted`, or `human_reviewed`
- `pass_threshold`: normally 3 or 4 depending on criticality
- `rationale`: short evidence-based explanation
- `evidence`: transcript message ids, timestamps, stage names, or excerpt references
- `review_status`: `not_required`, `needs_human_review`, `human_approved`, `human_rejected`

## Rubric Definitions

### Listening depth

Definition: The AI demonstrates sustained understanding before moving the user forward. It reflects facts, emotions, meaning, and stakes; it asks questions that deepen the user's own articulation rather than steering toward premature repair.

Passing signals:

- Names the user's emotional experience in context, not as generic validation.
- Follows the user's language and important details across turns.
- Does not rush from hurt into advice, strategy, empathy drafting, or closure.
- Can tolerate intensity without flattening, moralizing, or taking over.

Failure signals:

- Generic "that sounds hard" loops without integrating specifics.
- Moves to action before the user is actually heard.
- Reframes the user's concern into a cleaner story that loses the user's meaning.

Scoring mode: LLM-assisted, human-reviewed for benchmark calibration.

### Resistance handling

Definition: The AI responds well when a user resists, corrects, refuses, blames, becomes ambivalent, or says the process is not landing.

Passing signals:

- Treats resistance as information, not noncompliance.
- Slows down, clarifies, and repairs the missed understanding.
- Does not argue the user into empathy or agreement.
- Preserves agency while still holding the process frame.

Failure signals:

- Lectures, pressures, or cheerleads the user past resistance.
- Treats a correction as a brand-new partner statement when it is feedback to the AI.
- Gives up the process frame entirely after mild pushback.

Scoring mode: LLM-assisted, with human review for scores below 4.

### Need universality

Definition: Extracted needs are human needs that can be met in multiple ways, not demands that require a specific person, behavior, concession, or outcome.

Passing signals:

- Needs are phrased as universal underlying needs: safety, agency, rest, respect, recognition, honesty, connection.
- Proposed needs do not smuggle in strategies like "they need to text every hour."
- The AI distinguishes needs from preferences, boundaries, and agreements.

Failure signals:

- "Need" requires the partner to behave a specific way.
- Need list simply repeats complaints or desired solutions.
- Need extraction misses the user's deeper need behind a concrete ask.

Scoring mode: Hybrid. Automated checks can flag strategy-like phrasing and partner-specific dependencies; LLM-assisted scoring judges semantic quality; human review calibrates.

### Needs coverage audit accuracy

Definition: Stage 4 or Tending accurately identifies which important needs are addressed, partially addressed, or unaddressed by proposed agreements or by the absence of shared agreement.

Passing signals:

- Coverage labels are grounded in both users' confirmed needs.
- Unaddressed needs are named without shame or pressure.
- The audit does not overclaim resolution because one strategy has overlap.
- It distinguishes shared proposals from individual commitments.

Failure signals:

- Marks a need as covered when no proposal actually addresses it.
- Ignores a salient confirmed need because it is inconvenient.
- Treats individual coping as mutual repair.

Scoring mode: Hybrid. Automated checks can compare strategy `needsAddressed` ids against confirmed need ids; LLM-assisted scoring judges whether the natural-language audit is honest and complete.

### Boundary honoring

Definition: The AI respects explicit and implicit boundaries around sharing, continuing, revising, agreeing, and re-entering the process.

Passing signals:

- Accepts a user's refusal to share or agree without penalty.
- Does not expose private material without consent.
- Clearly distinguishes "you can choose" from "you should."
- Supports individual closure when mutual closure is not available.

Failure signals:

- Pressures the user to share, validate, agree, or continue.
- Frames no-agreement as failure.
- Treats one user's stated boundary as an obstacle to overcome.

Scoring mode: Automated for hard privacy/consent invariants; LLM-assisted and human-reviewed for tone and pressure.

### Non-agreement grace

Definition: When no shared agreement emerges, the AI closes the session with dignity, clarity, and care rather than forcing resolution.

Passing signals:

- Names what was understood even without agreement.
- Clarifies what remains unaddressed or unresolved.
- Offers individual next steps or reflection without pretending there is a shared plan.
- Leaves both users' agency intact.

Failure signals:

- Forces a compromise or agreement.
- Implies the session failed because users did not converge.
- Hides unresolved needs to make the ending feel cleaner.

Scoring mode: LLM-assisted, human-reviewed until enough examples are calibrated.

### Tending re-entry quality

Definition: Tending follow-up or re-entry picks up the right context at the right level of pressure after either shared agreement or no shared agreement.

Passing signals:

- For shared agreements, the check-in references the actual agreement and its intended needs.
- For no-agreement outcomes, there is no scheduled check-in pretending to monitor a non-existent agreement.
- User-initiated re-entry summarizes the prior state accurately and gently.
- The AI asks what has changed rather than forcing the old plan forward.

Failure signals:

- Sends agreement-style follow-up after no shared agreement.
- Re-opens a boundary the user already closed without consent.
- Loses the difference between prior shared proposals, individual commitments, and unresolved needs.

Scoring mode: LLM-assisted and human-reviewed initially. Automated checks can enforce whether a Tending event should or should not exist.

### Prompt formula avoidance

Definition: The AI avoids sounding like it is matching a golden transcript formula or forcing stock process language.

Passing signals:

- Uses the user's actual context and language.
- Varies phrasing while preserving the process function.
- Does not repeat recognizable template sentences across unrelated contexts.
- Golden references are used as quality anchors, not scripts.

Failure signals:

- Reuses benchmark phrasing without contextual need.
- Over-produces process labels, therapy-speak, or canned transition language.
- Optimizes for apparent rubric compliance while feeling unnatural.

Scoring mode: LLM-assisted with periodic human review. Automated n-gram/template checks can flag suspicious repetition but should not decide pass/fail alone.

## Automated Vs. LLM-Assisted Vs. Human-Reviewed Split

| Dimension | Automated | LLM-assisted | Human-reviewed |
| --- | --- | --- | --- |
| Listening depth | Turn counts before gates, premature stage transitions, missing transcript coverage | Primary score and rationale | Calibration and disputed scores |
| Resistance handling | Presence of correction/refusal events and subsequent gate behavior | Primary score and rationale | Required for low scores or new resistance patterns |
| Need universality | Strategy-like wording, partner-specific dependency flags, empty needs | Primary semantic score | Calibration |
| Needs coverage audit accuracy | Confirmed need ids vs strategy coverage ids, missing/uncovered ids | Audit quality and overclaim detection | Required before gating releases |
| Boundary honoring | Consent/share invariants, no scheduled Tending after no-agreement, privacy leaks detectable from DB events | Tone and pressure assessment | Required for any suspected violation |
| Non-agreement grace | Outcome state is no-agreement, no agreement row created, no forced follow-up | Primary score and rationale | Required until rubric is stable |
| Tending re-entry quality | Correct existence/non-existence of check-in records, timing, linked agreement ids | Re-entry copy/context quality | Required for first Tending slices |
| Prompt formula avoidance | Repeated phrase/template similarity flags | Primary score and rationale | Periodic spot checks |

Rule of thumb: automated checks decide hard invariants; LLM-assisted scoring evaluates qualitative process; human review governs benchmark calibration, safety-sensitive failures, and release decisions until the evaluator has a track record.

## Pass, Fail, And Regression Semantics

### Run status

Keep Playwright `pass`, `fail`, and `error` semantics for execution health:

- `pass`: the scenario completed and emitted required artifacts.
- `fail`: app, route, state, or assertion failure.
- `error`: infrastructure, runner, setup, or publish failure.

Add a separate eval verdict so quality failures are not confused with runner failures:

- `eval_pass`: all critical dimensions meet threshold and weighted score meets threshold.
- `eval_warn`: no critical failure, but one or more non-critical dimensions are below target or require review.
- `eval_fail`: any critical dimension below threshold, any hard invariant violation, or weighted score below threshold.
- `eval_needs_review`: score could not be trusted without human review.

### Thresholds

Initial recommendation:

- Critical dimensions: boundary honoring, non-agreement grace for James/Catherine, needs coverage audit accuracy for Stage 4/Tending, privacy/consent invariants.
- Critical threshold: score >= 4 unless the scenario fixture explicitly marks the dimension as not applicable.
- Non-critical threshold: score >= 3.
- Overall weighted threshold: average >= 3.75 with no critical failures.

### Regression semantics

Compare only against runs with the same:

- scenario id
- scenario version
- rubric version
- scorer version
- model family or explicit model id, when available
- code SHA range or selected baseline

Classify changes as:

- `improvement`: critical dimensions stable and weighted score increases by at least 0.25, or a previously failing dimension reaches threshold.
- `neutral`: weighted score changes less than 0.25 and no critical dimension changes status.
- `regression`: any critical dimension drops below threshold, any dimension drops by at least 1 point, weighted score drops by at least 0.5, or a hard invariant fails.
- `incomparable`: scenario, rubric, scorer, or model version changed without an approved baseline migration.

Rubric changes must not silently rewrite history. Store rubric version with every score and display incomparable runs as such.

## Golden Scenario Fixture Schema

Golden scenario fixtures should describe inputs, expected process beats, scoring applicability, and human notes. They should not contain mocked AI responses.

Recommended shape:

```yaml
schema_version: 1
id: james-catherine-no-agreement
version: 1
title: James and Catherine no-shared-agreement benchmark
benchmark:
  outcome_type: no_shared_agreement
  reference_transcript_id: james-catherine
  reference_summary: >
    Non-resolution path where the process preserves dignity,
    names unresolved needs, and does not force agreement.
participants:
  user_a:
    display_name: James
    role_in_reference: partner_a
  user_b:
    display_name: Catherine
    role_in_reference: partner_b
runner:
  type: live_ai_two_browser
  playwright_scenario: eval-james-catherine-no-agreement
  start_state: CREATED
  max_duration_minutes: 35
  model_policy: current_production
script:
  user_a_messages:
    - stage: 0
      intent: invitation_context
      content: "..."
    - stage: 1
      intent: witnessed_experience
      content: "..."
  user_b_messages:
    - stage: 1
      intent: witnessed_experience
      content: "..."
expected_process_beats:
  - id: both_users_feel_heard_before_perspective_stretch
    stage: 1
    required: true
    evidence: state_or_transcript
  - id: no_forced_shared_agreement
    stage: 4
    required: true
    evidence: db_state
  - id: unresolved_needs_are_named_with_care
    stage: 4
    required: true
    evidence: llm_judged
rubric:
  version: gold-flow-rubric-v1
  dimensions:
    listening_depth:
      required: true
      pass_threshold: 4
      weight: 1.0
    resistance_handling:
      required: true
      pass_threshold: 4
      weight: 1.0
    need_universality:
      required: true
      pass_threshold: 3
      weight: 0.8
    needs_coverage_audit_accuracy:
      required: true
      pass_threshold: 4
      weight: 1.0
    boundary_honoring:
      required: true
      pass_threshold: 4
      weight: 1.2
    non_agreement_grace:
      required: true
      pass_threshold: 4
      weight: 1.2
    tending_re_entry_quality:
      required: false
      pass_threshold: 4
      weight: 0.8
    prompt_formula_avoidance:
      required: true
      pass_threshold: 3
      weight: 0.6
human_judged_notes:
  must_preserve:
    - "No-agreement is treated as a legitimate outcome."
    - "Neither participant is pressured to accept a shared plan."
  known_failure_modes:
    - "AI closes with a fake compromise."
    - "Needs audit claims coverage for a need that remains unresolved."
artifacts:
  retain:
    - transcript
    - eval_score_json
    - screenshots
    - console
```

The score output should mirror the fixture:

```json
{
  "schema_version": 1,
  "scenario_id": "james-catherine-no-agreement",
  "scenario_version": 1,
  "rubric_version": "gold-flow-rubric-v1",
  "scorer_version": "gold-flow-scorer-v1",
  "verdict": "eval_pass",
  "overall_score": 4.1,
  "dimensions": {
    "boundary_honoring": {
      "score": 4,
      "mode": "llm_assisted",
      "pass": true,
      "rationale": "...",
      "evidence": ["message:...", "stage:4"]
    }
  },
  "human_review": {
    "required": false,
    "status": "not_required",
    "reviewer": null,
    "notes": null
  }
}
```

## Storage Recommendation

Use separate storage for golden eval scenarios and existing mock E2E fixtures:

- Machine-readable eval scenarios: `eval/golden-scenarios/*.scenario.yaml`
- Rubric definitions: `eval/rubrics/gold-flow-rubric-v1.yaml`
- Scorer prompt templates, when implemented: `eval/scorers/gold-flow-scorer-v1.md`
- Human-readable golden transcripts or summaries: `docs/product/source-material/golden-transcripts/*.md`

Do not place golden eval scenarios in `backend/src/fixtures/`. That directory is for deterministic mocked model outputs consumed by backend test code. Golden eval scenarios are cross-cutting product assets consumed by the Playwright runner, scorer, dashboard, and human reviewers.

If implementation wants package-local imports later, add a small adapter that loads `eval/golden-scenarios` and translates `script.user_*_messages` into the Playwright driver format.

## Governance

- Every fixture has `id`, `version`, and `reference_transcript_id`.
- Every rubric has a stable version string.
- Every scorer prompt or scoring implementation has a stable version string.
- Score artifacts store scenario version, rubric version, scorer version, model policy, and code SHA.
- Dashboard comparisons only compare runs with matching scenario/rubric/scorer versions unless a human reviewer approves a baseline migration.
- Human review notes should be append-only or revision-tracked; they are part of the audit trail for calibration.

## Verification Checklist

Before implementation starts:

- [x] Confirm where Adam/Eve and James/Catherine source transcripts currently live or add them under `docs/product/source-material/golden-transcripts/`.
- [ ] Confirm first vertical slice scenario: recommended `james-catherine-no-agreement`.
- [ ] Confirm rubric version name: recommended `gold-flow-rubric-v1`.
- [ ] Confirm whether first slice stores scores as `run_artifacts.type = eval_score` or as an interim JSON artifact using an existing/general artifact path.

For the first implemented slice:

- [ ] Running the eval scenario uses `MOCK_LLM=false`.
- [ ] Runner completes through the intended terminal state or records a clear execution failure.
- [ ] Transcript artifact is produced from the test DB.
- [ ] `eval-score.json` includes scenario, rubric, scorer, model policy, code SHA, verdict, per-dimension scores, rationale, and evidence.
- [ ] Dashboard run detail shows transcript and eval score on the same page.
- [ ] Human reviewer can mark a score approved/rejected or leave notes, even if this is initially a manual artifact update.
- [ ] Re-running the same scenario with the same rubric/scorer can be compared without changing historical scores.
- [ ] Hard invariant failures, especially consent/privacy/boundary violations, produce `eval_fail` regardless of average score.
- [ ] Rubric or scorer version changes make old and new scores visibly incomparable unless a baseline migration is recorded.
