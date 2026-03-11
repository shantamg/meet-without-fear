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

### Website & Docs: Vercel

| Target | Workspace | Deploy Command |
|--------|-----------|----------------|
| Website | `website/` | `npm run website:deploy` (runs `cd website && vercel --prod`) |
| Docs site | `docs-site/` | `npm run docs:deploy` (runs Vercel deploy in docs-site workspace) |
| Status dashboard | `tools/status-dashboard/` | `npm run deploy:status` (runs `cd tools/status-dashboard && vercel --prod`) |

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

Optional variables include Twilio SMS credentials, Neural Monitor dashboard settings (`DASHBOARD_API_SECRET`, `DASHBOARD_ALLOWED_EMAILS`, `DASHBOARD_URL`), and model ID overrides (`BEDROCK_MODEL_ID`).

## Documents

- [Mac App Options](mac-app-options.md) -- Research on Mac distribution approaches (not yet implemented)

## See Also

- `.planning/architecture/production-deployment-strategy.md` -- Neural Monitor dashboard deployment strategy (planning)
- [MVP Planning: Deployment](../mvp-planning/plans/deployment/index.md) -- Original deployment specs
