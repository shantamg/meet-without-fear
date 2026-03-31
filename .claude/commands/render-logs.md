# Render Logs — Meet Without Fear API

Fetch recent logs from the Meet Without Fear API on Render.

## Arguments

`$ARGUMENTS` — Optional filters. Examples:
- (empty) → last 100 logs
- `errors` → filter for error-level logs
- `POST /api/sessions` → filter by method and path
- `last 500` → increase limit
- Any search text to grep through logs

## Service IDs

See `.claude/config/services.json` for Render service ID and dashboard URL.

## Load credentials

Follow the `/load-creds` pattern for `RENDER_API_KEY`:
```bash
RENDER_API_KEY="${RENDER_API_KEY:-$(grep '^RENDER_API_KEY=' backend/.env 2>/dev/null | cut -d= -f2-)}"
```

## Fetch logs

### Method 1: Render CLI (preferred)

Check if available, then use:

```bash
render logs \
  --resources srv-d58bj73uibrs73akacd0 \
  --output json \
  --limit 100
```

Available CLI filters (add based on `$ARGUMENTS`):
- `--level error` or `--level warn` for error/warning filtering
- `--method POST` for HTTP method filtering
- `--path /api/sessions` for path filtering
- `--text "search term"` for text search
- `--limit N` for custom count (default 100)
- `--start "2026-03-13T00:00:00Z"` for time range

### Method 2: curl fallback (if CLI unavailable)

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d58bj73uibrs73akacd0/logs?limit=100" \
  | python3 -m json.tool
```

Note: The Render REST API log endpoint may return 404 — in that case, inform the user they need the Render CLI or dashboard.

## Post-processing

1. Parse the JSON output
2. If `$ARGUMENTS` contains a search term not handled by CLI flags, filter the results client-side with grep
3. Format output as a readable table: `TIMESTAMP | LEVEL | MESSAGE`
4. Highlight errors and warnings
5. If errors are found, group them by type and show counts
6. Show the time range covered by the logs

## Error patterns to flag

Watch for and highlight:
- `FATAL` / `process.exit` — startup failures
- `Sentry.captureException` — tracked errors
- `CLERK_SECRET_KEY` — auth config issues
- `Bedrock` / `throttling` — LLM rate limits
- `ECONNREFUSED` — service connectivity issues
- HTTP 5xx responses
- `prisma` / `database` — DB errors

## Output format

```
Render Logs — meet-without-fear-api
Time range: [start] to [end]
Total: N logs (E errors, W warnings)

[formatted log entries]

Issues found:
- [summary of any error patterns]
```
