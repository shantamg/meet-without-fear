# Run Inner Thoughts Self-Improvement

Run the Inner Thoughts self-improvement cycle until `COMPLETION_CRITERIA.md` passes or a human decision is required.

## Required Loop

1. Read `CONTEXT.md`.
2. Run Stage 01 intake.
3. Run Stage 02 triage.
4. Run Stage 03 repair plan.
5. Implement the highest-priority artifact-backed fix.
6. Run focused verification.
7. Rerun affected scenarios with real product behavior and `MOCK_LLM=false` unless the stage explicitly records a human-approved exception.
8. Judge against `COMPLETION_CRITERIA.md`.
9. Write reports.
10. Improve this eval machine when the cycle exposes actor, browser, artifact, scoring, routing, or reporting weaknesses.
11. Repeat until completion criteria pass or governance says to stop.

## Required Evidence

Every product, prompt, or eval-machine change must cite at least one concrete artifact: run directory, transcript, actor scratch log, screenshot, browser log, backend log, failing test, code location, stage output, or regression record.

## Stop Only When

- `COMPLETION_CRITERIA.md` passes.
- `GOVERNANCE.md` requires human input.
- A blocker prevents execution after reasonable diagnosis, and the report names the blocker, evidence, attempted fixes, and next action.

Clean up local services and browser sessions started by the cycle before stopping.
