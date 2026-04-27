# write-test-result.ts

CLI script the EC2 bot calls after each Playwright e2e run. Pushes a row + screenshots + transcript to the test-dashboard.

## Required environment variables

| Var | Where it comes from |
|---|---|
| `TEST_DASHBOARD_API_URL` | Vercel deployment URL of `tools/test-dashboard/`, e.g. `https://test-dashboard.meetwithoutfear.com` |
| `BOT_WRITER_TOKEN` | Long random string. Must equal the same env var set on the Vercel project. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (auto-issued by the Blob integration). Only needed when uploading screenshots. |

Set them in the bot's systemd unit or `.env` (sourced before the script runs).

## Install

`@vercel/blob` is declared in the repo-root `package.json`, so a normal `npm install` at the repo root makes it resolvable from this script's path. If `tsx` isn't already on the bot, install it once:

```
npm install -g tsx
```

## Invocation

Minimal — failed run, no artifacts:

```bash
tsx scripts/ec2-bot/scripts/write-test-result.ts \
  --scenario two-browser-stage-2 \
  --status fail \
  --error-message "timeout waiting for stage 2 transition" \
  --failed-test-file e2e/two-browser-stage-2.spec.ts \
  --failed-test-line 87
```

Full pass with screenshots + transcript + real test timing:

```bash
tsx scripts/ec2-bot/scripts/write-test-result.ts \
  --scenario single-user-journey \
  --status pass \
  --started-at 2026-04-26T18:30:12.000Z \
  --finished-at 2026-04-26T18:34:48.000Z \
  --screenshots-dir /tmp/playwright/screenshots/run-2026-04-26 \
  --transcript-file /tmp/playwright/transcripts/run-2026-04-26.txt \
  --starting-snapshot-id 01HXY... \
  --ending-snapshot-id 01HXZ... \
  --final-stage 4 \
  --trigger-source cron
```

Always pass `--started-at` (and ideally `--finished-at` or `--duration-ms`) from the runner — without them, `duration_ms` only covers the writer's upload phase and the dashboard misreports test latency.

Update an existing queued run (when the dashboard's web UI enqueued it):

```bash
tsx scripts/ec2-bot/scripts/write-test-result.ts \
  --run-id 01HXY... \
  --scenario two-browser-stage-2 \
  --status pass \
  --screenshots-dir /tmp/playwright/screenshots/run-2026-04-26
```

## Behaviour

1. If `--run-id` is omitted, POSTs `/api/runs` to create a new row, then PATCHes status to `running`.
2. If `--run-id` is provided, PATCHes the row to `running` (used by the queue-poller path).
3. For each PNG/JPG/WebP in `--screenshots-dir` (sorted naturally by filename), uploads to Vercel Blob and POSTs `/api/artifacts` with `type=screenshot`.
   - Step index is parsed from the leading digits of the filename (`01-foo.png` -> step 1, `step-12_login.jpg` -> step 12), falling back to file order.
   - Caption is derived from the filename (numeric prefix stripped, dashes/underscores replaced with spaces).
4. If `--transcript-file` exists, POSTs `/api/artifacts` with `type=transcript` and the file contents inline.
5. Final PATCH `/api/runs/:id` with status, `finished_at`, `duration_ms`, and any failure fields.
6. Prints the run id + the dashboard URL on completion.

## Screenshot filename convention

Use `NN-short-description.png`, e.g. `01-opens-app.png`, `02-types-message.png`, `03-shows-stage-2.png`. The leading number sets `step_index`, the suffix becomes the caption.

## Failure handling

- Missing optional inputs (no `--screenshots-dir`, dir not found, transcript file not found) → warning, script continues.
- Once an artifact upload starts, any failure (Vercel Blob 5xx, `/api/artifacts` non-2xx, file read error) propagates and the script exits non-zero.
- Before re-throwing, the script makes a best-effort PATCH to set the run's status to `error` with `error_message: "writer failure: ..."`. This prevents stuck-at-`running` rows in the dashboard when the writer dies mid-upload.
