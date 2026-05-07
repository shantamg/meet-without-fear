# MWF Gold Loop ICM Context

Use this file to route the current task. Work through stages in order for a full repair-test-rerun cycle, and jump to a stage only when its inputs already exist.

| Task Type | Go To |
|---|---|
| Start or resume a calibration cycle | `stages/01-intake/CONTEXT.md` |
| Classify failures | `stages/02-triage/CONTEXT.md` |
| Plan fixes | `stages/03-repair-plan/CONTEXT.md` |
| Implement fixes | `stages/04-implement/CONTEXT.md` |
| Verify focused tests | `stages/05-verify/CONTEXT.md` |
| Rerun bounded loops | `stages/06-rerun/CONTEXT.md` |
| Judge readiness | `stages/07-judge/CONTEXT.md` |
| Write cycle report | `stages/08-report/CONTEXT.md` |
| Improve the eval machine | `stages/09-self-improve/CONTEXT.md` |

## Operating Order

1. Start at intake and build an artifact index.
2. Route every failure to exactly one primary owner with evidence.
3. Plan the highest-priority real blocker first.
4. Implement only changes justified by artifacts.
5. Verify focused behavior before rerunning full bounded loops.
6. Rerun Adam/Eve and James/Catherine with `MOCK_LLM=false`, unless a human-decision blocker is recorded.
7. Judge against `COMPLETION_CRITERIA.md`.
8. Write a cycle report and promote only durable records.
9. Propose eval-machine improvements separately from product fixes.

## Canonical Execution Layer

- Bounded loop runner: `scripts/mwf_gold_loop.py`.
- Moment evaluator: `scripts/mwf_moment_eval.py`.
- Moment tests: `scripts/test_mwf_moment_eval.py`.
- Transcript extractor: `backend/scripts/extract-session-transcripts.ts`.
- Specialist skills: `mwf-gold-loop-actor`, `mwf-gold-session-scorer`, `mwf-gold-session-reporter`, `mwf-gold-session-tester`, and `mwf-gold-prompt-improver`.

This ICM tree defines decision policy and audit contracts. It does not replace the mechanical harnesses or specialist skills.

## Inputs

- User goal or cycle objective.
- Current repository state.
- Existing stage outputs, if resuming.
- Canonical artifacts and working-memory artifacts named by the relevant stage.

## Process

Select the matching task type from the routing table, then follow that stage contract. For a complete cycle, proceed through stages 01 through 09 in order.

Keep decision policy in ICM and mechanical execution in existing scripts and specialist skills.

## Outputs

- Stage-specific files under `stages/<stage>/output/`.
- Final cycle reports under `cycles/<cycle-id>/`.
- Promoted regression records under `regressions/<owner>/` when confirmed bugs need durable tracking.

## Audit

Before claiming completion, verify the relevant stage audits and the clean-pass requirements in `COMPLETION_CRITERIA.md`. Do not rely on summaries alone when artifact evidence is required.
