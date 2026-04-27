# run-and-publish.sh

Wraps a Playwright e2e run and publishes the result to the test-dashboard. The bot calls this from cron (and, eventually, from the Slack `@slam_paws test <scenario>` handler — separate PR).

## What it does

1. Picks the right Playwright config based on the scenario name prefix:
   - `two-browser-*` → `playwright.two-browser.config.ts`
   - `live-ai-*` → `playwright.live-ai.config.ts`
   - everything else → `playwright.config.ts`
2. Runs the spec with the **dashboard reporter** appended (`e2e/reporters/test-dashboard-reporter.ts`).
3. Reads the reporter's `dashboard-summary.json`.
4. Hands the artifacts (screenshots, transcript, error metadata, real timing) to `write-test-result.ts`, which uploads screenshots to Vercel Blob and PATCHes the row.

The reporter is configured via the `--reporter=` flag so it doesn't require editing the existing config files.

## Required env

Set in `/opt/slam-bot/.env` (auto-sourced):

| Var | Source |
|---|---|
| `TEST_DASHBOARD_API_URL` | e.g. `https://mwf-test-dashboard.vercel.app` |
| `BOT_WRITER_TOKEN` | Same value set on the Vercel project (see `tools/test-dashboard/SETUP.md` step 5) |
| `BLOB_READ_WRITE_TOKEN` | Auto-issued by Vercel Blob; in the project's `.env.local` |

## Usage

Daily smoke (cron):

```cron
0 4 * * * /opt/slam-bot/scripts/run-and-publish.sh single-user-journey --trigger-source cron --triggered-by daily-smoke
```

Manual one-off:

```bash
/opt/slam-bot/scripts/run-and-publish.sh two-browser-stage-2 --trigger-source manual --triggered-by jason
```

With a specific starting snapshot (Phase 1B):

```bash
/opt/slam-bot/scripts/run-and-publish.sh two-browser-stage-3 \
  --trigger-source slack \
  --triggered-by U123ABC \
  --starting-snapshot-id 01HK...
```

## Exit codes

- `0` — Playwright passed and the writer published successfully.
- `1` — Playwright failed OR the writer hit an error. The dashboard still gets a row in either case (the reporter wrote a summary even on failure, and the writer marks the run as `error` if the artifact phase fails).
- `2` — Bad arguments.

## Files written

- `e2e/test-results/dashboard-summary.json` — reporter output, the source of truth for the writer.
- `e2e/test-results/dashboard-screenshots/*.png` — screenshots renamed in step order so the writer's filename-based step parsing works.
- `e2e/test-results/dashboard-transcript.txt` — extracted from the summary, posted as a `transcript` artifact.

These are overwritten on every run.

## Local testing

You can dry-run this on your laptop without touching the EC2 bot:

```bash
export TEST_DASHBOARD_API_URL=http://localhost:3000     # or the real prod URL
export BOT_WRITER_TOKEN=<from tools/test-dashboard/.env.local>
export BLOB_READ_WRITE_TOKEN=<from same file>

# Make sure the dashboard's API is reachable. Either:
#   - Run `vercel dev` in tools/test-dashboard/ for local Postgres
#   - Or hit prod directly (dirties the prod runs feed)

./scripts/ec2-bot/scripts/run-and-publish.sh single-user-journey \
  --trigger-source manual \
  --triggered-by jason@galuten.com
```

The first run will likely take 60-90s (mobile bundle build + test), then publish. Watch the dashboard at `$TEST_DASHBOARD_API_URL` to see the row appear.

## Troubleshooting

- **`reporter did not run`**: the `--reporter=...` path was wrong. Check that `e2e/reporters/test-dashboard-reporter.ts` exists in the repo on EC2 (it's symlinked via `/opt/slam-bot/scripts` only — but the reporter lives in `e2e/`, which the cron resolves through `REPO_ROOT`).
- **`401 invalid or missing x-bot-token`**: token in `.env` doesn't match the value set on the Vercel project. Re-pull or re-set.
- **`Error connecting to database`**: Neon is still spinning up after a long idle. The writer auto-retries handled by the dashboard's API; if it persists, check the `mwf-test-dashboard` Vercel logs.
- **`Blob 401`**: `BLOB_READ_WRITE_TOKEN` missing or wrong. Check the Vercel project Storage tab for the canonical value.
