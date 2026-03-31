# Check Mixpanel Events — Meet Without Fear

Query Mixpanel analytics events for the Meet Without Fear mobile app.

## Arguments

`$ARGUMENTS` — What to check. Examples:
- (empty) → summary of recent events (last 24h)
- `session events today` → session-related events from today
- `user <uuid>` → events for a specific user
- `event <event_name>` → specific event details
- `list events` → show all tracked event names

## Configuration

See `.claude/config/services.json` for Mixpanel project token and dashboard URL.

## Load credentials

Follow the `/load-creds` pattern for `MIXPANEL_USERNAME` and `MIXPANEL_SECRET`:
```bash
MIXPANEL_USERNAME="${MIXPANEL_USERNAME:-$(grep '^MIXPANEL_USERNAME=' backend/.env 2>/dev/null | cut -d= -f2-)}"
MIXPANEL_SECRET="${MIXPANEL_SECRET:-$(grep '^MIXPANEL_SECRET=' backend/.env 2>/dev/null | cut -d= -f2-)}"
```

**Note**: Mixpanel API credentials (service account username/secret) are not yet configured for this project. If missing, direct the user to create a service account at https://mixpanel.com → Settings → Service Accounts, then add `MIXPANEL_USERNAME` and `MIXPANEL_SECRET` to `backend/.env`.

## API calls

### Export raw events (most useful for debugging)
```bash
curl -s --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=PROJECT_ID&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD"
```

Returns NDJSON (one JSON object per line). Parse with:
```bash
| python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    e = json.loads(line)
    props = e.get('properties', {})
    print(f'{e[\"event\"]:40} {props.get(\"time\",\"?\")}  {props.get(\"distinct_id\",\"?\")[:20]}')
" | head -50
```

### Event names list
```bash
curl -s --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://mixpanel.com/api/2.0/events/names?project_id=PROJECT_ID&type=general"
```

## Key event names (Meet Without Fear mobile)

Events tracked via `mobile/src/services/analytics.ts`:
- `Session Created`, `Session Resolved`
- `Person Selected`, `Invitation Sent`
- `Compact Signed`
- `Stage Started`, `Stage Completed`
- `Message Sent`
- `Felt Heard Response`
- `Common Ground Found`
- `Inner Thoughts Created`, `Inner Thoughts Linked`
- `Share Topic Shown/Accepted/Declined/Dismissed`
- `Share Draft Sent`
- `OTA Update Checked/Downloaded/Applied/Dismissed`
- `Error` (with error_type, error_code)

## Output format

```
Mixpanel Events — Meet Without Fear
Period: [date range]
Total events: N

Event breakdown:
  [event_name]: count
  ...

[detailed results based on query]
```
