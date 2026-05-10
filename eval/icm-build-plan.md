# MWF Gold Loop ICM Build Plan

## Objective

Build `eval/icm/` as a version-controlled control plane for the MWF gold-loop self-improvement system. The ICM workspace must route Codex through intake, triage, repair, verification, rerun, judging, reporting, and self-improvement cycles while preserving the existing Python harness, MWF skills, run artifacts, and git workflow.

## Non-Goals

- Do not replace `scripts/mwf_gold_loop.py`.
- Do not replace the existing `mwf-gold-*` skills.
- Do not weaken scoring, actor difficulty, hard invariants, or completion criteria.
- Do not make the ICM tree a second copy of run artifacts. It should index and route to canonical artifacts.

## Existing System Inventory And Disposition

The ICM build must respect the evaluation system that already exists. Treat ICM as the durable control plane over the existing harness, skills, and artifacts, not as a rewrite.

### Keep As Mechanical Harness

- `scripts/mwf_gold_loop.py`: canonical bounded browser/gold-loop runner. ICM should call it, not replace it.
- `scripts/mwf_moment_eval.py`: existing moment-level evaluator. ICM may reference it for focused prompt/moment checks.
- `scripts/test_mwf_moment_eval.py`: focused harness/invariant tests. Keep and extend when eval-harness regressions are found.
- `backend/scripts/extract-session-transcripts.ts`: transcript extraction tool. ICM may define policies for its output, but should not duplicate the extractor.
- Backend/mobile unit and integration tests: keep as the verification layer for product and harness changes.

### Keep As Specialist Skills

- `mwf-gold-loop-actor`: participant actor module for automated loop sides.
- `mwf-gold-session-scorer`: scoring/judge module.
- `mwf-gold-session-reporter`: synthesis/reporting module.
- `mwf-gold-session-tester`: manual/live browser QA module.
- `mwf-gold-prompt-improver`: prompt/process improvement module.

ICM should route to these skills and name when to use them. It should not duplicate their full instructions.

### Keep As Canonical Evidence

- `docs/product/source-material/golden-transcripts/`
- `eval/gold-profiles/`
- `eval/gold-scenarios.json`
- `eval/moments/`
- `eval/baselines/`
- `eval/scorer/`

ICM should point to these files as canonical sources. It should not copy their contents into stage `CONTEXT.md` files.

### Working Memory, Usually Not Committed

- `eval/runs/`
- `docs/product/gold-session-scratch/`
- `backend/scripts/transcripts/`

ICM cycle reports may link to these artifacts, but raw generated folders should not be committed unless a specific artifact is intentionally promoted into a fixture, regression record, or gold reference.

### Must Formalize In ICM

The ICM workspace must make these process rules explicit as references, stage contracts, templates, or checklists. If a rule already exists in code or a skill, ICM should point to the canonical implementation while documenting the decision policy around it.

- failure routing rules currently embedded in scorer prompts, scratch logs, or loop summaries
- `not_evaluable_for_prompt_quality` policy
- regression policy for hard invariants and product bugs
- completion criteria for bounded gold loops
- cleanup policy for local services, browser sessions, and `agent-browser` daemons
- report templates for cycle summaries and final handoffs
- rules for what gets committed versus left as raw local artifact data
- rules for when to patch product code, MWF prompts, actor skill, scorer, reporter, or eval harness
- rules for when to stop and ask for human input

### Keep In Code Unless There Is A Clear Reason To Move

Keep mechanical execution in scripts and tests unless the ICM build identifies a reviewed reason to change it:

- service startup and shutdown implementation
- browser actor invocation
- transcript extraction implementation
- invariant execution
- score JSON parsing
- focused test execution commands
- git operations and PR creation mechanics

### Review Before Keeping Or Merging

- PR #438 `scripts/mwf_eval_loop.py`: do not merge or treat as canonical as-is. It is a code-heavy alternate orchestrator, overlaps with the ICM idea, and must be reviewed against the existing `mwf_gold_loop.py` CLI and scorer flow before any part is adopted. Use it only as reference material unless explicitly approved.
- PR #432: closed as superseded by the bounded gold-loop calibration pass.

### Discard Or Avoid

- New orchestration that duplicates `scripts/mwf_gold_loop.py` without a clear, reviewed reason.
- A parallel scoring layer that bypasses `mwf-gold-session-scorer` or weakens hard invariants.
- A committed raw run dump that is not explicitly promoted to a fixture, regression record, or gold reference.
- Stage `CONTEXT.md` files that become large content dumps instead of routing contracts.

## Target Structure

```text
eval/icm/
  CLAUDE.md
  CONTEXT.md
  GOVERNANCE.md
  COMPLETION_CRITERIA.md
  FAILURE_TAXONOMY.md
  README.md

  references/
    gold-loop-commands.md
    real-llm-policy.md
    artifact-indexing-policy.md
    scoring-policy.md
    prompt-change-policy.md
    product-change-policy.md
    eval-machine-change-policy.md
    regression-policy.md
    cleanup-policy.md

  stages/
    01-intake/
      CONTEXT.md
      output/.gitkeep
    02-triage/
      CONTEXT.md
      output/.gitkeep
    03-repair-plan/
      CONTEXT.md
      output/.gitkeep
    04-implement/
      CONTEXT.md
      output/.gitkeep
    05-verify/
      CONTEXT.md
      output/.gitkeep
    06-rerun/
      CONTEXT.md
      output/.gitkeep
    07-judge/
      CONTEXT.md
      output/.gitkeep
    08-report/
      CONTEXT.md
      output/.gitkeep
    09-self-improve/
      CONTEXT.md
      output/.gitkeep

  self-improvement/
    README.md
    actor/backlog.md
    judge/backlog.md
    reporter/backlog.md
    harness/backlog.md
    routing/backlog.md
    proposals/.gitkeep

  regressions/
    README.md
    product/.gitkeep
    eval-machine/.gitkeep
    prompts/.gitkeep
    actor/.gitkeep

  cycles/
    .gitkeep
```

## Top-Level Routing

`eval/icm/CLAUDE.md` should answer "where am I?" and include:

- Folder map.
- Rule: read `eval/icm/CONTEXT.md` first.
- Rule: use existing MWF skills as specialist modules.
- Rule: use existing Python scripts for mechanical execution.
- Rule: all outputs go into either stage `output/` or `cycles/<cycle-id>/`.
- Rule: never modify completion criteria, scoring rubrics, or actor difficulty to make a failing run pass.

`eval/icm/CONTEXT.md` should be the task router:

```md
| Task Type | Go To |
|---|---|
| Start or resume a calibration cycle | stages/01-intake/CONTEXT.md |
| Classify failures | stages/02-triage/CONTEXT.md |
| Plan fixes | stages/03-repair-plan/CONTEXT.md |
| Implement fixes | stages/04-implement/CONTEXT.md |
| Verify focused tests | stages/05-verify/CONTEXT.md |
| Rerun bounded loops | stages/06-rerun/CONTEXT.md |
| Judge readiness | stages/07-judge/CONTEXT.md |
| Write cycle report | stages/08-report/CONTEXT.md |
| Improve the eval machine | stages/09-self-improve/CONTEXT.md |
```

## Governance

`GOVERNANCE.md` must say:

- Product fixes may modify MWF product code, prompts, tests, and harness code when justified by artifacts.
- Eval-machine fixes may modify ICM, actors, scorer instructions, reporter templates, invariants, or routing policy only when justified by artifacts.
- The system may tighten rubrics, invariants, and actors.
- The system may not loosen rubrics, hard invariants, completion criteria, or actor difficulty without explicit human approval.
- Every change must cite evidence: run dir, transcript, score JSON, invariant JSON, scratch log, test failure, or code location.
- Prompt changes, product changes, and eval-machine changes must be reported separately.

## Completion Criteria

`COMPLETION_CRITERIA.md` must define a clean pass:

- Adam/Eve bounded loop passes target score with `MOCK_LLM=false`.
- James/Catherine bounded loop passes target score with `MOCK_LLM=false`.
- Both runs pass hard invariants.
- Both runs produce complete transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.
- No run is `not_evaluable_for_prompt_quality` due to seeding, access, transcript extraction, browser orchestration, or scoring failure.
- Confirmed bugs discovered during the cycle have either regression coverage or an explicit tracked exception.
- Local test services and browser processes are cleaned up.
- Final cycle report maps failures, fixes, tests, reruns, scores, and remaining risks.

## Failure Taxonomy

`FAILURE_TAXONOMY.md` must route failures to exactly one primary owner:

- `product_code`: UI state, visible text leakage, access control, seeding, state machine, backend behavior.
- `mwf_prompts`: pacing, tone, stage behavior, formulaic language, boundary handling.
- `actor_skill`: persona too soft, too articulate, too compliant, wrong side, copied gold.
- `eval_harness`: transcript extraction, invariant gaps, run orchestration, mock/real LLM mode, process cleanup.
- `scorer`: rubric application, score inconsistency, missing evidence, wrong `not_evaluable` decision.
- `reporter`: missing/unclear synthesis.
- `human_decision`: policy change, rubric weakening, ambiguous product intent, credentials/cost blocker.

## Stage Contracts

Each stage `CONTEXT.md` must follow ICM's `Inputs / Process / Outputs / Audit` shape.

### `01-intake`

- Inputs: latest `eval/runs/*-loop-summary.md`, latest run dirs, git status, prior cycle report if present.
- Output: `output/latest-artifact-index.md`.
- Audit: every referenced artifact path exists or is marked missing.

### `02-triage`

- Inputs: artifact index, `score.json`, `invariants.json`, transcripts, scratch logs.
- Output: `output/failure-routing.md`.
- Audit: every failure has owner, severity, evidence path, and whether prompt quality is evaluable.

### `03-repair-plan`

- Inputs: failure routing, governance, taxonomy, policies.
- Output: `output/repair-plan.md`.
- Audit: plan fixes highest-priority real blocker first and names tests/regression coverage.

### `04-implement`

- Inputs: repair plan, relevant code/prompt files.
- Output: `output/change-log.md`.
- Audit: every changed file maps to a failure and evidence item.

### `05-verify`

- Inputs: change log, repair plan.
- Output: `output/test-results.md`.
- Audit: focused tests actually cover the changed behavior.

### `06-rerun`

- Inputs: gold-loop commands, real-LLM policy.
- Output: `output/run-results.md`.
- Audit: commands use `MOCK_LLM=false`; both bounded loops are rerun or skipped only with explicit reason.

### `07-judge`

- Inputs: rerun results, score JSON, invariants, completion criteria.
- Output: `output/eval-decision.md`.
- Audit: pass/fail decision cites actual artifacts, not summaries alone.

### `08-report`

- Inputs: all previous stage outputs.
- Output: `output/cycle-report.md` and `cycles/<cycle-id>/cycle-report.md`.
- Audit: report includes run dirs, scores, invariant status, fixes, remaining risks, cleanup status.

### `09-self-improve`

- Inputs: cycle report, missed failures, noisy failures, governance.
- Output: `output/self-improvement-proposals.md`.
- Audit: any proposed eval-machine change says whether it tightens, clarifies, or weakens the system.

## Regression Design

Each confirmed bug gets a file under `eval/icm/regressions/<owner>/`.

Template:

```md
# Regression: <name>

## Bug
What happened.

## Evidence
Run dirs, transcript lines, scratch logs, screenshots, logs.

## Expected Invariant
What must never happen again.

## Coverage
Unit test, integration test, loop invariant, scorer rule, or manual gate.

## Status
active | covered | accepted-risk

## Last Verified
Command or run artifact.
```

## Self-Improvement Design

`self-improvement/` tracks eval-machine improvements separately from product fixes.

A proposal must include:

- Evidence.
- Diagnosis.
- Files to change.
- Whether it tightens or weakens the system.
- Regression coverage.
- Rollback notes.

## Codex Goal Prompt

Use this once `eval/icm/` exists:

```text
Follow eval/icm/CONTEXT.md to run the MWF gold-loop self-improvement cycle. Use the ICM stage contracts as the source of truth. Improve either MWF or the eval machine depending on artifact evidence. Do not weaken completion criteria, scoring rubrics, hard invariants, or actor difficulty without explicit human approval. Add regression coverage for every confirmed bug. Rerun Adam/Eve and James/Catherine bounded loops with real LLM. Repeat until eval/icm/COMPLETION_CRITERIA.md passes or a human decision is required.
```

## Definition Of Done For Building ICM

- `eval/icm/` exists with the structure above.
- Every `CONTEXT.md` has `Inputs`, `Process`, `Outputs`, and `Audit`.
- Top-level routing points to every stage.
- Governance and completion criteria are explicit and non-weakening.
- Failure taxonomy covers all known failure layers.
- Stage audits make completion objectively checkable.
- At least one sample cycle report template exists.
- Existing Python harness and MWF skills are referenced, not duplicated.
- A dry-run Codex goal can read `eval/icm/CONTEXT.md` and know exactly what to do next.

## Verification Checklist For The Builder

Before stopping, verify and report:

- `find eval/icm -type f | sort` matches the required structure or explains any intentional deviation.
- Every `eval/icm/**/CONTEXT.md` contains `## Inputs`, `## Process`, `## Outputs`, and `## Audit`.
- `eval/icm/CONTEXT.md` routes to every stage.
- Every stage output folder contains `.gitkeep`.
- `GOVERNANCE.md` explicitly forbids weakening completion criteria, hard invariants, scoring rubrics, or actor difficulty without human approval.
- `COMPLETION_CRITERIA.md` requires real LLM bounded Adam/Eve and James/Catherine passes.
- `FAILURE_TAXONOMY.md` contains all required owner categories.
- Existing harnesses and skills are referenced, not copied.
- `regressions/README.md` includes the regression template.
- `self-improvement/README.md` includes proposal requirements.
- `eval/icm/README.md` references this plan file as the source build artifact or explains how the implemented workspace supersedes it.
- No raw `eval/runs/`, scratch logs, or generated transcript dumps are committed unless explicitly promoted into fixtures, regression records, or gold references.
