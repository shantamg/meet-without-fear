# Inner Thoughts ICM Context

Use this file to route Inner Thoughts self-improvement work. A full cycle proceeds through stages 01 through 09 in order.

| Task Type | Go To |
|---|---|
| Start or resume a cycle | `stages/01-intake/CONTEXT.md` |
| Classify failures | `stages/02-triage/CONTEXT.md` |
| Plan fixes | `stages/03-repair-plan/CONTEXT.md` |
| Implement fixes | `stages/04-implement/CONTEXT.md` |
| Verify focused behavior | `stages/05-verify/CONTEXT.md` |
| Rerun scenarios | `stages/06-rerun/CONTEXT.md` |
| Judge readiness | `stages/07-judge/CONTEXT.md` |
| Write report | `stages/08-report/CONTEXT.md` |
| Improve eval machine | `stages/09-self-improve/CONTEXT.md` |

## Operating Order

1. Build an artifact index for scenarios, product surfaces, previous runs, and current git state.
2. Route every failure to one primary owner: `product_code`, `mwf_prompts`, `actor_skill`, `eval_harness`, or `none`.
3. Repair the highest-priority blocker first.
4. Verify the repair with focused tests or manual browser evidence before rerunning scenarios.
5. Rerun every live-enabled scenario in `scenarios.json` required for the claim being made.
6. Judge against completion criteria and write the cycle report.
7. Improve this workspace only when artifact evidence shows the eval machine itself was weak.

## Output Discipline

Keep stage outputs current under `stages/<stage>/output/`. Cycle reports belong under `cycles/<cycle-id>/`. Confirmed bugs should become tests, regression records, or explicit tracked exceptions.
