# Completion Criteria

A cycle is complete only when all requirements below are met with actual artifacts.

## Clean Pass

- Every live-enabled scenario in `eval/gold-scenarios.json` passes its configured gate target with `MOCK_LLM=false`.
- Every required bounded loop passes hard invariants.
- Every required bounded loop produces complete transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.
- No run is `not_evaluable_for_prompt_quality` because of seeding, access, transcript extraction, browser orchestration, or scoring failure.
- Confirmed bugs discovered during the cycle have regression coverage or an explicit tracked exception.
- Local test services, browser sessions, and `agent-browser` daemons are cleaned up.
- The final cycle report maps failures, fixes, tests, reruns, scores, invariant status, cleanup status, and remaining risks.

## Required Scenario Set

The required gate is data-driven. Read `eval/gold-scenarios.json` and include every scenario where `live_enabled` is `true` or omitted. Exclude only scenarios with `live_enabled: false`.

Each scenario may define gate settings under `gate`:

- `target_score`
- `stop_after_stage`
- `max_iterations`

If a legacy scenario omits one of these settings, use the current bounded defaults: target score `4.0`, stop after Stage `2`, and max iterations `1`.

## Not A Pass

- A mocked-LLM pass is not a clean pass.
- A summary without cited run artifacts is not a clean pass.
- Passing focused tests without bounded real-LLM reruns is not a clean pass.
- A not-evaluable run cannot establish prompt quality.
