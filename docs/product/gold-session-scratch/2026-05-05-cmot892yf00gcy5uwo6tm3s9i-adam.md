# Gold Session Scratch Log

Date: 2026-05-05
Session ID: `cmot892yf00gcy5uwo6tm3s9i`
Assigned side: Adam
Scenario: Adam/Eve
Browser URL: `http://localhost:8082/session/cmot892yf00gcy5uwo6tm3s9i?e2e-user-id=cmot892y800g6y5uwhltlqei8&e2e-user-email=gold-loop-adam-20260505155605@e2e.test`

## Timeline

## Findings

### Internal FeelHeardCheck tag exposed in chat

- Stage: Stage 1 Witness
- Type: prompt | UI
- Status: confirmed
- What happened: After Adam validated the reflection, the user-facing MWF message displayed `<FeelHeardCheck>Y</FeelHeardCheck>` above the facilitator response.
- Evidence: Adam DOM text included `<FeelHeardCheck>Y</FeelHeardCheck>` before "You know she probably doesn't mean it that way..."
- Expected: Internal control tags should be parsed/hidden and never shown in the participant chat transcript.
- Likely fix: backend prompt/tag parsing around Stage 1 feel-heard detection, likely `backend/src/services/ai-orchestrator.ts` or stage prompt response parsing.
