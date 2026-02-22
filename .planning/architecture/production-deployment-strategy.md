# Neural Monitor: Production Deployment & Data Strategy

## Executive Summary

The Neural Monitor is currently a local-only Vite+React dev tool at `tools/status-dashboard/` that connects to the backend via Vite's dev proxy (`localhost:3002` → `localhost:3000`). This document architects its transformation into a production-deployed application with authentication, optimized data access, and real-time monitoring capabilities.

**Key Recommendation**: Deploy as a new Next.js app on Vercel (like the website), reusing the existing Express backend API with new authenticated dashboard endpoints. This maximizes consistency, minimizes infrastructure overhead, and leverages established patterns.

---

## 1. Deployment Strategy

### Recommendation: Next.js on Vercel (Separate Project)

**Why Next.js over Vite:**
- Consistency with the existing website (`website/` uses Next.js + Vercel)
- Server-side rendering for initial page load (session lists, historical data)
- API routes as a BFF (Backend-for-Frontend) layer to proxy/aggregate backend calls
- Built-in Clerk middleware support via `@clerk/nextjs`
- Vercel's edge caching for static assets and ISR for semi-static data

**Why a separate Vercel project (not embedded in the website):**
- Different access model: the website is public-facing; the dashboard is admin-only
- Independent deployment cycle — dashboard changes shouldn't trigger website rebuilds
- Separate domain: `dashboard.meetwithoutfear.com` or `monitor.meetwithoutfear.com`
- Dedicated Vercel project settings (env vars, team access, analytics)

**Architecture:**

```
┌──────────────────────┐     ┌──────────────────────┐
│  Neural Monitor      │     │  Express Backend     │
│  (Next.js / Vercel)  │────▶│  (Railway/Render)    │
│                      │     │                      │
│  - Clerk auth        │     │  - /api/brain/*      │
│  - SSR pages         │     │  - Prisma/PostgreSQL  │
│  - API routes (BFF)  │     │  - Ably broadcast    │
│  - Ably client       │     │                      │
└──────────────────────┘     └──────────────────────┘
         │
         ▼
┌──────────────────────┐
│  Ably                │
│  (Real-time channel) │
│  ai-audit-stream     │
└──────────────────────┘
```

**Environment Configuration:**

```env
# Vercel project env vars for Neural Monitor
NEXT_PUBLIC_API_URL=https://api.meetwithoutfear.com  # Production backend
NEXT_PUBLIC_ABLY_KEY=...                              # Client-side Ably key
CLERK_SECRET_KEY=...                                  # Same Clerk app as website
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
DASHBOARD_API_SECRET=...                              # Shared secret for backend→dashboard auth
```

### Monorepo Location

```
meet-without-fear/
├── dashboard/              # NEW - production Neural Monitor
│   ├── app/                # Next.js App Router
│   │   ├── (auth)/         # Clerk-protected routes
│   │   │   ├── sessions/
│   │   │   ├── analytics/
│   │   │   └── live/
│   │   ├── api/            # BFF proxy routes
│   │   └── layout.tsx
│   ├── components/         # Migrated + new components
│   ├── hooks/              # Migrated + new hooks
│   ├── lib/                # Utilities, API client
│   ├── package.json
│   ├── next.config.ts
│   └── vercel.json
├── tools/status-dashboard/ # KEEP as dev-only tool (deprecate gradually)
├── website/
├── backend/
└── ...
```

Add to root `package.json` workspaces:
```json
"workspaces": ["mobile", "backend", "shared", "docs-site", "website", "dashboard", "tools/status-dashboard", "e2e"]
```

### Build Pipeline

```json
// dashboard/package.json
{
  "name": "@meet-without-fear/dashboard",
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "check": "tsc --noEmit",
    "test": "vitest"
  }
}
```

Root scripts addition:
```json
{
  "dev:dashboard": "npm --workspace dashboard run dev",
  "dashboard:build": "npm --workspace dashboard run build",
  "dashboard:deploy": "cd dashboard && vercel --prod"
}
```

---

## 2. Authentication & Authorization

### Clerk Integration (Consistent with Website)

Use the same Clerk application as the website. The dashboard requires authentication for ALL routes.

**Middleware pattern:**

```typescript
// dashboard/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});
```

### Role-Based Access Control

Clerk's metadata system for role management:

| Role | Access | Implementation |
|------|--------|----------------|
| `admin` | Full access: all sessions, all users, cost data, config | Clerk `publicMetadata.role = 'admin'` |
| `developer` | Read-only: sessions, activities, costs | Clerk `publicMetadata.role = 'developer'` |
| (default) | No dashboard access | Redirect to "Request Access" page |

**Role checking helper:**

```typescript
// dashboard/lib/auth.ts
import { currentUser } from '@clerk/nextjs/server';

type DashboardRole = 'admin' | 'developer';

export async function requireDashboardRole(role: DashboardRole = 'developer') {
  const user = await currentUser();
  if (!user) throw new Error('Not authenticated');

  const userRole = user.publicMetadata?.role as string | undefined;
  if (!userRole || !['admin', 'developer'].includes(userRole)) {
    throw new Error('Dashboard access not granted');
  }
  if (role === 'admin' && userRole !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
}
```

### Backend API Authentication for Dashboard

The brain routes (`/api/brain/*`) currently have **no authentication**. For production:

**Option A (Recommended): Shared API Secret**
- Dashboard's Next.js API routes call the backend with a `DASHBOARD_API_SECRET` header
- Backend validates this header on brain routes only
- Simple, secure, no user-level auth needed on brain routes (dashboard handles user auth)

```typescript
// backend/src/middleware/dashboard-auth.ts
export function requireDashboardAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-dashboard-secret'];
  if (secret !== process.env.DASHBOARD_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// In routes/index.ts:
router.use('/brain', requireDashboardAuth, brainRoutes);
```

**Option B: Clerk JWT forwarding**
- Dashboard sends the user's Clerk JWT to the backend
- Backend validates it with `requireAuth` middleware
- More complex, but provides user-level audit trails

**Recommendation**: Start with Option A. The dashboard is an internal tool; a shared secret is sufficient and simpler. If user-level audit trails become needed, upgrade to Option B later.

---

## 3. Data Access Layer

### Existing Endpoints (Reuse)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /api/brain/sessions` | Paginated session list with summary stats | Exists, works well |
| `GET /api/brain/activity/:sessionId` | All activities + messages for a session | Exists, works well |
| `GET /api/brain/sessions/:sessionId/context` | Assembled context bundle | Exists, works well |

### New Endpoints Needed

#### 3.1 Aggregated Cost Analytics

```typescript
// GET /api/brain/analytics/costs?period=day|week|month&from=ISO&to=ISO
// Returns cost aggregations for the dashboard's analytics page

interface CostAnalyticsResponse {
  period: 'day' | 'week' | 'month';
  data: Array<{
    periodStart: string;   // ISO date
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    activityCount: number;
    byModel: Record<string, {
      cost: number;
      inputTokens: number;
      outputTokens: number;
      count: number;
    }>;
    byCallType: Record<string, {
      cost: number;
      count: number;
      avgDurationMs: number;
    }>;
  }>;
  totals: {
    totalCost: number;
    totalActivities: number;
    avgCostPerSession: number;
    avgCostPerTurn: number;
  };
}
```

**Implementation**: Use Prisma `groupBy` with `DATE_TRUNC` via raw SQL for period bucketing. For daily/weekly views, this can run on-demand against the existing `BrainActivity` table with the `createdAt` index.

```sql
-- Example: daily cost aggregation
SELECT
  DATE_TRUNC('day', "createdAt") AS period_start,
  model,
  SUM(cost) AS total_cost,
  SUM("tokenCountInput") AS total_input_tokens,
  SUM("tokenCountOutput") AS total_output_tokens,
  COUNT(*) AS activity_count
FROM "BrainActivity"
WHERE "createdAt" BETWEEN $1 AND $2
  AND status = 'COMPLETED'
GROUP BY period_start, model
ORDER BY period_start DESC;
```

#### 3.2 Cache Hit Rate Calculations

```typescript
// GET /api/brain/analytics/cache-rates?from=ISO&to=ISO&sessionId=optional
// Calculates prompt caching effectiveness

interface CacheAnalyticsResponse {
  overall: {
    totalRequests: number;
    cacheHitRate: number;        // 0-1
    tokensSaved: number;         // Estimated tokens not re-processed
    estimatedCostSavings: number;
  };
  byModel: Record<string, {
    requests: number;
    cacheHitRate: number;
    avgInputTokens: number;
  }>;
  trend: Array<{
    date: string;
    cacheHitRate: number;
    requestCount: number;
  }>;
}
```

**Implementation**: The `metadata` JSON field on `BrainActivity` already stores cache-related data from the Bedrock SDK response (cache read/write token counts). Parse this to compute hit rates:

```typescript
// Extract from metadata.usage.cache_read_input_tokens / metadata.usage.input_tokens
const cacheHitRate = activity.metadata?.usage?.cache_read_input_tokens
  ? activity.metadata.usage.cache_read_input_tokens / activity.metadata.usage.input_tokens
  : 0;
```

#### 3.3 Turn-Level Breakdowns

```typescript
// GET /api/brain/activity/:sessionId/turns
// Groups activities by turnId with per-turn summaries

interface TurnBreakdownResponse {
  turns: Array<{
    turnId: string;
    userMessage: string;
    aiResponse: string;
    activities: Array<{
      id: string;
      callType: string;
      model: string;
      cost: number;
      durationMs: number;
      tokenCountInput: number;
      tokenCountOutput: number;
    }>;
    totals: {
      cost: number;
      durationMs: number;
      activityCount: number;
    };
  }>;
}
```

**Note**: The existing `GET /api/brain/activity/:sessionId` already returns activities with `turnId`. The turn grouping can be done client-side (the dashboard already has `utils/turnGrouping.ts`) or server-side for pagination.

#### 3.4 Single Session Detail

```typescript
// GET /api/brain/sessions/:sessionId
// Returns session metadata + summary (avoids fetching all sessions)
```

Currently the dashboard fetches all sessions to find one. Add a direct lookup.

### Database Indexes

The existing indexes are sufficient for current query patterns:

```prisma
@@index([sessionId])      // Primary lookup pattern
@@index([turnId])         // Turn-level grouping
@@index([activityType])   // Filter by type
@@index([createdAt])      // Time-range queries
```

**Additional index for analytics** (add when needed):

```prisma
@@index([createdAt, model])  // Cost-by-model-over-time queries
@@index([status, createdAt]) // Completed activities by time
```

### Query Optimization Notes

- **No materialized views needed yet**: BrainActivity table grows linearly with usage. At current scale (dev/beta), raw queries with indexes are fast enough.
- **Future**: If the table exceeds ~1M rows, consider a daily aggregation cron job that writes to a `BrainActivityDailySummary` table.
- **Connection pooling**: Prisma already handles this. Vercel's serverless functions will use Prisma's connection pool.

---

## 4. Real-time Architecture

### Current Setup (Keep)

- Backend broadcasts to Ably channel `ai-audit-stream` when `ENABLE_AUDIT_STREAM=true`
- Events: `brain-activity` (activity updates), `new-message` (user/AI messages), `session-created`
- Dashboard subscribes to these events for live updates

### Production Adaptations

#### 4.1 Ably Token Authentication (Replace API Key)

The current dashboard uses a raw Ably API key (`VITE_ABLY_KEY`). In production, use Ably's token authentication:

```typescript
// dashboard/app/api/ably-token/route.ts
import { NextResponse } from 'next/server';
import Ably from 'ably';
import { requireDashboardRole } from '@/lib/auth';

export async function GET() {
  await requireDashboardRole(); // Ensure authenticated

  const ably = new Ably.Rest(process.env.ABLY_API_KEY!);
  const tokenRequest = await ably.auth.createTokenRequest({
    capability: { 'ai-audit-stream': ['subscribe'] }, // Read-only
  });

  return NextResponse.json(tokenRequest);
}
```

```typescript
// Client-side: use authUrl instead of raw key
const client = new Ably.Realtime({
  authUrl: '/api/ably-token',
  authMethod: 'GET',
});
```

#### 4.2 Live vs Historical Data

The dashboard needs to handle two modes:

| Mode | Data Source | Use Case |
|------|-----------|----------|
| **Live** | Ably subscription + API polling | Monitoring active sessions in real-time |
| **Historical** | API only (paginated) | Reviewing past sessions, analytics |

**Implementation**: The session detail page already handles this well — it loads historical data via API and subscribes to Ably for live updates. The key change is ensuring the Ably subscription is only active when:
1. The user is viewing a live/active session
2. The user is on the "Live Monitor" page

#### 4.3 WebSocket Connection Management

- **Lazy connect**: Only establish Ably connection when the user navigates to a live-data page
- **Auto-disconnect**: Clean up Ably connection when navigating to purely historical views
- **Reconnection**: Ably handles this automatically, but add UI indicators for connection state (already exists in current dashboard)
- **Rate limiting**: Ably's built-in rate limiting is sufficient. The `ai-audit-stream` channel volume is bounded by user interactions.

---

## 5. Performance Considerations

### 5.1 Pagination Strategy

| Resource | Strategy | Page Size |
|----------|----------|-----------|
| Sessions list | Cursor-based (by `updatedAt`) | 20 |
| Session activities | Load all (bounded by session lifetime) | No pagination needed |
| Analytics data | Date-range bounded | N/A |
| Turn breakdowns | Load all per session | No pagination needed |

The existing cursor-based pagination for sessions is well-implemented. Activities per session are naturally bounded (typically 20-200 per session), so pagination isn't needed there.

### 5.2 Data Aggregation

**On-demand (Phase 1):**
- Cost analytics computed from raw `BrainActivity` rows with SQL aggregation
- Cache hit rates computed from `metadata` JSON parsing
- Acceptable performance up to ~100K activity records

**Pre-computed (Phase 2, when needed):**
- Daily summary table populated by a cron job
- Reduces analytics query time from seconds to milliseconds
- Trigger: when analytics page load exceeds 2 seconds

```prisma
// Future: pre-computed daily summaries
model BrainActivityDailySummary {
  id            String   @id @default(cuid())
  date          DateTime @db.Date
  model         String
  callType      String?
  totalCost     Float
  totalInput    Int
  totalOutput   Int
  activityCount Int
  avgDurationMs Float
  cacheHitRate  Float?

  @@unique([date, model, callType])
  @@index([date])
}
```

### 5.3 Client-Side Caching

Use React Query (TanStack Query) in the production dashboard for:
- **Session list**: `staleTime: 30s`, refetch on window focus
- **Session detail**: `staleTime: Infinity` (immutable once loaded, updated via Ably)
- **Analytics**: `staleTime: 5min` (expensive queries, data changes slowly)
- **Context bundle**: `staleTime: 0` (always fresh, assembled on-demand)

This aligns with the mobile app's React Query patterns documented in CLAUDE.md.

### 5.4 Lazy Loading

- **Session list page**: Load session metadata only; fetch activity counts/costs in summary
- **Session detail page**: Load activities on navigation; defer context bundle loading to a tab interaction
- **Analytics page**: Load summary totals first; load chart data as individual queries per chart
- **Charts**: Dynamic import charting library (`next/dynamic` with `ssr: false`)

---

## 6. Tech Stack Decisions

### 6.1 Framework: Next.js (App Router)

**Rationale:**
- Consistent with website (`website/` already uses Next.js)
- SSR for initial data loading (session lists, analytics)
- API routes as BFF (avoids CORS, centralizes auth)
- Clerk's first-class Next.js support
- Vercel deployment with zero config

### 6.2 Chart Library: Recharts

**Rationale:**
- React-native (declarative, composable)
- Lightweight (~50KB gzipped)
- Good TypeScript support
- Handles the dashboard's chart types well: line charts (cost trends), bar charts (model comparison), area charts (token usage)
- No need for D3's complexity or Nivo's heavy bundle

**Alternatives considered:**
- **D3**: Too low-level for dashboard charts; overkill
- **Chart.js**: Imperative API doesn't fit React patterns well
- **Nivo**: Beautiful but heavy bundle (~200KB); built on D3

### 6.3 State Management: React Query + React Context

- **React Query (TanStack Query)**: Server state (API data, caching, refetching)
- **React Context**: UI state (selected filters, view preferences, connection status)
- **No Redux/Zustand needed**: Dashboard state is primarily server-derived

This mirrors the mobile app's architecture exactly (per CLAUDE.md's State Management Architecture section).

### 6.4 CSS: Tailwind CSS

**Rationale:**
- Consistent with website (`website/` uses Tailwind)
- Fast iteration for dashboard layouts
- Good dark mode support (dashboards benefit from dark themes)
- Utility-first approach works well for data-dense UIs

The current dashboard uses plain CSS. Migration to Tailwind happens naturally during the component rewrite.

### 6.5 Component Library: None (Custom)

The dashboard has specialized visualization needs (turn views, activity items, context viewers) that don't map to standard UI libraries. Keep building custom components with Tailwind, as the current dashboard already does.

Consider headless UI primitives from `@radix-ui` for:
- Dropdown menus (filter selectors)
- Tabs (session detail tabs)
- Tooltips (chart data points)
- Dialog (detail views)

---

## 7. Shared Types

### Types to Share via `shared/`

The dashboard needs BrainActivity-related types. These should live in `shared/` so both backend and dashboard import from the same source:

```typescript
// shared/src/types/brain-activity.ts (NEW)
export interface BrainActivityDTO {
  id: string;
  sessionId: string;
  turnId: string | null;
  activityType: ActivityType;
  model: string;
  callType: BrainActivityCallType | null;
  tokenCountInput: number;
  tokenCountOutput: number;
  cost: number;
  durationMs: number;
  status: ActivityStatus;
  createdAt: string;
  completedAt: string | null;
  // Omit input/output/metadata for list views (large JSON)
}

export interface BrainActivityDetailDTO extends BrainActivityDTO {
  input: unknown;
  output: unknown;
  metadata: unknown;
  structuredOutput: unknown;
}

export interface SessionSummaryDTO {
  id: string;
  type: 'PARTNER' | 'INNER_WORK';
  status: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  stats: {
    totalCost: number;
    totalTokens: number;
    activityCount: number;
    turnCount: number;
  };
}
```

The existing dashboard types at `tools/status-dashboard/src/types/` can be migrated to `shared/` during the transition.

---

## 8. Data Retention & Archiving

### Retention Policy

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| BrainActivity (full) | 90 days | Input/output JSON is large; needed for debugging |
| BrainActivity (summary) | Indefinite | Cost/token counts are small; needed for analytics |
| Daily aggregations | Indefinite | Pre-computed summaries are tiny |
| Context bundles | Not stored | Assembled on-demand; no retention needed |

### Implementation

#### Phase 1: Soft Archiving
- Add `archivedAt` field to BrainActivity
- After 90 days, set `archivedAt` and null out `input`, `output`, `metadata`, `structuredOutput` (the large JSON fields)
- Keep `cost`, `tokenCountInput`, `tokenCountOutput`, `durationMs`, `model`, `callType` for analytics
- Run via a daily cron job

```typescript
// Archive activities older than 90 days
await prisma.brainActivity.updateMany({
  where: {
    createdAt: { lt: ninetyDaysAgo },
    archivedAt: null,
  },
  data: {
    input: Prisma.DbNull,
    output: Prisma.DbNull,
    metadata: Prisma.DbNull,
    structuredOutput: Prisma.DbNull,
    archivedAt: new Date(),
  },
});
```

#### Phase 2: Export Capabilities
- CSV/JSON export for date ranges
- Accessible from the dashboard's analytics page
- Uses streaming response for large exports

```typescript
// GET /api/brain/export?from=ISO&to=ISO&format=csv|json
```

---

## 9. Migration Path

### Phase 1: Backend Hardening (Before Dashboard Deploy)
1. Add `requireDashboardAuth` middleware to brain routes
2. Add `GET /api/brain/sessions/:sessionId` endpoint
3. Add `GET /api/brain/analytics/costs` endpoint
4. Add shared types to `shared/src/types/brain-activity.ts`

### Phase 2: Dashboard Scaffold
1. Create `dashboard/` workspace with Next.js + Clerk + Tailwind
2. Set up Vercel project with env vars
3. Implement auth flow (sign-in, role checking)
4. Implement BFF API routes that proxy to backend

### Phase 3: Feature Migration
1. Migrate session browser from `tools/status-dashboard/`
2. Migrate session detail view with turn grouping
3. Migrate context viewer
4. Migrate Ably real-time integration (with token auth)

### Phase 4: New Features
1. Build analytics/cost dashboard page
2. Build cache hit rate visualizations
3. Build prompt pipeline visualization
4. Add data export functionality

### Phase 5: Deprecation
1. Add deprecation notice to `tools/status-dashboard/`
2. Update `npm run dev:status` to point to new dashboard
3. Eventually remove `tools/status-dashboard/` from workspaces

---

## 10. Cost Estimates

### Vercel
- **Pro plan**: Already used for website and docs — no additional cost
- **Serverless function invocations**: Dashboard is low-traffic (admin only); well within limits
- **Bandwidth**: Minimal — dashboard serves mostly JSON

### Ably
- **Already paid for**: Dashboard uses the same `ai-audit-stream` channel
- **Additional connections**: 1-3 dashboard users adds negligible load

### Total incremental cost: ~$0/month
The dashboard rides on existing infrastructure with no meaningful additional cost.
