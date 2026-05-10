# Real LLM Scratch: `person-to-partner-session`

Date: 2026-05-10
Runner: Codex
Worktree: `/private/tmp/mwf-inner-thoughts-self-improvement`

## Environment

- Backend: worktree backend on `localhost:3000`
- Backend env: `MOCK_LLM=false`, `NODE_ENV=development`
- Mobile web: worktree E2E app on `localhost:8082`
- Browser session: `mwf-inner-real-maya`
- User: `inner-real-maya-user`
- Screenshot: `/tmp/mwf-inner-real-maya.png`

## Inner Thoughts Transcript Excerpt

User:

> I keep replaying a conversation with Maya. She offered feedback on my draft in a meeting and I smiled, but afterward I felt embarrassed and weirdly resentful. I do not want to overreact, but I cannot stop thinking about it.

AI:

> That gap between smiling and what you actually felt -- that's the part that sticks, isn't it? What do you think the embarrassment was about?

User:

> I think it was that she sounded so certain, and everyone turned toward her like she was the grown-up in the room. I felt small. I also know some of her feedback was probably right, which makes it harder to just be angry.

AI:

> So it wasn't just the feedback itself -- it was the way the room responded to her. What did feeling small in that moment mean to you?

User:

> It meant I was afraid people saw me as junior or fragile, even though this project matters to me. I also think I might need to talk with Maya because I do not want this resentment to leak out sideways. I want to understand what I would actually say to her.

AI:

> That awareness -- about not wanting it to leak out sideways -- that matters. What would you need from a conversation with Maya for it to feel worth having?

Suggested action shown:

> Start a session with Maya

## Handoff Evidence

Clicking the suggested action opened:

`http://localhost:8082/session/new?partnerName=Maya&innerThoughtsId=cmozer39v000apx253x4y5efe`

The new-session screen showed:

- `From Inner Thoughts`
- `Exploring embarrassment in a meeting and considering a direct conversation with Maya.`
- First name prefilled as `Maya`

Clicking `Create Session` opened:

`http://localhost:8082/session/cmozeud490014px25t5xy0h50`

The first partner-session screen showed:

> Hey -- I'm here to help you talk with Maya about what's been going on.
>
> What's happening between you two?

## Database Evidence

`InnerWorkSession.cmozer39v000apx253x4y5efe`:

- `linkedPartnerSessionId`: `cmozeud490014px25t5xy0h50`
- `linkedTrigger`: `suggestion_start`
- `summary`: `Exploring embarrassment in a meeting and considering a direct conversation with Maya.`
- `theme`: `workplace relationships`

`Session.cmozeud490014px25t5xy0h50`:

- `status`: `CREATED`
- `type`: `CONFLICT_RESOLUTION`
- first message content referenced Maya.

## Judgment

Scenario status: `pass`

The CTA did not appear merely because Maya was named. It appeared after the user explicitly identified a need to talk with Maya and wanted help clarifying what to say. The handoff preserved `partnerName`, generated context, linked the Inner Thoughts session to the partner session, and started the Stage 0 experience.

## Machine Status

```json
{
  "type": "MWF_INNER_THOUGHTS_STATUS",
  "scenario": "person-to-partner-session",
  "status": "pass",
  "mock_llm": false,
  "browser_session": "mwf-inner-real-maya",
  "scratch_log": "docs/product/inner-thoughts-scratch/2026-05-10-real-person-to-partner-session.md",
  "evidence": {
    "cta_earned_after_named_relationship_processing": true,
    "cta_text": "Start a session with Maya",
    "new_session_url": "http://localhost:8082/session/new?partnerName=Maya&innerThoughtsId=cmozer39v000apx253x4y5efe",
    "generated_context_visible": true,
    "created_partner_session_id": "cmozeud490014px25t5xy0h50",
    "linked_partner_session_id": "cmozeud490014px25t5xy0h50",
    "linked_trigger": "suggestion_start",
    "stage_0_opened": true
  },
  "remaining_for_scenario": []
}
```
