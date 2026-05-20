# MWF Context Architecture Upgrade Plan

Status: proposed Track 2 follow-up to PR #548 and Track 1.5 reliability work
Date: 2026-05-11

## Purpose

PR #548 explored Stage 0-2 gold alignment work, prompt guidance, deterministic Stage 2 copy, waiting-state fixes, and gold-loop harness improvements.

Important update: the AI-generated Darryl/Shantam transcript from that work is not an accepted gold target. Do not use Darryl/Shantam as required validation, do not tune prompts to improve its score, and do not run self-improvement loops against it until humans revise and approve that transcript. This plan should validate against the accepted Adam/Eve and James/Catherine gold references plus prompt-log/context evidence.

This plan is the separate follow-up PR that replaces the bootstrapping pieces in #548 with a cleaner context architecture:

- more complete current-user conversation context,
- durable process facts,
- prompt adaptation based on explicit state rather than regex heuristics,
- and Stage 2 validation across Adam/Eve and James/Catherine.

Do not add this work to #548 or the Track 1.5 reliability PR. Keep it as a separate branch/PR so reviewers can evaluate the architecture change independently.

## Branch And Commit Discipline

Start from a fresh `main` after #548 and the Stage 2 Track 1.5 reliability PR have merged, unless Shantam explicitly tells you to proceed before Track 1.5 lands.

Use:

```bash
git switch main
git pull --ff-only
git switch -c codex/mwf-context-architecture-upgrade
```

Commit incrementally. Do not wait until the end to create one giant commit.

Required commit milestones:

1. Full current-user context through Stage 2.
2. Stage 3+ prior-stage summary plus current-stage full context.
3. Durable process facts persisted and injected.
4. Runtime regex readiness/conflict heuristics removed from `stage-prompts.ts`.
5. Validation/docs updates and final run artifact references.

Each milestone commit should include focused tests for that milestone, or a progress note explaining the blocker and why it is safe to continue. If a milestone needs to be split into smaller commits, do that.

Maintain a progress doc:

```text
docs/product/mwf-context-architecture-upgrade-progress.md
```

Track:

- branch and commit hashes,
- files changed per milestone,
- decisions and rejected approaches,
- tests run,
- gold-loop run directories,
- prompt-log evidence,
- residual risks.

## Non-Goals

- Do not rewrite the full memory system.
- Do not change privacy boundaries between partner tracks.
- Do not inject the partner's private raw transcript before consent.
- Do not tune one gold scenario at the expense of the others.
- Do not use Darryl/Shantam as an accepted gold target until that transcript has human approval.
- Do not add new regex heuristics to replace the old regex heuristics.

## Design Principles

- Runtime prompts should see enough current-user context to understand the stage arc, not just a tiny recent window.
- Topic frame, notable facts, process facts, and consent/share state should remain separate sections so the model can distinguish "what happened in the process" from "what is true about the user."
- Process facts are a durable facilitation state layer: they capture constraints like low knowledge, rejected premise, strategy blocked, or process frustration.
- The model should adapt from context and process facts. Regex can be useful for tests or migration checks, but it should not be the main runtime classifier for readiness or conflict type.
- Full-context expansion is only for the current user's track. Partner-private material remains unavailable unless consented/shared.

## Track 1 Dependency

Merge or intentionally supersede #548 before starting this work.

Prefer also merging the Track 1.5 Stage 2 reliability PR before starting, because stream timeout and share-offer state-transition bugs can contaminate architecture-loop results. If Track 1.5 has not merged, explicitly document the risk and do not tune architecture decisions around flaky Stage 2 product-state behavior.

Known Track 1 tech debt this plan addresses:

- `stage-prompts.ts` contains regex readiness/conflict heuristics such as concrete-topic, bounded-concrete-empathy, relational-resistance, and high-conflict-volatility signals.
- Stage 2 routing includes a blunt `hasSignificantGapsA/B = false` reveal-first rule that may be acceptable as a short-term repair but should be revisited with better process state.
- Stage prompts still rely too much on prompt-local inference rather than durable process facts.

## Step 1 - Full Current-User Context Through Current Stage

### Objective

Remove the narrow recent-turn window as the main continuity mechanism for early stages.

### Requirements

- Through Stage 2, include all current-user-track messages from Stage 0 onward.
- Stage 3 and later should include:
  - all current-stage current-user messages,
  - a generated summary of prior stages,
  - topic frame,
  - notable facts,
  - process facts,
  - consent/share state.
- Do not include partner-private raw messages unless they have been consented/shared into this user's view.
- Preserve existing context sections instead of flattening everything into one transcript blob.

### Candidate Files To Inspect

- `backend/src/services/context-assembler.ts`
- `backend/src/services/stage-prompts.ts`
- `backend/src/controllers/messages.ts`
- `backend/src/controllers/stage2.ts`
- tests around context assembly and prompt rendering.

### Acceptance Criteria

- Stage 1 and Stage 2 prompt logs make the full current-user track auditable.
- Stage 3+ prompt logs include full current-stage context plus prior-stage summary.
- Existing privacy tests still pass.
- No partner-private raw track appears in the wrong user's prompt.

## Step 2 - Add Durable Process Facts

### Objective

Persist facilitation process facts separately from biographical/emotional notable facts, then inject them into prompts as a distinct section.

### Initial Categories

- `strategy_blocked`: a prompt strategy is not working or the user rejected the framing.
- `low_knowledge`: user cannot responsibly infer the partner's hidden inner state.
- `rejected_premise`: a partner or validation feedback rejected a core premise.
- `process_frustration`: user is frustrated by the app/process/repeated questions.
- `frame_shift`: new fact, confession, correction, or disclosure changes the topic frame.

Optional later categories:

- `repeat_rejection`
- `concrete_need_ready`
- `transition_risk`

### Requirements

- Define a process-fact data shape with category, fact text, source stage, source message id or turn id, confidence, and privacy scope.
- Persist process facts in the existing notable-facts path if that is the simplest safe route, or in a clearly separated process-facts store if existing schema makes mixed categories ambiguous.
- Inject process facts into prompts under a separate `PROCESS FACTS` or equivalent heading.
- Process facts must be current-user scoped unless they came from consented/shared partner content.

### Capture Strategy

Prefer a structured model-produced signal over runtime regex:

- Update the prompt contract so the model can mark process facts in `<thinking>` using a structured plain-line format.
- Parse and persist only allowed process-fact categories.
- Ignore unsupported categories rather than letting arbitrary model text become trusted process state.
- Keep the user-visible response free of process-fact syntax.

### Candidate Files To Inspect

- `backend/src/services/partner-session-classifier.ts`
- notable-facts persistence and retrieval code.
- `backend/src/services/stage-prompts.ts`
- `backend/src/utils/micro-tag-parser.ts`
- `backend/src/controllers/messages.ts`
- tests for notable facts/classification/context assembly.

### Acceptance Criteria

- A user saying "I do not know what is going on for him" can produce a persisted `low_knowledge` process fact.
- A user saying "that feels like guessing too much" can produce `strategy_blocked` or `low_knowledge`.
- Validation feedback rejecting a premise can produce `rejected_premise`.
- Process facts appear in subsequent prompt logs as a separate section.
- Process facts do not leak partner-private content across users.

## Step 3 - Remove Runtime Regex Heuristics From Stage Prompts

### Objective

Replace regex-driven readiness/conflict classification in `stage-prompts.ts` with context/process-fact-driven instructions.

### Remove

Delete runtime regex blocks such as:

- `hasConcreteTopicSignal`
- `boundedConcreteEmpathy`
- `relationalResistance`
- `highConflictVolatility`
- other readiness/conflict-type branches based on `latestUserTurn` keyword matching.

### Keep

Keep the general facilitation principles added in #548:

- disputed-fact neutrality,
- concrete boundary conflict sufficiency,
- relational/identity pacing,
- safety/volatility/diagnosis pacing,
- process-praise restraint,
- understanding-only, not commitments.

### Replace With

- Prompt guidance that tells the model to read the full current-user stage context and process facts.
- Explicit instructions such as:
  - If `low_knowledge` is present, do not demand hidden-state speculation.
  - If `strategy_blocked` or `process_frustration` is present, change tactics rather than rephrasing the same prompt.
  - If `rejected_premise` is present, do not resend a draft built on that premise.
  - If full context shows a concrete-boundary conflict, observational empathy can be sufficient.
  - If full context shows relational identity or safety/volatility conflict, do not draft from one shallow recognition.

### Acceptance Criteria

- `backend/src/services/stage-prompts.ts` has no runtime regex readiness heuristics for Stage 0/2 conflict classification.
- Prompt text still contains general alignment principles.
- Tests no longer assert behavior through keyword regex branches; they assert behavior through supplied process facts and full context.

## Step 4 - Validate With Gold Loop

### Required Local Checks

Run focused tests for changed code, then broad checks:

```bash
python3 scripts/test_mwf_moment_eval.py
python3 -m py_compile scripts/mwf_gold_loop.py
python3 -m unittest scripts/test_mwf_gold_loop.py
npm run check --workspace backend
npm run check --prefix mobile
```

Add backend tests for:

- context assembly includes full current-user Stage 0-2 history,
- Stage 3+ uses summary plus current-stage full context,
- process facts persist and render,
- partner-private content does not leak,
- Stage 2 adaptation can be driven by process facts without regex heuristics.

### Required Real Gold Loops

Run the accepted gold references through Stage 2:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario adam-eve \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail

MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario james-catherine \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail
```

Darryl/Shantam is out of scope for required validation until humans revise and approve that gold transcript. If a Darryl/Shantam run is useful as diagnostic evidence for low-knowledge or concrete-conflict behavior, record it as non-blocking evidence only. Do not use its score as a release gate and do not patch prompts just to improve that score.

### Specific Human Review Questions

- Does Adam/Eve still get sufficient relational identity pacing?
- Does James/Catherine still avoid premature diagnostic/impact-heavy drafts?
- Does full context make the model more coherent, or does it overfit to old turns?
- Do process facts improve course correction without exposing private partner content?

## Done Definition

- Full current-user context is available through Stage 2.
- Stage 3+ context uses current-stage full messages plus prior-stage summary.
- Process facts persist and render separately in prompts.
- Stage 2 readiness/conflict runtime regex heuristics are removed from `stage-prompts.ts`.
- Adam/Eve and James/Catherine Stage 0-2 gold scenarios score `>= 4.0`.
- No hard invariants fail.
- The PR body includes before/after prompt-log evidence showing process facts driving adaptation.
- `docs/product/mwf-context-architecture-upgrade-progress.md` lists milestone commits, validation commands, run directories, and residual risks.
- The branch has incremental commits corresponding to the milestone sequence above.

## Suggested PR Framing

Title:

```text
Upgrade MWF prompt context with durable process facts
```

Reviewer focus:

- privacy boundaries,
- prompt-token/cost impact,
- process-fact persistence shape,
- removal of regex heuristics,
- whether gold-loop behavior is preserved or improved.

## Suggested Next Goal Prompt

Use from repo root:

```text
/goal Follow docs/product/mwf-context-architecture-upgrade-plan.md exactly.
```
