---
title: Deployment
sidebar_position: 1
description: Production deployment targets and distribution options for the Meet Without Fear platform.
created: 2026-03-11
updated: 2026-04-20
status: living
---
# Deployment

Production deployment targets and distribution options for the Meet Without Fear platform.

## Production Infrastructure

### Backend: Render.com

The Express API is deployed to Render.com as a web service. Configuration is defined in `render.yaml` at the repository root.

- **Service name**: `meet-without-fear-api`
- **Runtime**: Node.js (20.x per `package.json` engines; `render.yaml` specifies `runtime: node`)
- **Plan**: Starter
- **Branch**: `main`
- **Build command**: `npm ci && npm run prisma:generate --workspace=backend && npm run build --workspace=backend`
- **Start command**: `cd backend && npx prisma migrate deploy && node dist/backend/src/server.js`
- **Environment variables**: Loaded from the `be-heard-api-env` environment group on Render

Prisma migrations run automatically on each deploy via `prisma migrate deploy` in the start command.

### Mobile: EAS Build (Expo)

Mobile builds and submissions use Expo Application Services (EAS). The following scripts are defined in the root `package.json`:

| Script | Description |
|--------|-------------|
| `npm run deploy:mobile:ios` | Bumps build number, runs EAS production build for iOS, auto-submits to App Store |
| `npm run deploy:mobile:android` | Bumps build number, runs EAS build for Android APK |
| `npm run deploy:ios:prepare` | Prepares iOS release (runs `scripts/deploy-ios-prepare.js`) |
| `npm run deploy:ios:release` | Finalizes iOS release (runs `scripts/deploy-ios-release.js`) |
| `npm run deploy:android:prepare` | Prepares Android release (runs `scripts/deploy-android-prepare.js`) |
| `npm run deploy:android:release` | Finalizes Android release (runs `scripts/deploy-android-release.js`) |

The iOS production build uses `--auto-submit` to push directly to App Store Connect. Build numbers are auto-incremented via `scripts/update-build-number.js`.

#### EAS Build Profiles

Build profiles are defined in `mobile/eas.json`. Most profiles set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_MIXPANEL_TOKEN`, and `EXPO_PUBLIC_SENTRY_DSN`. Clerk publishable keys live in a Clerk-managed config (not in every `eas.json` profile), so the `preview` and `android-apk` profiles don't repeat them; `development*` and `production` profiles carry their own Clerk key overrides. The `development` and `development-simulator` profiles also set `EXPO_PUBLIC_BUNDLE_ID=com.meetwithoutfear.app.dev` so they can install alongside prod.

| Profile | Purpose |
|---------|---------|
| `development` | Local dev build pointing at `http://localhost:3000`; dev bundle ID |
| `development-production` | Dev client against production API (`https://api.meetwithoutfear.com`) |
| `development-simulator` | iOS simulator build for local development; dev bundle ID |
| `preview` | Internal staging distribution build |
| `production` | App Store / Play Store release build |
| `android-apk` | Standalone APK build for sideloading |

### Website & Docs: Vercel

| Target | Workspace | Deploy Command |
|--------|-----------|----------------|
| Website (`meetwithoutfear.com`) | `website/` | `npm run website:deploy` (runs `cd website && vercel --prod`) |
| Docs site | `docs-site/` | `npm run docs:deploy` (runs Vercel deploy in docs-site workspace) |
| Status dashboard | `tools/status-dashboard/` | `npm run deploy:status` (runs `cd tools/status-dashboard && vercel --prod`) |

### Web App: Vercel (Expo Web)

The Expo mobile codebase also bundles for web and is served at `app.meetwithoutfear.com`.

- **Vercel project**: `mwf-app` (Root Directory: `mobile/`)
- **Deploy trigger**: `.github/workflows/vercel-deploy-app.yml` — fires automatically on pushes to `main` that touch `mobile/**` or `shared/**`; also supports `workflow_dispatch`
- **Build**: `expo export --platform web` (run by `vercel build --prod`)
- **Env vars / secrets**: `VERCEL_ORG_ID`, `VERCEL_APP_PROJECT_ID` (repo vars), `VERCEL_TOKEN` (repo secret)
- **Web shims**: Platform-specific overrides live in `mobile/src/shims/` (Clerk token cache, SecureStore, Sentry) and `mobile/src/hooks/*.web.ts` (speech, voice input, OTA, biometrics)

## CI/CD Pipeline

Two GitHub Actions workflows split the concerns:

### `.github/workflows/ci.yml` — tests on PRs
Runs on every PR targeting `main`. Short-circuited via `dorny/paths-filter` when only docs or unrelated files change.

**Steps:**

1. Starts a PostgreSQL 15 service container (health-checked with `pg_isready`).
2. Checks out the repository and sets up Node.js 20 with npm caching.
3. Installs dependencies (`npm ci`).
4. Generates the Prisma client (`npm run prisma:generate --workspace=backend`, with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`).
5. Runs type checking across all workspaces (`npm run check`).
6. Runs database migrations (`npx prisma migrate deploy --schema=backend/prisma/schema.prisma`).
7. Runs tests across all workspaces (`npm run test`).

A gate job (`ci-success`) rolls the individual jobs up — set that as the single required status check for branch protection.

The pipeline uses a dedicated test database (`meetwithoutfear_test`) with `NODE_ENV=test`.

### `.github/workflows/render-deploy.yml` — explicit deploys on main
Runs on push to `main`. A `dorny/paths-filter` step restricts deploys to pushes that actually change `backend/`, `shared/`, the lockfile, `render.yaml`, or the workflow itself. On a match, the workflow `curl -X POST`s the Render **deploy hook** stored in repo secret `RENDER_DEPLOY_HOOK`.

> Render's built-in "auto-deploy on push" must be **off** for the `meet-without-fear-api` service — GitHub Actions is the only deploy trigger. This prevents docs-only pushes from rebuilding the backend.

### `.github/workflows/vercel-deploy-app.yml` — Expo Web deploy on main
Runs on push to `main` when `mobile/**` or `shared/**` changes (also `workflow_dispatch`). Builds the Expo Web bundle via `vercel build --prod` and deploys it to `app.meetwithoutfear.com` (Vercel project `mwf-app`). Uses repo vars `VERCEL_ORG_ID` / `VERCEL_APP_PROJECT_ID` and secret `VERCEL_TOKEN`.

### `.github/workflows/vercel-deploy-website.yml` — marketing site deploy on main
Runs on push to `main` when `website/**` changes. Deploys `website/` to Vercel (`meetwithoutfear.com`).

### `.github/workflows/ota-update.yml` — OTA update for iOS
Runs on push to `main` when `mobile/**` or `shared/**` changes (also `workflow_dispatch` with optional message). Publishes an Expo OTA update to the `production` EAS branch (iOS only) using `eas update`. Uses secret `EXPO_TOKEN`.

- OTA updates are picked up on next app launch — no App Store review required
- Roll back a bad update: `eas update:list --branch production --non-interactive --json` → `eas update:delete <group-id> --non-interactive`
- `cancel-in-progress: false` — in-flight EAS update jobs are never cancelled (a partial publish can crash the app)

## Key Environment Variables

The backend requires the following environment variables (see `backend/.env.example` for full details):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Direct database connection (bypasses connection pooler) |
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` | Authentication (Clerk) |
| `ABLY_API_KEY` | Real-time messaging |
| `RESEND_API_KEY` / `FROM_EMAIL` | Email delivery |
| `APP_URL` | Public-facing app URL (e.g., `https://meetwithoutfear.com`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | AI services (AWS Bedrock) |

Optional variables include Twilio SMS credentials, Neural Monitor dashboard settings (`DASHBOARD_API_SECRET`, `DASHBOARD_ALLOWED_EMAILS`, `DASHBOARD_URL`), model ID overrides (`BEDROCK_MODEL_ID`), and `FIELD_ENCRYPTION_KEY` (AES-256 key for application-level field encryption — gracefully degrades if not set).

### Testing & Development

| Variable | Purpose |
|----------|---------|
| `MOCK_LLM` | Mock LLM responses in tests (boolean) |
| `RUN_DB_TESTS` | Enable database integration tests (boolean) |
| `E2E_AUTH_BYPASS` | Bypass Clerk authentication for E2E tests (boolean) |
| `E2E_ADMIN_KEY` | Admin key for E2E test endpoints (default: `e2e-test-admin-key`) |
| `SHADOW_DATABASE_URL` | Shadow database for safe Prisma migrations |

### Model Configuration

| Variable | Purpose |
|----------|---------|
| `BEDROCK_HAIKU_MODEL_ID` | Override Haiku model ID (default: `global.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| `BEDROCK_SONNET_MODEL_ID` | Override Sonnet model ID (default: `global.anthropic.claude-sonnet-4-5-20250929-v1:0`) |
| `BEDROCK_TITAN_EMBED_MODEL_ID` | Override embedding model (default: `amazon.titan-embed-text-v2:0`) |

### Observability

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Sentry error tracking DSN |
| `ENABLE_PROMPT_LOGGING` | Enable prompt debug logging (dev only, blocked in production) |

## Documents

- [Mac App Options](mac-app-options.md) -- Research on Mac distribution approaches (not yet implemented)

## See Also

- `.planning/architecture/production-deployment-strategy.md` -- Neural Monitor dashboard deployment strategy (planning)
- [Environment variables](environment-variables.md), [Render config](render-config.md), [Push notifications](push-notifications.md)
