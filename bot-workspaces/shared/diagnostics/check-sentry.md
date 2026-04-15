# Check Sentry Utility

Query Sentry for errors and issues across projects.

## Credentials

Load `SENTRY_AUTH_TOKEN` per `shared/references/credentials.md`.

## Configuration

See `.claude/config/services.json` for Sentry org, project slugs, and project IDs.

## API Base

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/..."
```

## Default Check (both projects in parallel)

### Gateway issues
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/meet-without-fear-mind/meet-without-fear-families-gateway/issues/?query=is:unresolved&sort=date&limit=15"
```

### Mobile issues
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/meet-without-fear-mind/meet-without-fear-families-mobile/issues/?query=is:unresolved&sort=date&limit=15"
```

## Priority Signals

- High event count in short time = active bug
- First seen recently = possibly from latest deploy
- High userCount = prioritize
- Pipeline errors = broken recording flow
