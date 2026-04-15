# Check Database Utility

Query the PostgreSQL database for diagnostics, data inspection, or debugging.

## Credentials

Load `READONLY_DATABASE_URL` (preferred) or `PRODUCTION_DATABASE_URL` (fallback) per `shared/references/credentials.md`.

## Running Queries

```bash
psql "$PRODUCTION_DATABASE_URL" -c "SELECT ..." --no-psqlrc -P pager=off
```

Fallback: `cd && DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run db:query 'SELECT ...'`

## Default Health Check

1. Table row counts (User, Circle, Person, Recording, Transcript, Segment, CodedTranscript, HealthScore, DimensionMetric)
2. Recent recordings (last 24h) with circle name and status
3. Pipeline status via `check-pipeline-health.md`
4. Migration status (last 5 migrations)

## Key Tables

| Table | Purpose |
|---|---|
| `User` | Auth users (Clerk) |
| `Circle` | Family circles |
| `Person` | People in circles (adults/children) |
| `Recording` | Audio recordings |
| `Transcript` | Transcriptions (ai, ai_assisted, human) |
| `CodedTranscript` | DPICS/DECS coded transcripts |
| `HealthScore` | Per-recording health scores |
| `DimensionMetric` | Granular dimension scores |

## Security

- SELECT-only via `slam_bot_readonly` role
- NEVER print full connection strings
