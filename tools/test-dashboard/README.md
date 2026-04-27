# MWF Test Dashboard

A web UI for browsing Playwright e2e test runs, screenshots, and snapshots — replacing Slack screenshot threads as the primary "browse all runs" surface.

See the plan: [`/.planning/TEST_DASHBOARD_PLAN.md`](../../.planning/TEST_DASHBOARD_PLAN.md).

## Dev

```bash
npm install
npm run dev          # Vite dev server on :3003 (mock data fallback if API down)
npm run dev:vercel   # vercel dev — runs api/* serverless functions on :3000 + Vite
npm run check        # tsc
npm run build        # production build
npm run deploy       # vercel --prod
```

## Env vars

Create `.env.local`:

```
# Optional — enables live updates from the slam-bot
VITE_ABLY_KEY=

# Optional — flip to "1" to disable mock fallback in dev
VITE_USE_REAL_API=

# Phase 1B+ (Clerk auth, before sharing with Darryl)
# VITE_CLERK_PUBLISHABLE_KEY=
```

## Architecture

- **Frontend**: React 19 + Vite + react-router-dom v7
- **API routes**: `tools/test-dashboard/api/*.ts` (Vercel serverless, owned by a separate agent)
- **Storage**: Vercel Postgres (run/snapshot metadata) + Vercel Blob (screenshots)
- **Realtime**: Ably channel `test-runs:updates`

In dev, if no API is running, the fetch helpers fall back to `src/services/mock.ts` so the UI is fully browsable without backend.
