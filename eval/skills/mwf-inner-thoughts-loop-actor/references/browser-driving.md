# Browser Driving

Use `agent-browser` for command-line actor runs.

## Start

```bash
agent-browser --session mwf-inner-<run-id> open http://localhost:8082/
agent-browser --session mwf-inner-<run-id> wait --load networkidle
agent-browser --session mwf-inner-<run-id> snapshot -i
```

Find the home composer, type the scenario starting message, submit, and wait for navigation to an Inner Thoughts URL.

## Observe

Prefer:

```bash
agent-browser --session mwf-inner-<run-id> snapshot -i
```

Use screenshots for visual layout claims:

```bash
agent-browser --session mwf-inner-<run-id> screenshot --path /tmp/mwf-inner-<run-id>.png
```

## Clicks

Only click CTAs that belong to the actor and stay inside the local/E2E app. For `start_partner_session`, verify the label, dismiss path, carried person name, and carried `innerThoughtsId`.

## Evidence To Capture

- Home composer submitted the exact starting message.
- Resulting URL and session id.
- First user message appears before AI response.
- CTA absent/present according to scenario.
- CTA copy and dismiss path.
- New-session params and generated context banner.
- Stage 0 first prompt if a partner session is created.
