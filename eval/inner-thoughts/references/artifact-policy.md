# Artifact Policy

Required per scenario run:

- Scenario id and run id.
- Starting URL and final URL.
- Scratch log path.
- Key DOM text or screenshots for session creation, CTA state, new-session handoff, and Stage 0 state when applicable.
- Backend or DB evidence for persisted `innerThoughtsId` traceability when applicable.
- `MWF_INNER_THOUGHTS_STATUS` JSON.

Do not commit raw screenshots, huge logs, or browser dumps unless they are promoted as durable regression fixtures. Summarize them in stage outputs and cycle reports with file paths if kept locally.
