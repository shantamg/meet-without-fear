# Cycle Budget Policy

The autonomous loop must have circuit breakers. Cost and iteration limits are safety boundaries, not scoring criteria.

## Defaults

Unless the user or cycle objective sets stricter limits:

- maximum repair iterations per cycle: `3`
- maximum fresh gold-loop reruns per scenario per cycle: `4`
- maximum snapshot replays per snapshot entry per cycle: `3`
- maximum full-flow gates per scenario per cycle: `1`

If a real-LLM quota, credential, or cost limit blocks required reruns, route to `human_decision`.

## Required Reporting

Stage 06 and the final cycle report must record:

- number of fresh runs by scenario;
- number of snapshot replays by snapshot entry;
- number of full-flow gates by scenario;
- any skipped reruns and the owner/blocker;
- whether budget limits stopped the loop.

Do not silently continue with unlimited reruns. If more iterations are needed, stop with a human-decision request that names the evidence and proposed next run.
