# Tool-Use State Migration Test Plan

## Goal

Verify that persisted AI state is delivered through `update_session_state` tool calls, while chat-visible messages contain only user-facing prose.

This covers:
- Stage 0: `topicFrame`
- Stage 1: `offerFeelHeardCheck`
- Stage 2 / 2B: `offerReadyToShare`, `proposedEmpathyStatement`
- Stage 3: `proposedNeed`, `proposedNeeds`, `needAction`
- Stage 4: `stage4Proposals`, `stage4WalkthroughAction`

Legacy XML tags remain as parser/scrubber fallback only. Prompts should not rely on them for persisted state.

## API Smoke Test

Run the backend and mobile/dev auth setup as usual, then send streaming messages with an authenticated user token:

```bash
curl -N \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:3001/api/sessions/$SESSION_ID/messages/stream" \
  -d '{"content":"Being poked while eating after asking it to stop","emotionalIntensity":5}'
```

Inspect the SSE stream:
- `chunk` events should contain only conversational prose.
- `metadata` / `text_complete` should contain the relevant state fields when the model captures state.
- No visible chunk should contain tool JSON, `<draft>`, `<need>`, `<stage4_proposals>`, or internal planning text.

## Stage-Specific Checks

Stage 0:
- Send enough context to produce a neutral topic.
- Confirm `Session.topicFrame` updates.
- Confirm the AI message body does not contain the topic as a hidden block or JSON payload.

Stage 1:
- Continue until the model offers the feel-heard checkpoint.
- Confirm `StageProgress.gatesSatisfied.feelHeardCheckOffered=true`.
- Confirm no `FeelHeardCheck:` line appears in the saved AI message.

Stage 2 / 2B:
- Continue until an empathy draft is ready.
- Confirm `EmpathyDraft.content` is saved.
- Confirm no `<draft>` block appears in the saved AI message.

Stage 3:
- Name a clear need.
- Confirm an `IdentifiedNeed` row is created for the current user.
- Refine or delete a need and confirm the corresponding need state changes.
- Confirm no `<need>`, `<needs>`, or `<need-action>` block appears in the saved AI message.

Stage 4:
- Offer a concrete proposal for the current need.
- Confirm `StrategyProposal` updates.
- Verbally agree to move on and confirm walkthrough state advances.
- Confirm no `<stage4_proposals>`, `<stage4_walkthrough>`, or `[TOOL CALL: ...]` text appears in the saved AI message.

## Database Spot Checks

```sql
select id, stage, content
from "Message"
where "sessionId" = '$SESSION_ID'
order by "timestamp" desc
limit 10;

select "topicFrame", "topicFrameConfirmedAt"
from "Session"
where id = '$SESSION_ID';

select "gatesSatisfied"
from "StageProgress"
where "sessionId" = '$SESSION_ID'
order by stage;

select "userId", content, "readyToShare", version
from "EmpathyDraft"
where "sessionId" = '$SESSION_ID';

select "forUserId", need, category, description, status
from "IdentifiedNeed"
where "sessionId" = '$SESSION_ID'
order by "createdAt";

select kind, description, "createdByUserId", status, duration, "measureOfSuccess"
from "StrategyProposal"
where "sessionId" = '$SESSION_ID'
order by "createdAt";
```

