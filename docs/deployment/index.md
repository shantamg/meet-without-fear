---
created: 2026-03-11
updated: 2026-03-11
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
- **Build command**: `npm install && npm run prisma:generate --workspace=backend && npm run build --workspace=backend`
- **Start command**: `cd backend && npx prisma migrate deploy && node dist/backend/src/server.js`
- **Environment variables**: Loaded from the `meet-without-fear-api-env` environment group on Render

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

Build profiles are defined in `mobile/eas.json`. Each profile configures its own Clerk keys, API URL, and Mixpanel token.

| Profile | Purpose |
|---------|---------|
| `development` | Local dev build pointing at `http://localhost:3000` |
| `development-production` | Dev client against production API (`https://api.meetwithoutfear.com`) |
| `development-simulator` | iOS simulator build for local development |
| `preview` | Internal staging distribution build |
| `production` | App Store / Play Store release build |
| `android-apk` | Standalone APK build for sideloading |

### Website & Docs: Vercel

| Target | Workspace | Deploy Command |
|--------|-----------|----------------|
| Website | `website/` | `npm run website:deploy` (runs `cd website && vercel --prod`) |
| Docs site | `docs-site/` | `npm run docs:deploy` (runs Vercel deploy in docs-site workspace) |
| Status dashboard | `tools/status-dashboard/` | `npm run deploy:status` (runs `cd tools/status-dashboard && vercel --prod`) |

## CI/CD Pipeline

GitHub Actions runs on every push to `main` and every pull request targeting `main`. The workflow is defined in `.github/workflows/ci.yml`.

**Steps:**

1. Starts a PostgreSQL 16 service container (health-checked with `pg_isready`)
2. Checks out the repository and sets up Node.js 20 with npm caching
3. Installs dependencies (`npm ci`)
4. Generates the Prisma client (`npx prisma generate` in `backend/`)
5. Runs database migrations (`npx prisma migrate deploy` in `backend/`)
6. Runs type checking across all workspaces (`npm run check`)
7. Runs tests across all workspaces (`npm run test`)

The pipeline uses a dedicated test database (`meetwithoutfear_test`) with `NODE_ENV=test`. All steps must pass before a PR can be merged.

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
| `DISABLE_PROMPT_LOGGING` | Disable prompt/completion logging (boolean) |

## Documents

- [Mac App Options](mac-app-options.md) -- Research on Mac distribution approaches (not yet implemented)

## See Also

- `.planning/architecture/production-deployment-strategy.md` -- Neural Monitor dashboard deployment strategy (planning)
- [MVP Planning: Deployment](../mvp-planning/plans/deployment/index.md) -- Original deployment specs
