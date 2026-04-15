# Check Mixpanel Utility

Query Mixpanel analytics events for the.

## Credentials

Load `MIXPANEL_USERNAME` and `MIXPANEL_SECRET` per `shared/references/credentials.md`.

## Configuration

- Project ID: `3998202` (Lovely Families)
- See `.claude/config/services.json` for org and dashboard URL

## API Calls

### Export raw events (most useful)
```bash
curl -s --user "$MIXPANEL_USER:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=3998202&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD"
```

### Top events
```bash
curl -s --user "$MIXPANEL_USER:$MIXPANEL_SECRET" \
  "https://mixpanel.com/api/2.0/events/top?project_id=3998202&type=general&limit=20"
```

## Key Event Names

- `recording.started`, `recording.completed`, `recording.cancelled`
- `app.opened`, `app.backgrounded`
- `screen.viewed`, `auth.signed_in`, `auth.signed_out`
- `circle.created`, `circle.joined`, `person.added`

## User Lookup

`distinct_id` = user's UUID from the `User` table (not Clerk ID).
