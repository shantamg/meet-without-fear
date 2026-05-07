# Completion Criteria

A cycle is complete only when all requirements below are met with actual artifacts.

## Clean Pass

- Adam/Eve bounded loop passes the target score with `MOCK_LLM=false`.
- James/Catherine bounded loop passes the target score with `MOCK_LLM=false`.
- Both bounded loops pass hard invariants.
- Both bounded loops produce complete transcripts, `score.json`, `invariants.json`, loop summary, and scratch logs when relevant.
- No run is `not_evaluable_for_prompt_quality` because of seeding, access, transcript extraction, browser orchestration, or scoring failure.
- Confirmed bugs discovered during the cycle have regression coverage or an explicit tracked exception.
- Local test services, browser sessions, and `agent-browser` daemons are cleaned up.
- The final cycle report maps failures, fixes, tests, reruns, scores, invariant status, cleanup status, and remaining risks.

## Not A Pass

- A mocked-LLM pass is not a clean pass.
- A summary without cited run artifacts is not a clean pass.
- Passing focused tests without bounded real-LLM reruns is not a clean pass.
- A not-evaluable run cannot establish prompt quality.
