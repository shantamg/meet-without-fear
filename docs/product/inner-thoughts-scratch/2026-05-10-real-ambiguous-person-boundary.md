# Real LLM Scratch: `ambiguous-person-boundary`

Date: 2026-05-10
Runner: Codex
Worktree: `/private/tmp/mwf-inner-thoughts-self-improvement`

## Environment

- Backend: worktree backend on `localhost:3000`
- Backend env: `MOCK_LLM=false`, `NODE_ENV=development`
- Mobile web: worktree E2E app on `localhost:8082`
- Browser session: `mwf-inner-real-boundary`
- User: `inner-real-boundary-user`
- Screenshot: `/tmp/mwf-inner-real-boundary.png`

## Transcript Excerpt

User:

> I keep thinking about my manager, Jordan, but I do not think I want to have a conversation with them yet. It is more that I freeze when they ask for status updates, and I want to understand why I get so guarded.

AI:

> What does freezing feel like for you in those moments?

User:

> My chest tightens and I start trying to sound more certain than I am. Part of it is workplace power dynamics. I worry that if I admit uncertainty, they will think I am not on top of things. I mostly want to sort out my own reaction.

AI:

> What would happen if Jordan did think you weren't on top of things?

User:

> I imagine losing trust, getting watched more closely, and having less room to figure things out. I am not ready to bring this to Jordan. I want to understand what boundary or reassurance I need for myself first.

AI:

> What would it feel like to have room to figure things out -- even if Jordan didn't know you needed it?

## Observations

- Jordan was named, but the AI did not suggest a partner session.
- The user explicitly said they did not want a conversation yet and wanted private reflection.
- The AI stayed with body reaction, workplace power dynamics, internal reassurance, and boundaries.
- No `Suggested next steps` CTA appeared in the visible body text across the run.

## Database Evidence

`InnerWorkSession.cmozex6nz001lpx25h3oik55d`:

- `linkedPartnerSessionId`: empty
- `linkedTrigger`: `voluntary`
- `summary`: `Exploring the gap between workplace uncertainty and the need for internal permission to figure things out.`
- `theme`: `workplace boundaries`

## Judgment

Scenario status: `pass`

This run satisfies the ambiguous-person boundary gate: a named workplace person did not trigger over-routing to a partner session when the user framed the work as private reflection.
