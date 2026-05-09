# Governance

## Change Authority

Product fixes may modify MWF product code, MWF prompts, tests, and harness code when justified by artifacts.

Eval-machine fixes may modify ICM, actors, scorer instructions, reporter templates, invariants, or routing policy only when justified by artifacts.

The system may tighten rubrics, hard invariants, actor difficulty, and completion criteria when evidence shows a gap.

The system may not loosen scoring rubrics, hard invariants, completion criteria, or actor difficulty without explicit human approval.

## Evidence Requirement

Every change must cite at least one concrete evidence item:

- run directory
- transcript path and relevant turn or line reference
- `score.json`
- `invariants.json`
- loop summary
- scratch log
- test failure
- code location

## Reporting Separation

Cycle reports must separate:

- product changes
- MWF prompt changes
- eval-machine changes
- tests and regressions
- remaining risks and human decisions

## Human Approval Required

Stop and ask for human input when the next step would weaken a rubric, hard invariant, completion criterion, or actor difficulty; when product intent is ambiguous; when credentials or real-LLM cost blocks reruns; or when the evidence cannot distinguish product behavior from eval-machine failure.
