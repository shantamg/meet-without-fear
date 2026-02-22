# Neural Monitor v2 — Comprehensive Redesign Plan

## Executive Summary

The Neural Monitor is an internal developer tool for observing the Meet Without Fear AI pipeline. Currently a local-only Vite+React app (`tools/status-dashboard/`) with real-time Ably integration, it shows brain activity events per session but lacks cost analytics, prompt caching visibility, historical analysis, and production deployment.

This plan transforms it into a production-deployed observability platform with five key capabilities:
1. **Dashboard Overview** — At-a-glance health metrics, active sessions, cost trends
2. **Cost & Cache Analytics** — Dedicated cost breakdown with cache hit rate visualization
3. **Prompt Pipeline Inspector** — Deep-dive into prompt construction, caching, and response parsing
4. **Session Playback** — Step through historical sessions turn-by-turn
5. **Live Monitor** — Real-time event stream (preserved from current)

---

## 1. What Exists Today

### Current Architecture
- **Frontend**: Vite + React 19 + React Router + TypeScript
- **Backend**: Express + Prisma (3 endpoints in `backend/src/routes/brain.ts`)
- **Real-time**: Ably (`ai-audit-stream` channel)
- **Storage**: BrainActivity records in PostgreSQL with cost/token/duration data
- **Location**: `tools/status-dashboard/` (local dev only, port 3002)

### Current Views
| View | Route | Description |
|------|-------|-------------|
| Session Browser | `/` | Paginated session list with stats |
| Session Detail | `/session/:id` | Split-view activity timeline with 16 typed event components |
| Context Page | `/session/:id/context` | AI context bundle visualization (8 sections per user) |

### What Works Well
- 16 specialized event components with BaseEventWrapper pattern
- Real-time Ably streaming with live activity updates
- Split view for partner sessions (initiator/invitee columns)
- Type-safe frontend and backend throughout
- Turn grouping logic with fallback strategies
- FormattedPrice component with significant digit highlighting

### Key Gaps
- **No cost analytics** — Only per-activity and session-total costs, no breakdowns by model/call-type/stage
- **No cache visibility** — `cacheReadInputTokens` and `cacheWriteInputTokens` stored in metadata but never displayed
- **No filtering/search** — Can't filter sessions or activities by any dimension
- **No historical analysis** — Can't compare sessions, see trends, or analyze patterns
- **No production deployment** — Local only, no auth, no URL
- **No prompt inspection** — Can't see what system prompt was sent, what was cached, or how context was injected
- **Performance issues** — No virtualization for large activity lists, all data loaded at once

---

## 2. Redesigned Navigation & Screen Architecture

### Route Structure

| Route | View | Audience | Priority |
|-------|------|----------|----------|
| `/` | Dashboard Overview | Both | P0 |
| `/sessions` | Session List | Both | P0 |
| `/sessions/:id` | Session Detail (Timeline) | Developer | P0 |
| `/sessions/:id/prompt/:activityId` | Prompt Inspector | Developer | P1 |
| `/sessions/:id/context` | Context Bundle (existing) | Developer | P0 (keep) |
| `/costs` | Cost Analysis | Stakeholder | P0 |
| `/live` | Live Monitor | Developer | P1 |

### Layout: Collapsible Sidebar + Main Content

```
┌─────────────────────────────────────────────────────┐
│ ● Neural Monitor          [Cmd+K search]  [🔔] [⚙️] │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │           MAIN CONTENT                   │
│ (240px)  │                                          │
│          │  (varies by selected view)               │
│ ◉ Dash   │                                          │
│ ◎ Sessions│                                         │
│ ◎ Costs  │                                          │
│ ◎ Live   │                                          │
│          │                                          │
│──────────│                                          │
│ RECENT   │                                          │
│ session1 │                                          │
│ session2 │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

Sidebar collapses to 56px icon-only via `Cmd+B`. Bottom section shows last 5 visited sessions.

---

## 3. Screen-by-Screen Specifications

### 3.1 Dashboard Overview (`/`)

**Purpose**: 5-second health check for stakeholders.

**Top Row — 6 Metric Cards:**

| Card | Value | Sparkline | Delta | Color Logic |
|------|-------|-----------|-------|-------------|
| Total Cost | Sum of all costs in period | 7-day daily cost | vs previous period | Red if up, green if down |
| Cache Hit Rate | `cache_read / total_input * 100` | 7-day daily rate | vs previous period | Green if up, red if down |
| Cache Savings | `cache_read_tokens * (input_price - cache_read_price) / 1000` | 7-day daily savings | vs previous period | Green always |
| API Calls | Count of BrainActivity records | 7-day daily count | vs previous period | Neutral (blue) |
| Avg Cost/Session | Total cost / unique sessions | 7-day daily avg | vs previous period | Red if up, green if down |
| Avg Latency | Mean of durationMs | 7-day daily avg | vs previous period | Red if up, green if down |

**Middle Row:**
- Cost trend **stacked bar chart** showing daily cost by **token type** (standard input, cached read, cache write, output) — this reveals cache optimization impact better than model-level breakdown
- Model distribution donut chart (Sonnet/Haiku/Titan)

**Bottom:**
- Recent sessions table (5 rows), each showing: status dot, participants, stage, turns, cost, age

**Data Requirements:**
- New backend endpoint: `GET /api/brain/dashboard?period=24h|7d|30d`
- Returns: `{ activeSessions, periodCost, cacheHitRate, avgResponseMs, costTrend[], modelDistribution, recentSessions[] }`

---

### 3.2 Session List (`/sessions`)

**Enhancements over current:**
- Filterable by: status, type (partner/inner work), stage (0-4), date range
- Searchable by: participant names, emails, session IDs
- Sortable columns: participants, status, stage, turns, cost, age
- Pagination: 25 per page with URL query param persistence (shareable filter links)

**New Backend Support:**
- Extend `GET /api/brain/sessions` with query params: `?status=ACTIVE&type=PARTNER&stage=2&search=alex&from=2026-02-01&to=2026-02-22&sort=cost&order=desc`

---

### 3.3 Session Detail (`/sessions/:id`)

**Layout**: Header + sub-tabs + content

**Header Bar:**
- Back arrow, session title, live indicator, stage badge
- Summary stats: turns, total cost, duration, cache hit rate
- Sub-tabs: **Timeline** | Context | Cost | Prompts

**Timeline Tab** (default, enhanced current view):
- Keep existing split view for partner sessions
- Keep existing 16 typed event components + BaseEventWrapper
- Add: per-event cache indicator badge (shows if system prompt was a cache hit)
- Add: "Jump to turn" selector
- Add: activity type filter pills at top (show/hide by call type)
- Add: keyboard navigation (j/k for turns, h/l for columns, Enter to expand)

**Context Tab** (existing, preserved as-is)

**Cost Tab** (new, per-session):
- Cost timeline per turn (stacked bar: Sonnet/Haiku/Titan)
- Cache efficiency per turn (stacked bar: cached/uncached/write)
- Token budget utilization per turn (bar showing % of 150k used)
- Model routing decisions table (which model was chosen for each step and why)
- Total session cost breakdown cards

**Prompts Tab** (new, organized as sub-tabs):

*Overview sub-tab:*
- **Pipeline Flow Diagram**: Interactive Sankey-style node graph showing the full orchestration pipeline for each turn:
  ```
  USER MESSAGE → Memory Intent → [Context Assembly | Retrieval | Shared Content | Milestone] →
  Context Merge → Retrieval Planning (conditional) → Prompt Builder → Token Budget →
  Model Router → LLM Call → Tag Trap → Response Parse → SSE Stream
  ```
  - Node colors: Blue (decisions), Green (data assembly), Orange (LLM calls), Red (filtering/parsing)
  - Edge thickness proportional to token count flowing through
  - Parallel branches grouped with "Promise.all" brackets
  - Skipped/conditional nodes shown grayed out
  - Click any node to expand detail panel
  - Badge overlays show duration per node
- **Pipeline Timing Waterfall**: Chrome DevTools Network-style horizontal bars showing duration of each pipeline step, with parallel grouping and bottleneck highlighting

*Prompt sub-tab:*
- List of all LLM calls in the session with system prompt preview
- Click any to open Prompt Inspector
- Shows which calls had cache hits vs misses
- Prompt diff viewer to compare system prompts between consecutive turns (git-style unified diff with change categories: TURN_COUNTER, INTENSITY_CHANGE, PHASE_SHIFT, STAGE_TRANSITION)

*Response sub-tab:*
- **Response Parsing Viewer**: Side-by-side raw vs parsed with syntax-highlighted tags (`<thinking>`=red, `<draft>`=blue, `<dispatch>`=orange). Shows extracted flags as badges (FeelHeardCheck, ReadyShare, Mode, UserIntensity)
- **Tag Trap Visualization**: Three-phase state machine replay showing thinking trap → tag trap → normal streaming phases with timing and buffer contents
- **Dispatch Flow**: Decision tree showing trigger detection and routing to handlers (EXPLAIN_PROCESS, EXPLAIN_EMPATHY_PURPOSE, HANDLE_MEMORY_REQUEST)

---

### 3.4 Prompt Inspector (`/sessions/:id/prompt/:activityId`)

**Purpose**: "Chrome DevTools Network tab" for a single LLM call.

**3-Panel Horizontal Layout:**

**Left — Request:**
- **System Prompt Block**: Syntax-highlighted with cache indicator badge
  - `CACHED ✓` (green) if `cacheReadInputTokens > 0` for system portion
  - `NOT CACHED` (gray) otherwise
  - Shows static block vs dynamic block separation clearly
  - Token count per block
- **Context Injection**: What context was injected into the last user message
  - Similarity scores for retrieved content
  - Token count
- **Messages Array**: Chat-style conversation history
  - Role badges (user/assistant)
  - Cache break indicator showing which message had `cache_control`
  - "Show N earlier messages" collapse for long histories

**Center — Response:**
- **Response Text**: Final user-facing response (prose)
- **Thinking Block**: Collapsible, shows extracted `<thinking>` content
  - Mode, intensity, strategy, FeelHeardCheck, ReadyShare flags
- **Draft Block**: If `<draft>` was present (invitation/empathy statement)
- **Dispatch Tag**: If `<dispatch>` triggered an off-ramp
- **Raw JSON Toggle**

**Right — Metadata:**
- Model name + version
- Token counts:
  - Input tokens (total)
  - Output tokens
  - Cache read tokens
  - Cache write tokens
  - Uncached input tokens (computed: input - cacheRead - cacheWrite)
- Cost breakdown:
  - Uncached input cost: `uncachedInput/1000 * price.input`
  - Cache read cost: `cacheRead/1000 * price.cacheRead`
  - Cache write cost: `cacheWrite/1000 * price.cacheWrite`
  - Output cost: `output/1000 * price.output`
  - **Total cost**
  - **Savings**: how much would have been spent without caching
- Cache analysis visual bar:
  ```
  ████████░░░░ 67% cached
  [cache read] [cache write] [uncached]
  ```
- Timing: duration, TTFB (if available)
- Call type, operation name

**Interactions:**
- "Compare with previous turn" button → side-by-side diff of system prompts
- Copy buttons on all text blocks
- Toggle between formatted and raw JSON views

---

### 3.5 Cost Analysis (`/costs`)

**Purpose**: Dedicated cost analytics page for budget monitoring.

**Top Row — Summary Cards:**
| Card | Value | Subtext |
|------|-------|---------|
| Period Total | $X.XXXX | "over 7 days" |
| vs Previous Period | +/-X.X% | green/red arrow |
| Per Session Average | $X.XXXX | "across N sessions" |
| Cache Savings | $X.XXXX saved | "X% of potential cost" |

**Cost Over Time Chart (main chart):**
- Stacked area chart showing daily cost by model (Sonnet=blue, Haiku=green, Titan=yellow)
- Time range selector: 24h / 7d / 30d / custom
- Hover tooltip with exact values
- Toggleable series (click legend to show/hide models)

**Breakdown Section (2 columns):**

Left — **By Model**:
- Horizontal bar chart
- Sonnet: 68% ($X.XX) ████████
- Haiku: 27% ($X.XX) ████
- Titan: 5% ($X.XX) █

Right — **By Call Type**:
- Horizontal bar chart
- Orchestrated Response: 62% ████████
- Reconciler Analysis: 18% ███
- Classification: 8% ██
- Other: 12% ██

**Cache Efficiency Section (4 visualizations):**
- **Cache Hit Rate Donut**: Overall cache hit rate as donut chart with percentage center
- **Cache Efficiency Over Time**: 100% stacked area chart showing cache read / cache write / uncached ratio per day
- **Cache Heatmap**: Stage (0-4) x Day matrix showing cache hit rate per cell — reveals which stages benefit most from caching
- **Savings Waterfall**: Baseline cost → minus cache savings → actual cost, showing optimization impact visually

**Cost by Stage Section:**
- Horizontal stacked bar chart (Stages 0-4), each bar split by model (Sonnet/Haiku/Titan)
- Reveals which conversation stages are most expensive

**Token Budget Utilization:**
- Half-donut gauge showing % of 150k context window used (avg across calls)
- Breakdown: system prompt | pinned content | summary | recent history | RAG | available
- Shows how close calls are to the context limit

**Cost Flow Sankey Diagram** (advanced, Phase 5):
- Full cost flow: Total Cost → Model (Sonnet/Haiku/Titan) → Stage (0-4) → Token Type (input/output/cached)
- Interactive: hover nodes/edges for exact values
- Uses @visx/sankey (Recharts doesn't support Sankey natively)

**Cost by Session Table:**
- Sortable: session name, turns, Sonnet cost, Haiku cost, Titan cost, total cost
- Click row → navigate to session detail cost tab
- Export button → CSV download

**Data Requirements:**
- New endpoint: `GET /api/brain/costs?period=7d&groupBy=day|model|callType`
- Returns: `{ summary, costTimeline[], modelBreakdown[], callTypeBreakdown[], cacheMetrics, sessionCosts[] }`
- Aggregation queries on BrainActivity table with groupBy on model, callType, date

---

### 3.6 Live Monitor (`/live`)

**Purpose**: Real-time event stream ("tail -f" for the AI pipeline).

**Layout:**
- Connection status indicator + Pause/Resume button
- Session tabs: [All Sessions] + one tab per active session (auto-created)
- Reverse-chronological event stream

**Event Cards:**
- Timestamp (HH:MM:SS.mmm)
- Session name + colored dot
- Event type icon + title
- Model badge + duration + cost + status
- One-line preview
- PENDING events show spinner, update in-place when COMPLETED

**Interactions:**
- Click event → expand to full details
- Filter: LLM calls only / All events / Errors only
- Auto-scroll toggle
- Pause/Resume stream (buffers events while paused)

---

### 3.7 Session Playback (within Session Detail)

**Activation**: `[▶ Playback]` button in session detail header.

**Controls:**
- Timeline scrubber with turn markers
- Step forward/back buttons
- Auto-play with speed control (1s/2s/5s per turn)
- Stage transition markers on scrubber

**Display:**
- Session detail view filtered to turns up to current playback position
- Current turn highlighted with glow effect
- Pipeline steps auto-expand as you arrive at each turn

---

## 4. Visual Design System

### Color Palette (Dark Theme)

```
Backgrounds:     #0a0e1a (base), #111827 (surface), #1e293b (elevated), #334155 (overlay)
Text:            #f1f5f9 (primary), #94a3b8 (secondary), #64748b (muted)

Model Colors:    Sonnet=#3b82f6 (blue), Haiku=#10b981 (green), Titan=#eab308 (yellow)
Stage Colors:    S0=#6b7280, S1=#3b82f6, S2=#8b5cf6, S3=#f59e0b, S4=#10b981
Semantic:        Success=#4ade80, Warning=#fbbf24, Error=#f87171, Cost=#fbbf24 (gold)
```

### Typography
- UI Labels: Inter / system-ui (14px)
- Data/Metrics: JetBrains Mono (monospace)
- Prompts/Code: JetBrains Mono with syntax highlighting
- Narrative: Inter (16px, 1.6 line-height)

### Key Components
| Component | Description |
|-----------|-------------|
| `MetricCard` | Number + label + sparkline, used in dashboard |
| `ModelBadge` | Colored pill: Sonnet (blue), Haiku (green), Titan (yellow) |
| `StageBadge` | Colored pill with stage number + name |
| `CostDisplay` | Monospace price with significant digit highlighting (existing FormattedPrice enhanced) |
| `TokenBar` | Horizontal stacked bar: input/output/cache-read/cache-write |
| `CacheIndicator` | Badge: `CACHED ✓` (green) or `MISS` (gray) |
| `PromptBlock` | Syntax-highlighted text with cache_control annotations |
| `DataTable` | Sortable, filterable, paginated table |
| `SparkChart` | Inline mini chart for trends |

---

## 5. Data Model & Backend Changes

### New API Endpoints

#### 1. Dashboard Metrics
```
GET /api/brain/dashboard?period=24h|7d|30d
```
Returns: active session count, period cost, cache hit rate, avg response time, cost trend array, model distribution, recent sessions.

**Implementation**: Aggregate queries on BrainActivity with date filters + active session count.

#### 2. Cost Analytics
```
GET /api/brain/costs?period=7d&groupBy=day|model|callType&from=&to=
```
Returns: summary metrics, time-series cost data, model/callType breakdowns, cache metrics, per-session costs.

**Implementation**: `prisma.brainActivity.groupBy()` with `_sum` on cost, tokenCountInput, tokenCountOutput. Cache metrics from metadata JSON extraction (cacheReadInputTokens, cacheWriteInputTokens).

#### 3. Enhanced Sessions List
```
GET /api/brain/sessions?status=&type=&stage=&search=&from=&to=&sort=&order=&cursor=&limit=25
```
Extends current endpoint with filter/search/sort capabilities.

**Implementation**: Add WHERE clauses for new filters, full-text search on user names/emails via Prisma, sort by arbitrary columns.

#### 4. Prompt Detail
```
GET /api/brain/activity/:activityId/prompt
```
Returns: full system prompt (static + dynamic blocks), messages array, response with parsed thinking/draft/dispatch, token breakdown with cache details, timing info.

**Implementation**: Fetch single BrainActivity with full input/output JSON. Parse system prompt blocks from input. Extract cache tokens from metadata.

### Database Considerations

**No schema changes required** — all needed data already exists in BrainActivity:
- `cost`, `tokenCountInput`, `tokenCountOutput`, `durationMs` — direct fields
- `cacheReadInputTokens`, `cacheWriteInputTokens` — in `metadata` JSON
- `input` JSON — contains full system prompt and messages
- `output` JSON — contains full response
- `callType` — for breakdown by operation type
- `model` — for breakdown by model

**Performance Optimization:**
- Add composite index: `@@index([sessionId, createdAt])` (already exists)
- Consider materialized views or cached aggregations for cost analytics (daily summaries)
- For the cost endpoint, pre-compute daily aggregates into a `DailyCostSummary` table or cache layer if query performance becomes an issue

**Note on cost field precision**: Currently `Float` in Prisma. Consider changing to `Decimal` for financial accuracy, though for internal analytics Float precision is acceptable.

---

## 6. Production Deployment Architecture

### Deployment Target: Vercel (consistent with website + docs-site)

**Rationale:**
- All other web properties already on Vercel
- Zero-config deployment for Vite/React apps
- Automatic preview deployments for PRs
- Custom domain support

### Tech Stack Decision: Vite + React vs Next.js

**Option A: Keep Vite + React (in-place upgrade)**
- Pro: Zero rewrite cost, current components preserved
- Pro: Faster dev builds, no SSR complexity
- Pro: Pure SPA is fine for an internal tool
- Con: No SSR for initial page load with large session lists
- Con: Clerk integration requires `@clerk/clerk-react` (less mature than `@clerk/nextjs`)

**Option B: Migrate to Next.js (new `dashboard/` workspace)**
- Pro: Consistent with website (both Next.js on Vercel)
- Pro: SSR for session lists and historical data (faster initial load)
- Pro: API routes as BFF layer to proxy/aggregate backend calls
- Pro: Built-in Clerk middleware support
- Pro: Separate deploy cycle from `tools/status-dashboard`
- Con: Full migration effort
- Con: Existing component code needs adaptation (React Router → App Router)

**Recommendation**: Start with **Option A** (in-place Vite upgrade) for Phase 1-2 to ship quickly. Evaluate migration to Next.js for Phase 3+ if SSR/BFF benefits prove necessary. Keep `tools/status-dashboard` as the production codebase initially; migrate to `dashboard/` later if warranted.

### Authentication: Clerk (consistent with website)

**Implementation:**
- Add `@clerk/clerk-react` to the dashboard
- Wrap app in `<ClerkProvider>`
- Protect all routes with `<SignedIn>` / `<RedirectToSignIn>`
- Backend: Add Clerk JWT verification middleware to brain routes
- Role-based access: Admin (full access), Viewer (read-only, no raw data)

### Environment Configuration

```
VITE_API_URL=https://api.meetwithoutfear.com  (or backend URL)
VITE_ABLY_KEY=<key>
VITE_CLERK_PUBLISHABLE_KEY=<key>
```

### Monorepo Integration

```
tools/status-dashboard/     (keep current location)
├── src/                    (React app)
├── public/
├── package.json
├── vite.config.ts
├── vercel.json             (NEW: deployment config)
└── .env.production         (NEW: production env vars)
```

Root `package.json` scripts:
```json
{
  "dev:status": "npm --workspace tools/status-dashboard run dev",
  "build:status": "npm --workspace tools/status-dashboard run build",
  "deploy:status": "cd tools/status-dashboard && vercel --prod"
}
```

### Build Pipeline
1. `npm run build:status` → Vite builds to `dist/`
2. `vercel --prod` deploys `dist/` with SPA fallback
3. `vercel.json` configures: SPA rewrites, headers (CORS for API)

---

## 7. Chart Library: Recharts + @visx

**Primary: Recharts** (standard charts)
- Area, bar, line, pie, sparkline — covers 80% of visualization needs
- React-native, lightweight (~40KB), good dark theme support
- Usage: cost over time, per-turn breakdowns, model distribution, sparklines

**Secondary: @visx** (advanced visualizations)
- Sankey diagrams (cost flow, pipeline flow)
- Heatmaps (cache hit rate by stage x day)
- Low-level D3 primitives wrapped in React, from Airbnb
- Only used for visualizations Recharts can't handle

**Not used**: Nivo (too heavy), raw D3 (too low-level), Chart.js (less React-native)

---

## 7.1 Pipeline Data Capture: TurnTrace Interface

To power the pipeline flow diagram and timing waterfall, each turn should emit a `TurnTrace` record capturing the full orchestration pipeline. This extends the existing BrainActivity data:

```typescript
interface TurnTrace {
  turnId: string;
  sessionId: string;
  userId: string;
  timestamp: string;

  // Pipeline stages with timing
  memoryIntent: {
    intent: string;    // 'avoid_recall' | 'stage_enforcement' | 'full'
    depth: string;     // 'none' | 'light' | 'full'
    durationMs: number;
    reason: string;
  };

  parallelPreProcessing: {
    contextAssembly: { durationMs: number; tokenCount: number; };
    semanticRetrieval: { durationMs: number; resultCount: number; topSimilarity: number; } | null;
    sharedContent: { durationMs: number; itemCount: number; } | null;
    milestoneContext: { durationMs: number; } | null;
    userPrefs: { durationMs: number; } | null;
    totalDurationMs: number;  // wall clock (parallel)
  };

  retrievalPlanning: {
    skipped: boolean;
    reason?: string;  // e.g., "depth=none" or "no refs detected"
    durationMs?: number;
    queryCount?: number;
    circuitBreakerTripped?: boolean;
  } | null;

  promptBuilding: {
    stage: number;
    staticBlockTokens: number;
    dynamicBlockTokens: number;
    contextTokens: number;
    historyTokens: number;
    totalTokens: number;
    budgetUtilization: number;  // percentage of 150k
    durationMs: number;
  };

  modelRouting: {
    selectedModel: string;  // 'sonnet' | 'haiku'
    reason: string;
  };

  llmCall: {
    model: string;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    stopReason: string;
  };

  responseParsing: {
    thinkingExtracted: boolean;
    draftExtracted: boolean;
    dispatchTag: string | null;
    feelHeardCheck: boolean;
    readyToShare: boolean;
    mode: string;
    intensity: number;
  };

  dispatch: {
    triggered: boolean;
    tag?: string;
    handlerDurationMs?: number;
  } | null;

  totalDurationMs: number;
}
```

**Implementation**: Instrument `orchestrateResponse()` to build this trace object during execution, then emit it via Ably alongside the existing brain-activity events. Store as a JSON field on the turn's primary BrainActivity record or in a new `metadata.turnTrace` field.

---

## 8. Phased Implementation Plan

### Phase 1: Foundation (Week 1-2)
**Goal**: Production deployment + navigation + enhanced session list

- [ ] Add Clerk authentication to frontend and backend brain routes
- [ ] Set up Vercel deployment with `vercel.json` config
- [ ] Add sidebar navigation (Dashboard, Sessions, Costs, Live)
- [ ] Enhance session list with filters (status, type, stage, date) and search
- [ ] Add sortable columns to session list
- [ ] Add URL query param persistence for filters
- [ ] Preserve all existing functionality (session detail, context page, event rendering)

### Phase 2: Dashboard + Cost Analytics (Week 3-4)
**Goal**: Dashboard overview + dedicated cost analysis page

- [ ] Build `GET /api/brain/dashboard` endpoint with aggregate queries
- [ ] Build Dashboard Overview page with 4 metric cards + sparklines
- [ ] Build `GET /api/brain/costs` endpoint with groupBy support
- [ ] Build Cost Analysis page:
  - Summary cards (period total, vs previous, per session avg, cache savings)
  - Cost over time stacked area chart (Recharts)
  - Model breakdown horizontal bar chart
  - Call type breakdown horizontal bar chart
  - Cost by session sortable table
- [ ] Add per-session Cost tab in session detail
- [ ] Add CSV export for cost data

### Phase 3: Cache & Prompt Visibility (Week 5-6)
**Goal**: Prompt inspector + cache visualization

- [ ] Build `GET /api/brain/activity/:activityId/prompt` endpoint
- [ ] Build Prompt Inspector page (3-panel layout):
  - Request panel: system prompt blocks with cache indicators, messages array
  - Response panel: formatted response, thinking/draft/dispatch extraction
  - Metadata panel: token breakdown, cost breakdown, cache analysis bar
- [ ] Add cache hit rate visualization to:
  - Dashboard overview (metric card)
  - Cost Analysis (cache efficiency section)
  - Session detail cost tab (per-turn cache bar)
- [ ] Add CacheIndicator badges to event cards in session timeline
- [ ] Build prompt diff viewer (compare system prompts between turns)

### Phase 4: Live Monitor + Playback (Week 7-8)
**Goal**: Real-time monitoring + historical playback

- [ ] Build Live Monitor page:
  - Session tab bar (auto-created per active session)
  - Reverse-chronological event stream
  - PENDING → COMPLETED in-place updates
  - Pause/Resume, auto-scroll, event count
  - Event type filter
- [ ] Build Session Playback mode:
  - Timeline scrubber with turn markers
  - Step forward/back controls
  - Auto-play with speed control
  - Stage transition markers
- [ ] Add keyboard shortcuts (j/k navigation, Enter expand, Cmd+K search)
- [ ] Add global search (Cmd+K) across sessions, participants, IDs

### Phase 5: Polish + Performance (Week 9-10)
**Goal**: Performance optimization + UX polish

- [ ] Add virtualized scrolling for large activity lists (react-window or react-virtualized)
- [ ] Add error boundaries for component crash resilience
- [ ] Add retry logic for failed API calls
- [ ] Add Ably reconnection handling with cursor-based recovery
- [ ] Responsive design adjustments (tablet: collapsed sidebar, stacked columns)
- [ ] Add sound/visual notifications for errors in live monitor
- [ ] Performance testing with large sessions (1000+ activities)
- [ ] Add daily cost summary pre-computation for fast analytics queries

---

## 9. Data Queries for Analytics

### Cache Hit Rate Calculation
```sql
SELECT
  DATE(created_at) as day,
  SUM(CAST(metadata->>'cacheReadInputTokens' AS INT)) as cache_read_tokens,
  SUM(CAST(metadata->>'cacheWriteInputTokens' AS INT)) as cache_write_tokens,
  SUM(token_count_input) as total_input_tokens,
  CASE
    WHEN SUM(token_count_input) > 0
    THEN ROUND(100.0 * SUM(CAST(metadata->>'cacheReadInputTokens' AS INT)) / SUM(token_count_input), 1)
    ELSE 0
  END as cache_hit_rate_pct
FROM brain_activity
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day;
```

### Cost by Model
```sql
SELECT
  model,
  COUNT(*) as call_count,
  SUM(cost) as total_cost,
  SUM(token_count_input) as total_input_tokens,
  SUM(token_count_output) as total_output_tokens,
  AVG(duration_ms) as avg_duration_ms
FROM brain_activity
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model
ORDER BY total_cost DESC;
```

### Cost by Call Type
```sql
SELECT
  call_type,
  COUNT(*) as call_count,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost_per_call,
  AVG(duration_ms) as avg_duration_ms
FROM brain_activity
WHERE call_type IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY call_type
ORDER BY total_cost DESC;
```

### Cache Savings Estimate
```sql
-- Compare actual cost vs what cost would have been without caching
SELECT
  SUM(cost) as actual_cost,
  SUM(
    (token_count_input / 1000.0) *
    CASE
      WHEN model LIKE '%sonnet%' THEN 0.003
      WHEN model LIKE '%haiku%' THEN 0.001
      ELSE 0.00002
    END
    + (token_count_output / 1000.0) *
    CASE
      WHEN model LIKE '%sonnet%' THEN 0.015
      WHEN model LIKE '%haiku%' THEN 0.005
      ELSE 0
    END
  ) as cost_without_caching,
  SUM(
    (token_count_input / 1000.0) *
    CASE
      WHEN model LIKE '%sonnet%' THEN 0.003
      WHEN model LIKE '%haiku%' THEN 0.001
      ELSE 0.00002
    END
    + (token_count_output / 1000.0) *
    CASE
      WHEN model LIKE '%sonnet%' THEN 0.015
      WHEN model LIKE '%haiku%' THEN 0.005
      ELSE 0
    END
  ) - SUM(cost) as savings
FROM brain_activity
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## 10. Key Design Decisions

### 1. Keep Vite, Don't Switch to Next.js
The dashboard is a pure SPA with no SEO needs. Vite is faster to build, lighter weight, and avoids a rewrite. The current component architecture is solid and should be preserved.

### 2. Sidebar Navigation Over Top Tabs
The current single-link top nav doesn't scale. A collapsible sidebar provides room for 4+ navigation items plus recent sessions, matching developer tool conventions (DevTools, Grafana).

### 3. Dedicated Cost Page vs. Inline Only
Cost analysis deserves its own page because:
- Stakeholders need it without navigating into individual sessions
- Aggregate views (trends, breakdowns) require full-width charts
- Per-session cost tab still exists for in-context analysis

### 4. Cache Visibility as First-Class Citizen
Cache metrics are currently invisible despite being tracked. Making them visible at every level (dashboard card, cost page section, event badges, prompt inspector panel) gives immediate feedback on optimization ROI.

### 5. 3-Panel Prompt Inspector
The single most useful debugging tool is seeing exactly what was sent to the LLM. A 3-panel layout (request/response/metadata) with cache annotations matches the mental model of "what went in, what came out, what it cost."

### 6. Playback Over Replay
Rather than re-executing prompts, playback steps through stored data. This is safer (no API costs), faster, and works for any historical session.

### 7. Recharts Over D3
D3 is too low-level for dashboard charts. Recharts provides declarative React components that match the existing codebase style and support all needed chart types.

---

## 11. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to find a session | ~30s (scroll list) | <5s (search + filters) |
| Time to see session cost breakdown | Impossible | <3 clicks (sessions → session → cost tab) |
| Time to inspect a prompt | Impossible | <3 clicks (session → expand event → prompt inspector) |
| Cache hit rate visibility | Not visible | Visible on dashboard, cost page, and per-event |
| Deployment | Local only | Production URL with auth |
| Historical analysis | None | Cost trends, session comparison, playback |
| Stakeholder self-service | None | Dashboard + cost page (no developer needed) |

---

## 12. Files to Modify or Create

### New Files
```
tools/status-dashboard/
├── vercel.json                           # Vercel deployment config
├── src/
│   ├── pages/
│   │   ├── DashboardPage.tsx             # Dashboard overview
│   │   ├── SessionListPage.tsx           # Enhanced session list
│   │   ├── CostAnalysisPage.tsx          # Cost analytics
│   │   ├── LiveMonitorPage.tsx           # Real-time monitor
│   │   └── PromptInspectorPage.tsx       # Prompt deep-dive
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   │   ├── AppLayout.tsx             # Layout wrapper
│   │   │   └── GlobalSearch.tsx          # Cmd+K search
│   │   ├── charts/
│   │   │   ├── CostOverTimeChart.tsx     # Stacked area chart
│   │   │   ├── ModelBreakdownChart.tsx   # Horizontal bar chart
│   │   │   ├── CacheEfficiencyChart.tsx  # Cache hit rate chart
│   │   │   ├── TokenBudgetBar.tsx        # Token usage bar
│   │   │   └── SparkChart.tsx            # Inline sparkline
│   │   ├── metrics/
│   │   │   ├── MetricCard.tsx            # Dashboard metric card
│   │   │   └── CacheIndicator.tsx        # Cache hit/miss badge
│   │   ├── prompt/
│   │   │   ├── RequestPanel.tsx          # Prompt inspector left
│   │   │   ├── ResponsePanel.tsx         # Prompt inspector center
│   │   │   ├── MetadataPanel.tsx         # Prompt inspector right
│   │   │   ├── PromptBlock.tsx           # Syntax-highlighted prompt
│   │   │   └── PromptDiffViewer.tsx      # Compare prompts
│   │   ├── playback/
│   │   │   ├── PlaybackControls.tsx      # Scrubber + controls
│   │   │   └── PlaybackOverlay.tsx       # Playback mode wrapper
│   │   └── filters/
│   │       ├── SessionFilters.tsx        # Filter bar component
│   │       └── ActivityFilters.tsx       # In-session filter pills
│   ├── hooks/
│   │   ├── useDashboard.ts              # Dashboard data fetching
│   │   ├── useCostAnalytics.ts          # Cost data fetching
│   │   └── usePromptDetail.ts           # Prompt detail fetching
│   └── utils/
│       └── cacheCalculations.ts         # Cache hit rate, savings calcs

backend/src/routes/
├── brain.ts                              # MODIFY: Add filter/search/sort params to sessions
│                                         # ADD: /dashboard, /costs, /activity/:id/prompt endpoints
```

### Existing Files to Preserve/Enhance
```
tools/status-dashboard/src/
├── components/
│   ├── events/                          # KEEP: All 16 event components + BaseEventWrapper
│   ├── session/
│   │   ├── SessionDetail.tsx            # ENHANCE: Add sub-tabs (Timeline/Context/Cost/Prompts)
│   │   ├── SplitView.tsx               # KEEP: Partner session split view
│   │   ├── TurnView.tsx                # ENHANCE: Add cache indicator badges
│   │   └── FormattedPrice.tsx          # KEEP: Price formatting
│   └── context/                        # KEEP: All context components
├── hooks/
│   ├── useAblyConnection.ts            # KEEP: Ably real-time
│   ├── useSessionActivity.ts           # KEEP: Activity fetching
│   └── useSessions.ts                  # ENHANCE: Add filter/sort support
├── services/api.ts                     # ENHANCE: Add new endpoint methods
├── types/                              # ENHANCE: Add new types for dashboard, cost, prompt
└── utils/
    ├── turnGrouping.ts                 # KEEP: Turn grouping logic
    ├── activityDisplay.ts              # KEEP: Activity display helpers
    └── formatters.ts                   # ENHANCE: Add cache formatting helpers
```

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Aggregate queries slow on large BrainActivity table | Cost page loads slowly | Pre-compute daily summaries; add DB indexes; cache results |
| Metadata JSON field makes cache token queries expensive | Cache analytics unreliable | Extract `cacheReadInputTokens`/`cacheWriteInputTokens` into dedicated columns in a future migration |
| Ably channel limits in production | Live monitor drops events | Use session-specific channels for detail views; global channel for overview only |
| Auth adds friction to developer workflow | Developers skip the dashboard | Allow localhost bypass in development; make login flow fast via Clerk |
| Scope creep across 5 phases | Delivery delayed | Strict phase gates; each phase delivers independently useful functionality |

---

## 14. Detailed Design Documents

This plan synthesizes research from 5 specialist agents. The full detailed designs are available for reference:

| Document | Location | Contents |
|----------|----------|----------|
| Codebase Analysis | `.planning/neural-monitor-analysis.md` | 1,625-line deep-dive: all 28+ components, 3 API endpoints, 16 event types, data flow, Ably channels, type definitions, 12 limitations |
| Cost Visualization Design | `.planning/research/cost-visualization-design.md` | 17 sections: KPI cards, cost trend charts, cache efficiency dashboard (donut/area/heatmap/waterfall), Sankey diagram, token budget gauge, real-time ticker, before/after comparison, responsive layouts, SQL queries, color system |
| Prompt Pipeline Visualization | `.planning/designs/prompt-pipeline-visualization.md` | 10 visualizations: Sankey-style flow diagram, system prompt inspector, context injection viewer, history management view, retrieval planning display, response parsing viewer, tag trap state machine, dispatch flow tree, timing waterfall, prompt diff viewer. Includes TurnTrace data type |
| UX Design | `tools/status-dashboard/UX-DESIGN.md` | 662-line design: color palette, typography, component library, ASCII wireframes for all 7 screens, interaction patterns, keyboard shortcuts, progressive disclosure hierarchy, responsive breakpoints |
| Production Architecture | `.planning/architecture/production-deployment-strategy.md` | Deployment strategy (Vercel), auth (Clerk), BFF layer, data retention (90-day full / indefinite summary), Ably token auth, monorepo integration, 5-phase migration path |

---

## Summary

This redesign transforms the Neural Monitor from a local-only session viewer into a production-deployed observability platform. The key additions are:

1. **Dashboard Overview** — At-a-glance metrics for stakeholders
2. **Cost Analysis** — Dedicated page with charts, breakdowns, and cache savings
3. **Prompt Inspector** — Deep-dive into any LLM call with cache visibility
4. **Session Playback** — Step through historical sessions
5. **Enhanced Navigation** — Sidebar, search, filters

The implementation preserves all existing functionality (16 event components, split view, context page) while adding the most-requested capabilities: cost visibility, cache analytics, prompt inspection, and production deployment.

Total estimated effort: 10 weeks across 5 phases, each delivering independently useful functionality.
