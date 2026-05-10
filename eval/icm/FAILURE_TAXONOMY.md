# Failure Taxonomy

Route every failure to exactly one primary owner. Additional related owners may be listed as secondary context, but the repair plan must name one primary owner.

## Owners

- `product_code`: UI state, visible text leakage, access control, seeding, state machine, backend behavior.
- `mwf_prompts`: pacing, tone, stage behavior, formulaic language, boundary handling.
- `actor_skill`: persona too soft, too articulate, too compliant, wrong side, copied gold.
- `eval_harness`: transcript extraction, invariant gaps, run orchestration, mock or real LLM mode, process cleanup.
- `scorer`: rubric application, score inconsistency, missing evidence, wrong `not_evaluable` decision.
- `reporter`: missing or unclear synthesis.
- `human_decision`: policy change, rubric weakening, ambiguous product intent, credentials or cost blocker.

## `not_evaluable_for_prompt_quality`

Use `not_evaluable_for_prompt_quality` only when prompt quality cannot be judged because the run artifact is invalid or incomplete. Examples include failed seeding, access failure, transcript extraction failure, browser orchestration failure, missing score data, or scorer failure.

Do not use it to hide weak prompt behavior, product regressions, actor difficulty, or failed hard invariants.
