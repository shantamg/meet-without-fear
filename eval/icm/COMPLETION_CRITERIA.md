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

Each scenario may define a legacy/default gate under `gate`:

- `target_score`
- `stop_after_stage`
- `max_iterations`
- `mode`

Each scenario may also define multiple entries under `gates`. A gate is required for bounded clean pass when `required_for_clean_pass` is `true` or omitted. Optional gates are used for targeted verification and all-stage readiness, but do not block the bounded clean pass unless marked required.

Supported gate modes are defined in `references/stage-coverage-policy.md`:

- `fresh_gold_loop`
- `snapshot_replay`
- `seed_target_stage`
- `full_flow_gate`

If a legacy scenario omits settings, use the current bounded defaults: mode `fresh_gold_loop`, target score `4.0`, stop after Stage `2`, and max iterations `1`.

## All-Stage Readiness

The current clean pass can be bounded to Stage 2 when required gates are bounded. Do not claim all-stage readiness unless every live-enabled scenario has at least one `full_flow_gate` and every such gate has passed with `MOCK_LLM=false`, hard invariants, complete artifacts, and no `not_evaluable_for_prompt_quality` blocker.

## Not A Pass

- A mocked-LLM pass is not a clean pass.
- A summary without cited run artifacts is not a clean pass.
- Passing focused tests without bounded real-LLM reruns is not a clean pass.
- A not-evaluable run cannot establish prompt quality.
- A snapshot replay does not replace a fresh required gate unless the gate explicitly says so or a human-approved exception is recorded.
