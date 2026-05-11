# Stage 2 Reliability Track 1.5 Plan

Status: proposed follow-up after PR #548
Date: 2026-05-11

## Purpose

PR #548 improved Stage 0-2 gold alignment and merged the Darryl/Shantam gold scenario, prompt guidance, deterministic Stage 2 copy, waiting-state UI fixes, and gold-loop harness updates.

Before the larger context architecture upgrade, do a small reliability PR that removes product-state noise from Stage 2 gold loops:

1. Stage 2 stream timeout / reload recovery.
2. `VALIDATED + CONTEXT_SHARED` share-offer state transition errors.

The goal is not to tune prompts. The goal is to make Stage 2 state and streaming reliable enough that future gold-loop/context work is evaluated on facilitation quality, not transient product-state bugs.

## Starting Evidence

Final James/Catherine run from PR #548:

- Run: `eval/runs/20260511-062632-james-catherine-iter-01`
- Service logs: `eval/runs/20260511-062627-james-catherine-services/backend.log`
- Scratch log: `eval/runs/20260511-062632-james-catherine-iter-01/scratch/2026-05-11-cmp18jqjq0008px5ddpjrlkvp-catherine.md`
- Score: `eval_warn`, `overall_score: 4.0`
- Product reliability target: stream stalled until reload.

Relevant evidence:

```text
[useStreamingMessage] 15s timeout - closing stuck connection
```

Backend service log showed the corresponding SSE requests completed with `200`, suggesting the immediate timeout may be client-side stuck-stream detection, missed cache update, realtime propagation, or UI state not observing the completed DB message.

The same backend log also showed two recovered `500`s:

```text
Invalid empathy state transition: VALIDATED + CONTEXT_SHARED. No valid transition defined for this combination.
```

This happened while accepting a share offer after empathy validation, then the run recovered through the refinement finalize path.

## Non-Goals

- Do not change Stage 1/2 prompt alignment guidance.
- Do not add or remove gold moments.
- Do not implement durable process facts.
- Do not remove regex readiness heuristics here.
- Do not broaden context windows here unless directly required to fix reliability.
- Do not mask backend `500`s in the UI without fixing the state transition.

## Workstream A - Stage 2 Stream Timeout / Reload Recovery

### Questions To Answer

- Did the backend finish generating and persist the AI message before the client timed out?
- Did the SSE stream finish but the frontend fail to append or refetch the message?
- Did the client close the stream at 15s while the backend was still doing useful work?
- Is the 15s timeout too short for current model latency, or is the timeout firing after completion because state did not clear?
- Does reload recover because DB state is correct but client cache is stale?

### Candidate Files To Inspect

Backend:

- `backend/src/controllers/messages.ts`
- streaming response helpers used by `sendMessageStream`
- realtime publish paths after message creation
- message history endpoints used after streaming.

Mobile:

- `mobile/src/hooks/useStreamingMessage.ts`
- chat/message cache update hooks
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/hooks/useStages.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- realtime subscription hooks used for session/message updates.

Eval evidence:

- `eval/runs/20260511-062627-james-catherine-services/backend.log`
- `eval/runs/20260511-062632-james-catherine-iter-01/codex-catherine.jsonl`
- `eval/runs/20260511-062632-james-catherine-iter-01/transcripts/catherine-stage2.md`

### Likely Fix Shape

Prefer one of these, based on diagnosis:

- If backend generation can exceed 15s, make the client timeout reflect model latency reality or reset only when no bytes/events/progress have arrived.
- If backend has completed and persisted the AI message, make timeout recovery automatically refetch messages/state before requiring manual reload.
- If realtime/cache updates are missed, ensure the stream completion path invalidates/refetches the message list and clears local streaming state.
- If the SSE response can finish without a final client-visible event, add or verify a terminal event that the client consumes.

### Acceptance Criteria

- A stream timeout no longer leaves the user stuck until manual reload.
- If a stream times out after the backend persisted a message, the client automatically recovers by refetching and rendering the message.
- If a stream truly fails before persistence, the user sees a retry/error state that does not corrupt stage progress.
- Add at least one focused mobile test or hook test for timeout recovery/refetch behavior.

## Workstream B - `VALIDATED + CONTEXT_SHARED` Transition Error

### Questions To Answer

- Why can a share offer remain actionable after the empathy attempt is already `VALIDATED`?
- Is `CONTEXT_SHARED` valid after `VALIDATED`, or should the action be rejected as stale/idempotent?
- Should accepting share content after validation create only a normal shared-context message without changing empathy attempt state?
- Why did the UI allow two repeated attempts after the first `500`?

### Candidate Files To Inspect

Backend:

- `backend/src/services/empathy-state-machine.ts`
- `backend/src/services/reconciler/sharing.ts`
- `backend/src/controllers/reconciler.ts`
- `backend/src/controllers/stage2.ts`
- `backend/src/routes/__tests__/stage2.test.ts`
- `backend/src/services/__tests__/reconciler.test.ts`

Mobile:

- share offer renderers and accept handlers,
- `mobile/src/hooks/useSharingStatus.ts`,
- pending action/share-offer fetch paths.

### Likely Fix Shape

Prefer explicit state-machine semantics over catch-and-continue:

- If share offers are stale after validation, hide/expire them and return a safe idempotent response.
- If context sharing after validation is legitimate, add an explicit transition or alternate code path that does not try to transition `VALIDATED` to `CONTEXT_SHARED`.
- Ensure duplicate accept attempts are idempotent.
- Ensure the UI does not keep presenting an action that has already become invalid.

### Acceptance Criteria

- No `500` occurs when accepting a share offer after empathy validation.
- Repeated accept attempts are idempotent or return a clear non-500 stale-action response.
- Stage 2 share offers cannot block or corrupt empathy validation/revision flow.
- Add backend tests for `VALIDATED + CONTEXT_SHARED` or the chosen replacement semantics.

## Validation Plan

### Local Tests

Run targeted tests first:

```bash
npm test --workspace backend -- stage2.test.ts reconciler.test.ts stage2-copy.test.ts
npm test --prefix mobile -- getWaitingStatus.test.ts chatUIState.test.ts
```

Add tests for any modified streaming hook, share-offer state machine, or UI action logic.

Then run:

```bash
npm run check --workspace backend
npm run check --prefix mobile
python3 scripts/test_mwf_moment_eval.py
python3 -m py_compile scripts/mwf_gold_loop.py
```

### Real Gold Loop Smoke

At minimum rerun James/Catherine Stage 0-2 because it produced both reliability signals:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario james-catherine \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail
```

If the changes touch shared Stage 2 paths broadly, also run:

```bash
MOCK_LLM=false python3 scripts/mwf_gold_loop.py run \
  --scenario darryl-shantam \
  --stop-after-stage 2 \
  --target-score 4.0 \
  --max-iterations 1 \
  --start-services \
  --no-improve-on-final-fail
```

### Log Checks

After each gold loop, inspect service logs for:

```bash
rg -n "15s timeout|closing stuck|SSE error|Connection error|Invalid empathy state transition|VALIDATED \\+ CONTEXT_SHARED| -> 500" eval/runs/<service-dir>/backend.log eval/runs/<iter-dir>/*.jsonl eval/runs/<iter-dir>/scratch
```

Done means no unrecovered stream timeout and no `VALIDATED + CONTEXT_SHARED` `500`.

## Done Definition

- Stage 2 stream timeout has a diagnosed owner and a tested recovery/fix.
- `VALIDATED + CONTEXT_SHARED` no longer produces backend `500`s.
- James/Catherine Stage 0-2 reaches target without the same product reliability warning.
- Hard invariants pass.
- PR is small enough to review as product reliability, not prompt alignment.
- Remaining risks are documented in the PR body.

## Suggested Branch And PR

Branch:

```bash
git switch main
git pull --ff-only
git switch -c codex/stage2-reliability-track-1-5
```

PR title:

```text
Fix Stage 2 stream and share-offer reliability
```

PR body should include:

- root cause for stream timeout,
- root cause for `VALIDATED + CONTEXT_SHARED`,
- tests added,
- gold-loop run directory,
- log grep showing the old errors are absent.

## Suggested Goal Prompt

Use from repo root:

```text
/goal Follow docs/product/stage-2-reliability-track-1-5-plan.md exactly. Keep this as a small product reliability PR between #548 and the context architecture upgrade. Do not tune prompts or add context architecture changes. Diagnose and fix Stage 2 stream timeout/reload recovery and the VALIDATED + CONTEXT_SHARED share-offer transition error, then validate with focused tests and at least James/Catherine Stage 0-2 real gold loop.
```
