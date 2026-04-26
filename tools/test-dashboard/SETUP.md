# Test Dashboard — Operator Setup

Step-by-step guide for provisioning the `mwf-test-dashboard` Vercel project and wiring it into GitHub Actions + the EC2 bot.

## Prerequisites

- **Vercel CLI** installed locally and logged in:
  ```bash
  npm i -g vercel    # or use `npx vercel`
  vercel login
  ```
- **GitHub CLI** authenticated:
  ```bash
  gh auth status
  ```

## Step 1 — Create the Vercel project

From the repo root:

```bash
cd tools/test-dashboard
vercel link
```

Answer the prompts:
- **Scope**: `Shantam's Projects`
- **Project name**: `mwf-test-dashboard`
- **Root directory**: `tools/test-dashboard`

Or via CLI:

```bash
vercel projects add mwf-test-dashboard
vercel link
```

Note the **project ID** — it lands in `tools/test-dashboard/.vercel/project.json` after `vercel link`.

## Step 2 — Provision Vercel Postgres

```bash
vercel storage create postgres mwf-test-dashboard-db --region iad1
```

(If the CLI sub-command isn't available, use the dashboard: **Storage → Create → Postgres**.)

Connect the database to the project:
- Vercel dashboard → **Storage** tab → select `mwf-test-dashboard-db`
- **Connect Project** → choose `mwf-test-dashboard` → select **all environments** (Production, Preview, Development)

This auto-injects the following env vars into the project:

- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

## Step 3 — Provision Vercel Blob

```bash
vercel storage create blob mwf-test-dashboard-blob
```

(Or via dashboard: **Storage → Create → Blob**.)

Connect to the project the same way as Step 2. This auto-injects:

- `BLOB_READ_WRITE_TOKEN`

## Step 4 — Pull env locally and run migrations

```bash
cd tools/test-dashboard
vercel env pull .env.local
npm install
npx tsx db/migrate.ts
```

`vercel env pull` writes the Postgres + Blob env vars into `.env.local`. The migration script creates the schema.

## Step 5 — Set bot writer token

Generate a token:

```bash
openssl rand -hex 32
```

Add it to all three Vercel environments:

```bash
vercel env add BOT_WRITER_TOKEN production
# paste token
vercel env add BOT_WRITER_TOKEN preview
# paste same token
vercel env add BOT_WRITER_TOKEN development
# paste same token
```

**Save the token** — the EC2 bot needs the same value (Step 7).

## Step 6 — Wire GitHub Actions

Add the project ID as a repo variable:

```bash
gh variable set VERCEL_TEST_DASHBOARD_PROJECT_ID --body "<project-id-from-.vercel/project.json>"
```

Confirm `VERCEL_ORG_ID` (variable) and `VERCEL_TOKEN` (secret) already exist — they're shared with the other Vercel deploys (`mobile/` app, `website/`):

```bash
gh variable list | grep VERCEL_ORG_ID
gh secret list | grep VERCEL_TOKEN
```

Trigger the first deploy by pushing a change in `tools/test-dashboard/` to `main`, or run manually:

```bash
gh workflow run vercel-deploy-test-dashboard.yml
```

## Step 7 — Configure EC2 bot

SSH in:

```bash
ssh ec2-user@52.88.216.17
```

Add to `~/.bashrc` (or wherever the bot reads its env from):

```bash
export TEST_DASHBOARD_API_URL=https://mwf-test-dashboard.vercel.app   # or custom domain
export BOT_WRITER_TOKEN=<token-from-step-5>
export BLOB_READ_WRITE_TOKEN=<from-step-3>
```

Reload: `source ~/.bashrc`.

Make sure the repo is present (it likely already is at `~/projects/meet-without-fear/`):

```bash
cd ~/projects/meet-without-fear && git pull
```

Smoke test the writer:

```bash
cd ~/projects/meet-without-fear
npx tsx scripts/ec2-bot/scripts/write-test-result.ts \
  --scenario test \
  --status pass \
  --screenshots-dir /tmp/empty-dir
```

## Step 8 — Optional: Custom domain

```bash
vercel domains add test-dashboard.meetwithoutfear.com mwf-test-dashboard
```

Add the CNAME record per Vercel's instructions, then update `TEST_DASHBOARD_API_URL` on the EC2 bot to the new domain.

## Troubleshooting

- **`vercel storage` subcommand not available**: your CLI version is older than the storage commands. Use the Vercel dashboard for Postgres and Blob provisioning instead.
- **Migrations fail with auth error**: confirm `.env.local` has `POSTGRES_URL` (not just `POSTGRES_PRISMA_URL`). Re-run `vercel env pull .env.local` after the storage is connected to the project in **all** environments.
- **GitHub Actions deploy fails**: check the variable name matches exactly: `VERCEL_TEST_DASHBOARD_PROJECT_ID` (case sensitive). Run `gh variable list` to verify.
- **First deploy succeeds but functions 500**: check that the Postgres + Blob storage is connected to the **Production** environment, not just Preview/Development. Vercel dashboard → project → Settings → Environment Variables.
