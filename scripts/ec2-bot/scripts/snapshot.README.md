# save-snapshot.sh / restore-snapshot.sh

Capture and restore backend DB snapshots, with the corresponding metadata row registered in the test-dashboard so the snapshot tree is browsable + tests can branch from any point.

These wrap the existing `backend/snapshots/{create,reset-to}-snapshot.ts` scripts (which do the actual `pg_dump` / `psql` work) and add the dashboard registration on top.

## Required env

Sourced from `/opt/slam-bot/.env` automatically:

| Var | What it's for |
|---|---|
| `TEST_DASHBOARD_API_URL` | e.g. `https://mwf-test-dashboard.vercel.app` |
| `BOT_WRITER_TOKEN` | x-bot-token for the dashboard write API (save only) |
| `DATABASE_URL` | Backend test database (`postgresql://...`); read by the underlying TS scripts |

## Save a snapshot

```bash
# Minimal: dump current DB state, register on dashboard
./scripts/ec2-bot/scripts/save-snapshot.sh post-stage-2-empathy-shared

# With description + lineage (recommended)
./scripts/ec2-bot/scripts/save-snapshot.sh stage-3-complete \
  --description "Right after Bob accepts Alice's empathy, ready for stage 3" \
  --parent-id 01HKABC...                                    \
  --from-run-id 01KQ86MS...                                 # the run that produced this state
```

Output:
```
[save-snapshot] dumping DB to backend/snapshots/snapshot-stage-3-complete--<timestamp>.sql
[save-snapshot] dumped: backend/snapshots/snapshot-stage-3-complete--2026-04-27T20-15-00.sql (47K)
[save-snapshot] registering with dashboard at https://mwf-test-dashboard.vercel.app
[save-snapshot] DONE
[save-snapshot] snapshot id: 01KQ8FZGABCDEFGH...
[save-snapshot] file:        backend/snapshots/snapshot-stage-3-complete--2026-04-27T20-15-00.sql
[save-snapshot] view:        https://mwf-test-dashboard.vercel.app/snapshot/01KQ8FZGABCDEFGH...
```

The dashboard's snapshot detail page now shows this node, its parent, and any runs that branched from it.

### What gets captured

- **The .sql file** — `pg_dump --data-only` of the data tables (User, Session, Message, StageProgress, EmpathyAttempt, etc.) — same set as `backend/snapshots/create-snapshot.ts`.
- **The dashboard row** — name, description, parent_id, file_path, created_by_run_id, and a `db_state_summary` JSONB with row counts in the most-used tables (`Session`, `Message`, `StageProgress`, `EmpathyAttempt`, `Invitation`, `User`).

The `.sql` file lives **on the box that created it**. Snapshots are filesystem-bound today; cross-machine restore needs you to copy the file. (Future: upload the .sql to Blob too.)

## Restore a snapshot

```bash
# By dashboard ID (looks up file_path via /api/snapshots/:id, then restores)
./scripts/ec2-bot/scripts/restore-snapshot.sh 01KQ8FZGABCDEFGH...

# By name fragment (skips the dashboard, lets reset-to-snapshot.ts find the file)
./scripts/ec2-bot/scripts/restore-snapshot.sh 03-invitation-accepted
```

The dashboard-ID path enforces that the file exists locally (since snapshots are FS-bound). If the file's missing, the script tells you which `.sql` to copy over.

The underlying `reset-to-snapshot.ts` does:
1. `TRUNCATE` the data tables (CASCADE)
2. `psql -f <file>` to load the snapshot
3. `npx prisma migrate deploy` to apply any new migrations on top

## Common workflows

**"Branch a new test run from snapshot X"** — pass `--starting-snapshot-id` to `run-and-publish.sh`. The bot writer records the lineage; the dashboard's snapshot detail page lists every run that started here.

**"Save the state after my test passed"** — the test runner calls `save-snapshot.sh <name> --from-run-id <id>` after a green run. (Manual today; could be automated by `run-and-publish.sh` accepting a `--save-on-pass <name>` flag — follow-up.)

**"Investigate what changed between two snapshots"** — restore A, dump key tables, restore B, dump again, diff. (Phase 1C: dashboard surfaces this diff inline.)

## Troubleshooting

- **`registration failed: HTTP 401`** — `BOT_WRITER_TOKEN` mismatch. Same value must be set in Vercel env + the bot's `.env`.
- **`file_path points at ... but it doesn't exist on this machine`** — snapshot was created on a different box. Either copy the `.sql` over or recreate via `save-snapshot.sh` here.
- **`create-snapshot.ts failed`** — usually `DATABASE_URL` not set, or the user lacks `pg_dump` permissions. Confirm `psql -d $DATABASE_URL -c '\dt'` works first.
