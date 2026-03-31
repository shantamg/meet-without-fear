# Check Sentry Issues — Meet Without Fear

Query Sentry for errors, issues, and performance data.

## Arguments

`$ARGUMENTS` — What to check. Examples:
- (empty) → recent unresolved issues
- `errors today` → issues from today
- `issue <ISSUE_ID>` → details of a specific issue
- `<search term>` → search issues by title/message
- `resolved` → recently resolved issues

## Configuration

See `.claude/config/services.json` for Sentry org, project slugs, and project IDs.

## Load credentials

Follow the `/load-creds` pattern for `SENTRY_AUTH_TOKEN`:
```bash
SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-$(grep '^SENTRY_AUTH_TOKEN=' backend/.env 2>/dev/null | cut -d= -f2-)}"
```

## API base

All API calls use:
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/..."
```

## Default check (no arguments)

Query both projects in parallel for unresolved issues:

### Backend issues
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/meet-without-fear/mwf-backend/issues/?query=is:unresolved&sort=date&limit=15" \
  | python3 -c "
import json, sys
issues = json.load(sys.stdin)
for i in issues:
    count = i.get('count', '?')
    users = i.get('userCount', '?')
    last = i.get('lastSeen', '?')[:19]
    print(f'  [{i[\"shortId\"]}] {i[\"title\"][:70]}')
    print(f'    Events: {count} | Users: {users} | Last: {last}')
    print(f'    Link: {i[\"permalink\"]}')
    print()
"
```

### Mobile issues
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/meet-without-fear/mwf-mobile/issues/?query=is:unresolved&sort=date&limit=15" \
  | python3 -c "
import json, sys
issues = json.load(sys.stdin)
for i in issues:
    count = i.get('count', '?')
    users = i.get('userCount', '?')
    last = i.get('lastSeen', '?')[:19]
    print(f'  [{i[\"shortId\"]}] {i[\"title\"][:70]}')
    print(f'    Events: {count} | Users: {users} | Last: {last}')
    print(f'    Link: {i[\"permalink\"]}')
    print()
"
```

## Specific issue detail

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/meet-without-fear/issues/ISSUE_ID/" \
  | python3 -m json.tool
```

Get the latest event for an issue:
```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/meet-without-fear/issues/ISSUE_ID/events/latest/" \
  | python3 -c "
import json, sys
e = json.load(sys.stdin)
print(f'Event ID: {e.get(\"eventID\")}')
print(f'Timestamp: {e.get(\"dateCreated\")}')
print(f'Message: {e.get(\"message\", e.get(\"title\", \"N/A\"))}')
for entry in e.get('entries', []):
    if entry['type'] == 'exception':
        for exc in entry['data'].get('values', []):
            print(f'\nException: {exc.get(\"type\")}: {exc.get(\"value\")}')
            frames = exc.get('stacktrace', {}).get('frames', [])
            for f in frames[-5:]:
                print(f'  {f.get(\"filename\")}:{f.get(\"lineNo\")} in {f.get(\"function\")}')
"
```

## Search issues

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/meet-without-fear/issues/?query=SEARCH_TERM&project=4511090865274880&project=4511090865930240&sort=date&limit=20"
```

## Key things to watch for

- **High-frequency issues**: Many events in short time → active bug
- **New issues**: First seen recently → possibly from latest deploy
- **User-impacting**: High userCount → prioritize
- **Auth errors**: Clerk-related issues → auth misconfiguration
- **LLM errors**: Bedrock throttling or timeout → capacity issues

## Output format

```
Sentry Issues — Meet Without Fear
Checked: backend + mobile projects

Backend (N unresolved):
  [issue summaries]

Mobile (N unresolved):
  [issue summaries]

Priority issues:
- [high-impact issues to investigate]
```
