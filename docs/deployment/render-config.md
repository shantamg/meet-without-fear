---
title: Render Configuration
sidebar_position: 2
description: Render.com service definitions for Meet Without Fear.
slug: /deployment/render-config
---
# Render Configuration

Render.com service definitions for Meet Without Fear.

## render.yaml

The live `render.yaml` at repo root is intentionally minimal — secrets live in a Render **environment group** (`be-heard-api-env`), not in the blueprint file:

```yaml
services:
  - type: web
    name: meet-without-fear-api
    runtime: node
    plan: starter
    branch: main
    buildCommand: npm ci && npm run prisma:generate --workspace=backend && npm run build --workspace=backend
    startCommand: cd backend && npx prisma migrate deploy && node dist/backend/src/server.js
    envVars:
      - fromGroup: be-heard-api-env
```

### Key facts from this blueprint

- **Service name**: `meet-without-fear-api` (hyphens, not camelCase)
- **Monorepo-aware build**: Both `prisma:generate` and `build` use `--workspace=backend`; `npm ci` runs at the repo root so the full monorepo's `node_modules` is hydrated from `package-lock.json`. Using `npm ci` (rather than `npm install`) guarantees a clean, lockfile-strict install so Render's build cache can't mask stale transitive dependencies between deploys.
- **Migrations auto-run on every deploy**: `startCommand` runs `npx prisma migrate deploy` from inside `backend/` before starting the server — there is no separate manual migration step
- **Entry point**: `dist/backend/src/server.js` (nested under `backend/dist/` because TS compiles from the repo root)
- **Env group**: All secrets (DB URL, Clerk keys, Bedrock credentials, Ably, Resend, etc.) live in the Render env group `be-heard-api-env` — update them in the Render dashboard; the blueprint just wires the whole group into the service via `fromGroup`
- **Database**: managed separately as a Render Postgres instance (not declared in this `render.yaml`); connection string is injected into the env group
- **Auto-deploy disabled**: Render's built-in "auto-deploy on push" should be turned OFF for this service. Deploys are instead triggered by the GitHub Actions workflow `.github/workflows/render-deploy.yml`, which fires the service's deploy hook only when `backend/`, `shared/`, `package-lock.json`, or `render.yaml` actually changed. This prevents docs-only pushes from rebuilding the backend.

## Database Setup

After database creation, enable pgvector:

```sql
-- Connect to database and run:
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## Build Configuration

### package.json scripts

```json
{
  "scripts": {
    "build": "tsc && prisma generate",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "db:migrate": "prisma migrate deploy",
    "db:push": "prisma db push",
    "postinstall": "prisma generate"
  }
}
```

### Prisma Configuration

```prisma
// schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")  // For migrations
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

## Health Check Endpoint

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

export default router;
```

## Deployment Workflow

### Initial Deployment

1. Create the Render **Blueprint** from `render.yaml` (imports the service into the Render dashboard).
2. Create the Render Postgres database separately (not declared in the blueprint) and populate `be-heard-api-env` with its connection string plus the rest of the secrets.
3. Trigger the first deploy — migrations run automatically via the `startCommand` (`npx prisma migrate deploy`).
4. (Optional, future) When pgvector is turned on, enable the extension on the Postgres instance: `CREATE EXTENSION vector;`
5. Verify health endpoint.

### Database Migrations

```bash
# Run migrations on deployment
npm run db:migrate

# Or push schema directly (dev only)
npm run db:push
```

### Environment Variable Updates

1. Update in Render dashboard
2. Trigger manual deploy or wait for auto-deploy
3. Verify via health endpoint

## Scaling Considerations

### Horizontal Scaling

Render auto-scales within plan limits. For manual scaling:

```yaml
# render.yaml
services:
  - type: web
    name: meetwithoutfear-api
    scaling:
      minInstances: 1
      maxInstances: 3
      targetMemoryPercent: 80
      targetCPUPercent: 80
```

### Database Connection Pooling

For higher traffic, use PgBouncer or Prisma connection pooling:

```typescript
// With Prisma Data Proxy
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Pooled connection
}
```

## Monitoring

### Render Dashboard

- CPU/Memory metrics
- Request logs
- Deploy history

### Custom Logging

```typescript
// Structured logging for Render
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: process.env.NODE_ENV !== 'production' }
  }
});
```

## Related Documentation

- [Environment Variables](./environment-variables.md)
- [Architecture](../backend/overview/architecture.md)
- [Render Documentation](https://render.com/docs)

---

[Back to Deployment](./index.md)
