# Gold Session Scratch Log

Date: 2026-05-05
Session ID: `cmota0eil0008y5fxvnmlzjmj`
Assigned side: Adam
Scenario: Adam/Eve
Browser URL: `http://localhost:8082/session/cmota0eil0008y5fxvnmlzjmj?e2e-user-id=cmorpyyqi0002pxnt18abhy7t&e2e-user-email=adam@e2e.test`

## Timeline

## Findings

### Adam UI missed latest AI message until recovery

- Stage: Your Story
- Type: realtime
- Status: suspected
- What happened: After Adam answered what happens when he shuts down, the browser thread showed Adam's message but did not render the next MWF reply after waiting.
- Evidence: `backend/scripts/check-session-messages.ts cmota0eil0008y5fxvnmlzjmj` showed AI message `cmota4179001jy5fxd6n9yf75` at `2026-05-05T23:48:09.622Z`; browser snapshot still ended at Adam's prior user message. Console also showed `[useStreamingMessage] 15s timeout - closing stuck connection`.
- Expected: Adam's assigned browser should render AI replies from DB/realtime without requiring manual recovery.
- Likely fix: Inspect chat message cache/realtime handling around `useStreamingMessage`, `useAIMessageHandler`, and session message refetch after stream timeout.

### Internal feel-heard marker rendered to Adam

- Stage: Your Story
- Type: UI
- Status: confirmed
- What happened: The MWF message at Adam's feel-heard gate displayed the raw marker `<feel_heard>Y</feel_heard>` before the user-facing sentence.
- Evidence: Browser snapshot showed `<feel_heard>Y</feel_heard> Yeah. That's a lot to carry alone...` immediately above the `I feel heard` CTA.
- Expected: Internal prompt/control markers should be stripped before rendering chat content.
- Likely fix: Strip or parse internal control tags before message persistence/rendering in the AI response pipeline.
