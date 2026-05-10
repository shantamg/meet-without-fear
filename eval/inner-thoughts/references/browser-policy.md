# Browser Policy

Command-line loop runs use `agent-browser`, not the Codex Desktop in-app browser.

Default loop shape:

```bash
agent-browser --session mwf-inner-<run-id> open http://localhost:8082/
agent-browser --session mwf-inner-<run-id> wait --load networkidle
agent-browser --session mwf-inner-<run-id> snapshot -i
```

Use DOM snapshots for normal state checks. Use screenshots only for layout, CTA placement, safe-area, keyboard, drawer, or overlap evidence.

Close browser sessions created by the run before reporting completion.
