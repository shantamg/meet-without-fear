# Check Mixpanel Utility

Query Mixpanel analytics events for Meet Without Fear.

## Credentials

Load `MIXPANEL_USERNAME`, `MIXPANEL_SECRET`, and `MIXPANEL_PROJECT_ID` per `shared/references/credentials.md`.

## API Calls

### Export raw events (most useful)
```bash
curl -s --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=$MIXPANEL_PROJECT_ID&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD"
```

### Top events
```bash
curl -s --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://mixpanel.com/api/2.0/events/top?project_id=$MIXPANEL_PROJECT_ID&type=general&limit=20"
```

## User Lookup

`distinct_id` = user's UUID from the `User` table (not Clerk ID).
