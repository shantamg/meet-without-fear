# Test Dashboard — Operator Setup

Step-by-step guide for provisioning the `mwf-test-dashboard` Vercel project and wiring it into GitHub Actions + the EC2 bot.

> **Heads up — Postgres provider:** Vercel deprecated `@vercel/postgres` in late 2025; new Postgres databases are provisioned through the **Neon** marketplace integration. The `@vercel/postgres` npm package still works against a Neon database (it just proxies to the Neon serverless driver), so the existing API code is unchanged. If you'd rather migrate to `@neondatabase/serverless` directly later, the SQL stays the same.

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

## Step 1 — Link the Vercel project

The project `mwf-test-dashboard` already exists (auto-created during initial scaffold). Re-link if `.vercel/` is missing:

```bash
cd tools/test-dashboard
vercel link --yes --project mwf-test-dashboard
```

The project ID is in `tools/test-dashboard/.vercel/project.json` after linking. **Note it down — you'll need it for Step 6.**

## Step 2 — Provision Postgres (via Neon)

Easiest path is the Vercel dashboard:

1. https://vercel.com/dashboard → select **`mwf-test-dashboard`** project
2. **Storage** tab → **Create Database** → **Neon (Postgres)**
3. Name: `mwf-test-dashboard-db`, region: `iad1` (closest to existing infra)
4. **Connect** to `mwf-test-dashboard` and select **all three environments** (Production, Preview, Development)

This auto-injects:
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` (Neon-shimmed for backward compatibility)

CLI alternative (interactive — needs operator confirmation):

```bash
vercel integration add neon
# Follow the prompts to install the Neon integration into the Shantam scope
# Then connect the resulting database to mwf-test-dashboard via the dashboard
```

## Step 3 — Provision Vercel Blob

The Blob store `mwf-test-dashboard-blob` was already created during scaffold (store ID `store_Odn0ZYAqSWIiTLTk`). It just needs to be **connected** to the project:

1. Vercel dashboard → **`mwf-test-dashboard`** → **Storage**
2. Click **Connect Store** → select `mwf-test-dashboard-blob` → all environments

This auto-injects `BLOB_READ_WRITE_TOKEN`.

If the store doesn't exist (e.g. fresh clone), recreate:

```bash
cd tools/test-dashboard
vercel blob store add mwf-test-dashboard-blob
# answer Y to link
```

## Step 4 — Pull env locally and run migrations

```bash
cd tools/test-dashboard
vercel env pull .env.local
npm install   # already done if you've been developing
npm run migrate
```

`vercel env pull` writes Postgres + Blob env vars into `.env.local`. The migration script reads `POSTGRES_URL` (or `DATABASE_URL`) and applies `db/schema.sql`.

## Step 5 — Set bot writer token

Generate a token:

```bash
openssl rand -hex 32
```

Add to all three Vercel environments:

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
gh variable set VERCEL_TEST_DASHBOARD_PROJECT_ID --body "$(jq -r .projectId tools/test-dashboard/.vercel/project.json)"
```

Confirm `VERCEL_ORG_ID` (variable) and `VERCEL_TOKEN` (secret) already exist — they're shared with the existing `mobile/` and `website/` deploys:

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

Make sure the repo is present (it likely already is at `~/projects/meet-without-fear/`) and that root deps are installed (`@vercel/blob` is declared at the repo root so the bot script can resolve it):

```bash
cd ~/projects/meet-without-fear && git pull && npm install
```

Smoke test the writer:

```bash
cd ~/projects/meet-without-fear
mkdir -p /tmp/empty-screenshots
npx tsx scripts/ec2-bot/scripts/write-test-result.ts \
  --scenario smoke-test \
  --status pass \
  --screenshots-dir /tmp/empty-screenshots
```

You should see a `https://mwf-test-dashboard.vercel.app/run/<id>` URL printed. Click it — the run should appear in the dashboard.

## Step 8 — Optional: Custom domain

```bash
vercel domains add test-dashboard.meetwithoutfear.com mwf-test-dashboard
```

Add the CNAME record per Vercel's instructions, then update `TEST_DASHBOARD_API_URL` on the EC2 bot to the new domain.

## Auth model (Phase 1A)

- `GET /api/runs`, `GET /api/runs/:id`, `GET /api/snapshots`, `GET /api/snapshots/:id` — **public read**. Anyone with the URL can browse runs.
- `POST /api/runs`, `PATCH /api/runs/:id`, `POST /api/snapshots`, `POST /api/artifacts` — **bot-token only**. Requires `x-bot-token: <BOT_WRITER_TOKEN>` header.

This means the dashboard's "New Run" page **does not work in production** until Phase 1B wires Clerk-based user auth. The form is staged but the server rejects unauthenticated POSTs. To queue a run today, use the EC2 writer script directly. This was a deliberate choice — leaving POST open on a public deployment lets anyone enqueue work that the EC2 bot will execute.

## Troubleshooting

- **Migrations fail with auth error**: confirm `.env.local` has `POSTGRES_URL` or `DATABASE_URL`. Re-run `vercel env pull .env.local` after the storage is connected to the project in **all** environments.
- **GitHub Actions deploy fails**: check the variable name matches exactly: `VERCEL_TEST_DASHBOARD_PROJECT_ID` (case sensitive). Run `gh variable list` to verify.
- **First deploy succeeds but functions 500**: check that Postgres + Blob storage is connected to the **Production** environment, not just Preview/Development. Vercel dashboard → project → Settings → Environment Variables.
- **`@vercel/postgres` deprecation warning at install**: harmless. The package still works against Neon databases. Migration to `@neondatabase/serverless` is a future cleanup, not a blocker.

## What's already done (autonomously)

- Vercel project `mwf-test-dashboard` created and linked (`.vercel/project.json` present)
- Vercel Blob store `mwf-test-dashboard-blob` (store ID `store_Odn0ZYAqSWIiTLTk`) created — needs project link in Step 3
- All scaffold + API + GitHub Actions workflow committed
- npm deps installed; build + typecheck pass

Operator (you) needs to: provision Neon Postgres (Step 2), confirm Blob link (Step 3), pull env + migrate (Step 4), set bot token (Step 5), set GH variable (Step 6), configure EC2 (Step 7).
