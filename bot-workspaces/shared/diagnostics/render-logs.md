# Render Logs Utility

Fetch recent logs from the gateway on Render.

## Credentials

Load `RENDER_API_KEY` per `shared/references/credentials.md`.

## Service ID

See `.claude/config/services.json` for Render service ID.

## Fetch Logs

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs?ownerId=tea-d0a2sd8gjchc73bc8bs0&resource=srv-d58bj73uibrs73akacd0&limit=100&direction=backward"
```

Useful query parameters: `limit` (default 100), `direction` (`backward`/`forward`), `startTime` and `endTime` (ISO 8601).

## Error Patterns to Flag

- `FATAL` / `process.exit` — startup failures
- `auto-trigger failed` — pipeline failures
- `Bedrock` / `throttling` — LLM rate limits
- `ECONNREFUSED` — service connectivity
- HTTP 5xx responses
