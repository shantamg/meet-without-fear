# Cost and Caching Visualization System Design

## Overview

This document defines the comprehensive visualization system for understanding, monitoring, and optimizing AI costs across the Meet Without Fear platform. The system covers real-time monitoring during active sessions, historical analysis across sessions, cache efficiency tracking, and before/after optimization comparison.

**Data Sources:**
- `BrainActivity` records (per-call: cost, tokens, duration, model, callType, metadata with cache tokens)
- Turn-level aggregation via `turnId` grouping
- Session-level aggregation via `groupBy` queries
- Real-time Ably `ai-audit-stream` events
- 16 call types across 3 models (Sonnet, Haiku, Titan)

---

## 1. Dashboard Layout Architecture

### 1.1 Information Hierarchy

The dashboard follows a **progressive disclosure** pattern with three depth levels:

```
Level 1: Overview (KPI cards + primary trend chart)
   │
Level 2: Analysis (cost breakdown, cache efficiency, model comparison)
   │
Level 3: Detail (per-session waterfall, per-call inspection)
```

### 1.2 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  FILTERS BAR (sticky)                                       │
│  [Last 24h] [7d] [30d] [Custom]  Model:[All▾] Stage:[All▾] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│  │Total │ │Cache │ │Cache │ │API   │ │Avg/  │ │Avg   │    │
│  │Cost  │ │Hit % │ │Saved │ │Calls │ │Sess  │ │Latency│   │
│  │$42.17│ │ 73%  │ │$28.50│ │1,247 │ │$0.85 │ │1.2s  │    │
│  │~~▁▃▅▇│ │~~▃▅▇█│ │~~▁▃▅▇│ │~~▃▅▆▇│ │~~▇▅▃▁│ │~~▃▂▃▂│   │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          COST TREND (Stacked Bar Chart)              │    │
│  │  $│ ████                                             │    │
│  │   │ ████ ▓▓▓▓                                       │    │
│  │   │ ████ ▓▓▓▓ ░░░░                                  │    │
│  │   │ ████ ▓▓▓▓ ░░░░ ████                             │    │
│  │   └──────────────────────────────────── time →       │    │
│  │  [■ Input  ■ Cached Read  ■ Cache Write  ■ Output]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────┐ ┌─────────────────────────────┐   │
│  │   CACHE EFFICIENCY   │ │     MODEL COST SPLIT        │   │
│  │      (Donut)         │ │    (Stacked Bar/Grouped)    │   │
│  │                      │ │                             │   │
│  │    ┌─────────┐       │ │  Sonnet ████████████ $30.20 │   │
│  │    │  73%    │       │ │  Haiku  ███░ $8.47           │   │
│  │    │ hit rate│       │ │  Titan  ░ $0.12              │   │
│  │    └─────────┘       │ │                             │   │
│  └─────────────────────┘ └─────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │        COST BY STAGE (Horizontal Stacked Bar)        │    │
│  │  Stage 0 ██░░░                                       │    │
│  │  Stage 1 ████████████░░                              │    │
│  │  Stage 2 ██████████████████░░░░                      │    │
│  │  Stage 3 ██████░░                                    │    │
│  │  Stage 4 ████░░░                                     │    │
│  │  [■ Sonnet  ■ Haiku  ■ Titan]                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           SESSION LIST (with inline sparklines)       │    │
│  │  Session   | Users    | Turns | Cost   | Trend      │    │
│  │  abc-123   | A & B    |  12   | $1.85  | ~~▁▃▅▇    │    │
│  │  def-456   | C & D    |   8   | $0.92  | ~~▃▂▃▅    │    │
│  │  ghi-789   | E & F    |  15   | $2.30  | ~~▁▂▅▇█   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. KPI Cards (Top Row)

### 2.1 Card Specifications

| Card | Primary Value | Sparkline | Delta | Color Logic |
|------|--------------|-----------|-------|-------------|
| **Total Cost** | Sum of all `cost` in period | 7-day daily cost | vs. previous period | Red if up, green if down |
| **Cache Hit Rate** | `cache_read / total_input * 100` | 7-day daily rate | vs. previous period | Green if up, red if down |
| **Cache Savings** | `cache_read_tokens * (input_price - cache_read_price) / 1000` | 7-day daily savings | vs. previous period | Green always (savings) |
| **API Calls** | Count of `BrainActivity` records | 7-day daily count | vs. previous period | Neutral (blue) |
| **Avg Cost/Session** | Total cost / unique sessions | 7-day daily avg | vs. previous period | Red if up, green if down |
| **Avg Latency** | Mean of `durationMs` | 7-day daily avg | vs. previous period | Red if up, green if down |

### 2.2 Data Queries

```sql
-- Total Cost (period)
SELECT SUM(cost) FROM BrainActivity
WHERE createdAt BETWEEN :start AND :end;

-- Cache Hit Rate
SELECT
  SUM(CAST(metadata->>'cacheReadInputTokens' AS INT)) as cache_read,
  SUM(tokenCountInput) as total_input,
  ROUND(SUM(CAST(metadata->>'cacheReadInputTokens' AS INT))::numeric
    / NULLIF(SUM(tokenCountInput), 0) * 100, 1) as hit_rate
FROM BrainActivity
WHERE createdAt BETWEEN :start AND :end
  AND activityType = 'LLM_CALL';

-- Cache Savings (dollars saved by reading from cache instead of full-price input)
SELECT SUM(
  CASE
    WHEN model LIKE '%sonnet%' THEN
      CAST(metadata->>'cacheReadInputTokens' AS INT) * (0.003 - 0.0003) / 1000
    WHEN model LIKE '%haiku%' THEN
      CAST(metadata->>'cacheReadInputTokens' AS INT) * (0.001 - 0.0001) / 1000
    ELSE 0
  END
) as savings
FROM BrainActivity
WHERE createdAt BETWEEN :start AND :end;

-- Daily sparkline data (7 days)
SELECT DATE(createdAt) as day, SUM(cost) as daily_cost
FROM BrainActivity
WHERE createdAt >= NOW() - INTERVAL '7 days'
GROUP BY DATE(createdAt)
ORDER BY day;
```

### 2.3 Component Design

```
┌──────────────────────┐
│ Cache Hit Rate    ▲5% │  ← delta with direction arrow
│                       │
│      73.2%            │  ← large primary value
│                       │
│  ~~▃▄▅▅▆▇▇█          │  ← sparkline (last 7 days)
│                       │
│ vs 68.1% last period  │  ← comparison text (muted)
└──────────────────────┘
```

- Sparkline: `recharts` `<Sparklines>` or `@visx/sparkline`, ~80px wide, no axes
- Delta arrow: `▲` green / `▼` red with percentage
- Hover: tooltip shows exact daily values

---

## 3. Cost Trend Chart (Primary Visualization)

### 3.1 Chart Type: **Stacked Bar Chart**

Inspired by AWS Cost Explorer and Anthropic Console. Each bar represents one time unit (day by default).

### 3.2 Stacking Segments

Each bar is split into 4 token-cost segments from bottom to top:

| Segment | Color | Description |
|---------|-------|-------------|
| **Cached Read Input** | `#22C55E` (green) | Tokens served from cache (discounted) |
| **Standard Input** | `#3B82F6` (blue) | Uncached input tokens (full price) |
| **Cache Write Input** | `#F59E0B` (amber) | Tokens written to cache (premium) |
| **Output** | `#8B5CF6` (purple) | Generated output tokens |

### 3.3 Granularity

- **Default**: Daily bars
- **Zoom in**: Click a bar to drill into hourly granularity for that day
- **Zoom out**: Toggle to weekly or monthly aggregation
- Breadcrumb navigation: `All Time > Feb 2026 > Feb 15`

### 3.4 Data Query

```sql
-- Daily cost breakdown by token type
SELECT
  DATE(createdAt) as day,
  SUM(
    CASE WHEN model LIKE '%sonnet%' THEN
      (tokenCountInput - COALESCE(CAST(metadata->>'cacheReadInputTokens' AS INT), 0)
       - COALESCE(CAST(metadata->>'cacheWriteInputTokens' AS INT), 0)) * 0.003 / 1000
    WHEN model LIKE '%haiku%' THEN
      (tokenCountInput - COALESCE(CAST(metadata->>'cacheReadInputTokens' AS INT), 0)
       - COALESCE(CAST(metadata->>'cacheWriteInputTokens' AS INT), 0)) * 0.001 / 1000
    WHEN model LIKE '%titan%' THEN tokenCountInput * 0.00002 / 1000
    ELSE 0 END
  ) as standard_input_cost,
  SUM(
    CASE WHEN model LIKE '%sonnet%' THEN
      COALESCE(CAST(metadata->>'cacheReadInputTokens' AS INT), 0) * 0.0003 / 1000
    WHEN model LIKE '%haiku%' THEN
      COALESCE(CAST(metadata->>'cacheReadInputTokens' AS INT), 0) * 0.0001 / 1000
    ELSE 0 END
  ) as cache_read_cost,
  SUM(
    CASE WHEN model LIKE '%sonnet%' THEN
      COALESCE(CAST(metadata->>'cacheWriteInputTokens' AS INT), 0) * 0.00375 / 1000
    WHEN model LIKE '%haiku%' THEN
      COALESCE(CAST(metadata->>'cacheWriteInputTokens' AS INT), 0) * 0.00125 / 1000
    ELSE 0 END
  ) as cache_write_cost,
  SUM(
    CASE WHEN model LIKE '%sonnet%' THEN tokenCountOutput * 0.015 / 1000
    WHEN model LIKE '%haiku%' THEN tokenCountOutput * 0.005 / 1000
    ELSE 0 END
  ) as output_cost
FROM BrainActivity
WHERE createdAt BETWEEN :start AND :end
GROUP BY DATE(createdAt)
ORDER BY day;
```

### 3.5 Interactions

- **Hover**: Tooltip shows exact dollar amounts per segment, total, and comparison to previous period
- **Click bar**: Drill into hourly view for that day
- **Legend click**: Toggle segments on/off for focus analysis
- **Annotation lines**: Vertical dashed lines marking optimization deployments (e.g., "Caching enabled", "Prompt redesign shipped")

### 3.6 Tooltip Format

```
┌─────────────────────────────┐
│ Feb 15, 2026                │
│                             │
│ ● Output         $4.28     │
│ ● Cache Write    $0.82     │
│ ● Standard Input $2.15     │
│ ● Cached Read    $0.34     │
│ ─────────────────────────── │
│   Total          $7.59     │
│   vs prev day    ▲12%      │
│   API calls      156       │
└─────────────────────────────┘
```

---

## 4. Cache Efficiency Dashboard

### 4.1 Primary: Cache Hit Rate Donut

A donut chart showing the proportion of input tokens served from cache vs. standard input.

```
        ┌──────────────────┐
        │                  │
        │   ╭──────────╮   │
        │  ╱  ██████    ╲  │
        │ │  ██ 73% ██   │ │
        │ │  ██     ██   │ │
        │  ╲  ░░░░░░   ╱   │
        │   ╰──────────╯   │
        │                  │
        │ ■ Cached: 73%    │
        │ ░ Standard: 22%  │
        │ ▓ Write: 5%      │
        └──────────────────┘
```

**Segments:**
- `#22C55E` (green): Cache read tokens (savings)
- `#3B82F6` (blue): Standard (uncached) input tokens
- `#F59E0B` (amber): Cache write tokens (investment)

**Center text**: Hit rate percentage in large font

### 4.2 Secondary: Cache Efficiency Over Time

**Chart type**: Area chart (stacked, 100%)

Shows how cache efficiency changes over time, revealing whether optimizations are working.

```
100%│████████████████████████████████
    │████████████████████████████████  ← Cached Read (green)
 73%│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ← Cache Write (amber)
    │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  0%└─────────────────────────────── time →
```

### 4.3 Cache Hit Rate by Stage (Heatmap)

Reveals which conversation stages benefit most from caching.

```
          Mon  Tue  Wed  Thu  Fri  Sat  Sun
Stage 0   ██   ██   ██   ██   ██   ██   ██     90-100% (dark green)
Stage 1   ██   ▓▓   ██   ▓▓   ██   ▓▓   ██     70-89%  (green)
Stage 2   ▓▓   ░░   ▓▓   ░░   ▓▓   ░░   ▓▓     50-69%  (yellow-green)
Stage 3   ░░   ░░   ░░   ░░   ░░   ░░   ░░     30-49%  (amber)
Stage 4   ░░   ░░   ░░   ░░   ░░   ░░   ░░     <30%    (red-orange)
```

**Color scale**: Sequential green (high efficiency) to red-orange (low efficiency)

**Data query**:
```sql
-- Cache hit rate by stage (derived from turnId pattern or session stage)
SELECT
  sp.stage,
  DATE(ba.createdAt) as day,
  ROUND(
    SUM(COALESCE(CAST(ba.metadata->>'cacheReadInputTokens' AS INT), 0))::numeric
    / NULLIF(SUM(ba.tokenCountInput), 0) * 100, 1
  ) as hit_rate
FROM BrainActivity ba
JOIN StageProgress sp ON sp.sessionId = ba.sessionId
WHERE ba.createdAt BETWEEN :start AND :end
  AND ba.activityType = 'LLM_CALL'
GROUP BY sp.stage, DATE(ba.createdAt)
ORDER BY sp.stage, day;
```

### 4.4 Cache Savings Waterfall

Shows the dollar impact of caching as a waterfall chart:

```
  Baseline     Cache     Cache      Net        Actual
  (no cache)   Savings   Write      Savings    Cost
  ┌──────┐
  │      │
  │$70.67│    ┌──────┐
  │      │    │-$28.5│   ┌─────┐
  │      │    │      │   │+$3.2│  ┌──────┐   ┌──────┐
  │      │    │      │   │     │  │$25.30│   │$45.37│
  └──────┘    └──────┘   └─────┘  └──────┘   └──────┘
```

---

## 5. Model Cost Comparison

### 5.1 Model Split (Grouped Bar Chart)

Side-by-side bars for each model showing cost breakdown:

```
  Sonnet     ████████████████████  $30.20 (72%)
             [in: $8.50 | cached: $0.90 | write: $2.30 | out: $18.50]

  Haiku      ██████  $8.47 (20%)
             [in: $2.10 | cached: $0.08 | write: $0.30 | out: $5.99]

  Titan      ██ $0.12 (0.3%)
             [in: $0.12]
```

### 5.2 Model Routing Visibility

A table showing why each call type uses its specific model:

| Call Type | Model | Rationale | Avg Cost | Avg Tokens | Count |
|-----------|-------|-----------|----------|------------|-------|
| ORCHESTRATED_RESPONSE | Sonnet | User-facing, quality-critical | $0.045 | 3,200 in / 450 out | 312 |
| RETRIEVAL_PLANNING | Haiku | Structured extraction, speed | $0.002 | 800 in / 120 out | 285 |
| INTENT_DETECTION | Haiku | Binary classification, speed | $0.001 | 600 in / 50 out | 312 |
| RECONCILER_ANALYSIS | Sonnet | Complex empathy analysis | $0.038 | 2,800 in / 380 out | 45 |
| NEEDS_EXTRACTION | Sonnet | Nuanced understanding needed | $0.032 | 2,400 in / 320 out | 38 |
| ... | ... | ... | ... | ... | ... |

**Color coding**: Sonnet rows have warm accent background (`#FEF3C7`), Haiku rows have cool accent (`#DBEAFE`)

### 5.3 Data Query

```sql
-- Cost breakdown by model and call type
SELECT
  callType,
  model,
  COUNT(*) as call_count,
  AVG(cost) as avg_cost,
  SUM(cost) as total_cost,
  AVG(tokenCountInput) as avg_input_tokens,
  AVG(tokenCountOutput) as avg_output_tokens,
  AVG(durationMs) as avg_duration
FROM BrainActivity
WHERE createdAt BETWEEN :start AND :end
  AND activityType = 'LLM_CALL'
GROUP BY callType, model
ORDER BY total_cost DESC;
```

---

## 6. Cost by Stage Breakdown

### 6.1 Chart Type: **Horizontal Stacked Bar Chart**

Each row represents a conversation stage (0-4), with segments showing model cost distribution.

```
  Stage 0 (Setup)        ██░ $2.10
  Stage 1 (Witnessing)   ████████████░░ $14.80
  Stage 2 (Empathy)      ██████████████████░░░░ $18.30
  Stage 3 (Perspective)  ██████░░ $5.20
  Stage 4 (Strategies)   ████░░░ $3.80

  ■ Sonnet  ░ Haiku  ▪ Titan
```

### 6.2 Cost-per-Turn by Stage (Box Plot)

Shows the distribution (not just average) of per-turn costs within each stage, revealing variance.

```
  Stage 0  ├──┤  median: $0.05
  Stage 1  ├────────┤  median: $0.12
  Stage 2  ├──────────────┤  median: $0.18  (wide variance - reconciler calls)
  Stage 3  ├──────┤  median: $0.09
  Stage 4  ├────┤  median: $0.07
```

### 6.3 Data Requirement

Requires joining `BrainActivity` with session stage information. Two approaches:

**Option A**: Derive stage from `StageProgress` timestamps
```sql
-- Determine which stage a BrainActivity belongs to by comparing
-- its timestamp against StageProgress startedAt/completedAt ranges
SELECT
  sp.stage,
  SUM(ba.cost) as stage_cost,
  COUNT(ba.id) as call_count
FROM BrainActivity ba
CROSS JOIN LATERAL (
  SELECT stage FROM StageProgress sp
  WHERE sp.sessionId = ba.sessionId
    AND sp.startedAt <= ba.createdAt
    AND (sp.completedAt IS NULL OR sp.completedAt >= ba.createdAt)
  ORDER BY sp.stage DESC
  LIMIT 1
) sp
WHERE ba.createdAt BETWEEN :start AND :end
GROUP BY sp.stage;
```

**Option B**: Store stage in BrainActivity metadata (recommended for new activities)
- Add `stage` field to BrainActivity metadata at record time
- Simpler queries, no cross-table joins needed

---

## 7. Token Budget Utilization

### 7.1 Context Window Gauge

Shows how much of the 150k context window is being used for the main orchestrated response calls.

**Chart type**: Half-donut gauge with color zones

```
                 ╭─────────────╮
               ╱    ████████    ╲
             ╱   ███  62k  ███   ╲
            │  ██   / 150k   ██   │
            │ ██    tokens    ██  │
             ╲   ██        ██   ╱
               ╲    ██████    ╱
                 ╰─────────────╯
                     41.3%

  [■ System Prompt  ■ History  ■ RAG  ■ Available]
```

**Color zones**:
- `#22C55E` green (0-60%): Comfortable
- `#F59E0B` amber (60-80%): Approaching limit
- `#EF4444` red (80-100%): Near overflow, truncation likely

### 7.2 Context Composition Breakdown

**Chart type**: Stacked horizontal bar showing what fills the context window

```
  ┌───────────────────────────────────────────────────────────┐
  │ System Prompt │  Pinned   │  Summary  │ Recent │  RAG  │░░│
  │    28k        │   8k      │   6k      │  15k   │  5k   │░░│
  │   (19%)       │  (5%)     │  (4%)     │ (10%)  │ (3%)  │░░│
  └───────────────────────────────────────────────────────────┘
                                                        Available: 88k (59%)
```

**Data source**: `llm-telemetry.ts` `recordContextSizes()` which tracks:
- `pinnedTokens`: Always-included context
- `summaryTokens`: Compressed conversation summary
- `recentTokens`: Recent message history
- `ragTokens`: Retrieved memories/facts

### 7.3 Context Growth Over Session

**Chart type**: Area chart showing context window fill over conversation turns

```
150k│                                          ............
    │                               ╱╱╱╱╱╱╱╱╱╱
    │                    ╱╱╱╱╱╱╱╱╱╱╱
    │          ╱╱╱╱╱╱╱╱╱╱
    │   ╱╱╱╱╱╱
  0k└──────────────────────────────────────── turns →
    Turn 1  5    10    15    20    25    30
```

Useful for understanding when truncation kicks in and how efficiently context is managed.

---

## 8. Real-Time Cost Ticker

### 8.1 Live Session Monitor

During active sessions, a real-time updating panel shows cost accrual.

**Data source**: Ably `ai-audit-stream` channel, `brain-activity` events

```
┌─────────────────────────────────────────────┐
│ 🟢 LIVE SESSION: abc-123                    │
│                                             │
│ Running Cost: $0.47  (+$0.03 last call)     │
│ ████████████████████░░░░░░░░░ 47¢ / $2 budget│
│                                             │
│ Current Turn: 8 calls                       │
│  ├─ Intent Detection      $0.001  ✓ 120ms  │
│  ├─ Memory Detection      $0.001  ✓ 95ms   │
│  ├─ Retrieval Planning    $0.002  ✓ 180ms  │
│  ├─ Embedding (x3)        $0.000  ✓ 45ms   │
│  ├─ Background Class.     $0.001  ✓ 150ms  │
│  ├─ Partner Sess. Class.  $0.001  ⏳ ...    │
│  └─ Orchestrated Response $0.038  ⏳ ...    │
│                                             │
│ Cache: 73% hit rate this session            │
│ Model: Sonnet 4.6 (main) + Haiku 4.5 (aux) │
└─────────────────────────────────────────────┘
```

### 8.2 Implementation

- Subscribe to Ably `ai-audit-stream` channel
- On `brain-activity` event with `status: PENDING`, add to current turn with spinner
- On `brain-activity` event with `status: COMPLETED`, update cost/tokens and show checkmark
- Animate cost number increment with `requestAnimationFrame` counter
- Running cost bar fills up against an optional per-session budget

### 8.3 Cost Accumulation Animation

```typescript
// Smooth cost counter animation
function animateCost(from: number, to: number, duration = 500) {
  const start = performance.now();
  const update = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    setCost(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
```

---

## 9. Before/After Optimization Comparison

### 9.1 Optimization Timeline

**Chart type**: Line chart with annotation markers

```
Cost/day
  $│
$80│  ●──●──●──●
   │              ╲
$40│               ●──●    ← "Caching enabled"
   │                    ╲
$20│                     ●──●──●  ← "Prompt redesign"
   │                              ╲
$10│                               ●──●──●
   └───────────────────────────────────────→
   Jan 15        Feb 1        Feb 15
         ⬆ Caching     ⬆ Prompt
         enabled       redesign
```

**Annotations**: Vertical dashed lines with labels at optimization deployment dates.

### 9.2 Savings Waterfall Chart

Shows cumulative impact of each optimization:

```
  Baseline Cost          ████████████████████  $80/day
  ─ Prompt Caching       ▼▼▼▼▼▼▼▼              -$32/day
  ─ Haiku Routing        ▼▼▼▼                  -$18/day
  ─ History Truncation   ▼▼                    -$8/day
  ─ Static/Dynamic Split ▼                     -$5/day
  ═══════════════════════════════════════════
  Current Cost           ████████              $17/day

  Total Savings: $63/day (78.8% reduction)
```

### 9.3 A/B Comparison View

Side-by-side panels comparing two time periods:

```
┌─────────── BEFORE ───────────┐  ┌─────────── AFTER ────────────┐
│ Period: Jan 15 - Jan 31      │  │ Period: Feb 1 - Feb 15       │
│                              │  │                              │
│ Total Cost:     $1,240       │  │ Total Cost:     $255   -79%  │
│ Avg/Session:    $4.50        │  │ Avg/Session:    $0.85  -81%  │
│ Cache Hit Rate: 0%           │  │ Cache Hit Rate: 73%          │
│ Avg Latency:    2.8s         │  │ Avg Latency:    1.2s   -57%  │
│ Sonnet Calls:   95%          │  │ Sonnet Calls:   28%    -70%  │
│                              │  │                              │
│  Cost/day: ▇▇▇▇▇▇▇▇         │  │  Cost/day: ▃▂▃▂▃▂▃▂         │
└──────────────────────────────┘  └──────────────────────────────┘
```

---

## 10. Cost Flow Visualization (Sankey Diagram)

### 10.1 Full Cost Flow

Shows how total spend flows through models, stages, and token types:

```
Total Spend ─┬─── Sonnet ($30.20) ──┬── Stage 1 ($12.40) ──┬── Input ($3.20)
  $42.17     │                      │                       ├── Cached ($0.35)
             │                      │                       ├── Cache Write ($0.85)
             │                      │                       └── Output ($7.00)
             │                      │
             │                      ├── Stage 2 ($14.30) ──── ...
             │                      └── Stage 3-4 ($3.50) ── ...
             │
             ├─── Haiku ($11.85) ───┬── Classification ($4.20)
             │                      ├── Extraction ($3.80)
             │                      └── Planning ($3.85)
             │
             └─── Titan ($0.12) ──── Embeddings ($0.12)
```

### 10.2 Implementation Notes

- Use D3.js sankey layout or `recharts-sankey` (limited)
- Minimum link width: 2px (for very small costs like Titan)
- Node colors: model-specific (warm for Sonnet, cool for Haiku, gray for Titan)
- Link opacity: 0.4 default, 0.8 on hover
- Hover a node: highlight all connected links, dim others
- Click a node: filter the entire dashboard to that segment

### 10.3 When to Show

The Sankey is a summary-level visualization. Show it:
- On the main dashboard as an optional "Cost Flow" tab
- In period reports
- **Not** for real-time monitoring (too complex, data changes too fast)

---

## 11. Per-Session Drill-Down (Waterfall View)

### 11.1 Turn Waterfall

When clicking a session in the session list, show a detailed waterfall of all turns and their constituent LLM calls:

```
Turn 1 (User: "I'm feeling frustrated with my partner")     $0.045  1.8s
  ├─ Intent Detection (Haiku)          $0.001   120ms  ████░░░░░░
  ├─ Memory Detection (Haiku)          $0.001    95ms  ███░░░░░░░
  ├─ Retrieval Planning (Haiku)        $0.002   180ms  █████░░░░░
  ├─ Embedding (Titan) x3             $0.000    45ms  █░░░░░░░░░
  ├─ Background Class. (Haiku)         $0.001   150ms  ████░░░░░░
  ├─ Partner Sess. Class. (Haiku)      $0.001   200ms  █████░░░░░
  └─ Orchestrated Response (Sonnet)    $0.038  1200ms  ██████████████████████████

Turn 2 (User: "She never listens to me")                    $0.052  2.1s
  ├─ Intent Detection (Haiku)          $0.001   110ms
  ├─ Retrieval Planning (Haiku)        $0.003   210ms
  │   └─ 2 queries planned
  ├─ Embedding (Titan) x2             $0.000    40ms
  ├─ Memory Retrieval                  $0.000    85ms
  │   └─ Found 3 relevant memories
  └─ Orchestrated Response (Sonnet)    $0.048  1400ms
      └─ Cache: 2,800 read / 400 write
```

### 11.2 Color Coding for Waterfall

| Model | Bar Color | Background |
|-------|-----------|------------|
| Sonnet | `#F97316` (orange) | `#FFF7ED` |
| Haiku | `#06B6D4` (cyan) | `#ECFEFF` |
| Titan | `#6B7280` (gray) | `#F9FAFB` |

### 11.3 Per-Call Detail Panel

Click any call in the waterfall to expand:

```
┌─────────────────────────────────────────────────┐
│ Orchestrated Response                           │
│ Model: Sonnet 4.6                               │
│ Duration: 1,200ms                               │
│ Cost: $0.038                                    │
│                                                 │
│ TOKEN BREAKDOWN                                 │
│ ┌───────────────────────────────────────────┐   │
│ │ Input:  3,200 tokens                      │   │
│ │  ├─ Cached Read:  2,800 (87.5%)          │   │
│ │  ├─ Cache Write:    200 (6.3%)           │   │
│ │  └─ Standard:       200 (6.3%)           │   │
│ │ Output:   450 tokens                      │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ COST BREAKDOWN                                  │
│  Standard Input:  $0.0006                       │
│  Cached Read:     $0.0008                       │
│  Cache Write:     $0.0008                       │
│  Output:          $0.0068                       │
│  ─────────────────                              │
│  Total:           $0.0090                       │
│                                                 │
│ [View Prompt] [View Response] [View Context]    │
└─────────────────────────────────────────────────┘
```

---

## 12. Color System

### 12.1 Token Type Colors (Consistent Across All Charts)

| Token Type | Color | Hex | Rationale |
|-----------|-------|-----|-----------|
| Standard Input | Blue | `#3B82F6` | Primary cost, neutral |
| Cached Read | Green | `#22C55E` | Savings, positive |
| Cache Write | Amber | `#F59E0B` | Investment, becomes savings |
| Output | Purple | `#8B5CF6` | Distinct from input family |

### 12.2 Model Colors

| Model | Primary | Light BG | Rationale |
|-------|---------|----------|-----------|
| Sonnet | `#F97316` (orange) | `#FFF7ED` | Warm = expensive, user-facing |
| Haiku | `#06B6D4` (cyan) | `#ECFEFF` | Cool = efficient, background |
| Titan | `#6B7280` (gray) | `#F9FAFB` | Neutral = utility |

### 12.3 Status/Delta Colors

| Meaning | Color | Hex |
|---------|-------|-----|
| Positive trend (costs down, cache up) | Green | `#22C55E` |
| Negative trend (costs up, cache down) | Red | `#EF4444` |
| Warning (approaching limit) | Amber | `#F59E0B` |
| Neutral/informational | Blue | `#3B82F6` |
| Muted/secondary text | Gray | `#9CA3AF` |

### 12.4 Accessibility

- All color pairs pass WCAG AA contrast ratio (4.5:1 minimum)
- Use patterns (stripes, dots) in addition to color for stacked bars
- Tooltip text always includes exact values (never rely on color alone)
- Support both light and dark themes

---

## 13. Interaction Patterns

### 13.1 Time Range Selection

```
┌────────────────────────────────────────────────────────┐
│ [Last 24h] [7 days] [30 days] [This month] [Custom ▾] │
└────────────────────────────────────────────────────────┘
```

- Preset buttons apply immediately (no "Apply" button needed)
- "Custom" opens a dual-calendar date picker
- Selected range persists across all charts on the page
- URL updates with range params for shareable views

### 13.2 Filter Bar

```
┌──────────────────────────────────────────────────────────────┐
│ Model: [All ▾]  Stage: [All ▾]  Call Type: [All ▾]  [Reset] │
└──────────────────────────────────────────────────────────────┘
```

- Dropdown multi-select with checkboxes
- Filters apply globally to all visualizations
- Active filters shown as dismissible chips
- "Reset" clears all filters

### 13.3 Drill-Down Pattern

1. **Overview** (KPI cards + trend) → Click a KPI card to jump to its detail section
2. **Trend chart** → Click a bar to drill into hourly view → Click an hour to see sessions
3. **Session list** → Click a session to see turn waterfall → Click a turn to see per-call detail
4. **Breadcrumb navigation**: `Dashboard > Feb 15 > Session abc-123 > Turn 5`

### 13.4 Hover Behavior

- Charts: Show tooltip with exact values + context (comparison, percentage)
- KPI cards: Show full sparkline detail with daily values
- Session list rows: Subtle highlight, show "View details →"
- Waterfall bars: Expand to show token breakdown inline

---

## 14. New API Endpoints Required

### 14.1 Cost Analytics Endpoint

```
GET /api/brain/analytics/cost
Query params: start, end, granularity (hour|day|week|month),
              model, stage, callType

Response: {
  series: [{
    timestamp: string,
    standardInputCost: number,
    cacheReadCost: number,
    cacheWriteCost: number,
    outputCost: number,
    totalCost: number,
    callCount: number
  }],
  totals: {
    totalCost: number,
    totalCalls: number,
    avgCostPerSession: number,
    avgCostPerTurn: number
  }
}
```

### 14.2 Cache Analytics Endpoint

```
GET /api/brain/analytics/cache
Query params: start, end, granularity, model, stage

Response: {
  overall: {
    hitRate: number,
    totalCacheRead: number,
    totalCacheWrite: number,
    totalStandardInput: number,
    estimatedSavings: number
  },
  series: [{
    timestamp: string,
    cacheRead: number,
    cacheWrite: number,
    standardInput: number,
    hitRate: number
  }],
  byStage: [{
    stage: number,
    hitRate: number,
    totalTokens: number
  }]
}
```

### 14.3 Model Comparison Endpoint

```
GET /api/brain/analytics/models
Query params: start, end, stage

Response: {
  models: [{
    model: string,
    displayName: string,
    totalCost: number,
    totalCalls: number,
    avgCost: number,
    avgLatency: number,
    callTypes: [{
      callType: string,
      count: number,
      avgCost: number,
      avgInputTokens: number,
      avgOutputTokens: number
    }]
  }]
}
```

### 14.4 Session Cost Detail Endpoint

```
GET /api/brain/analytics/sessions/:sessionId/cost
Response: {
  totalCost: number,
  totalTokens: { input: number, output: number, cacheRead: number, cacheWrite: number },
  turns: [{
    turnId: string,
    userId: string,
    timestamp: string,
    totalCost: number,
    calls: [{
      callType: string,
      model: string,
      cost: number,
      durationMs: number,
      tokens: { input: number, output: number, cacheRead: number, cacheWrite: number }
    }]
  }],
  costByStage: [{ stage: number, cost: number }],
  cacheEfficiency: { hitRate: number, savings: number }
}
```

### 14.5 Cost Comparison Endpoint

```
GET /api/brain/analytics/compare
Query params: periodA_start, periodA_end, periodB_start, periodB_end

Response: {
  periodA: { totalCost, avgPerSession, cacheHitRate, avgLatency, sonnetCalls, haikuCalls },
  periodB: { totalCost, avgPerSession, cacheHitRate, avgLatency, sonnetCalls, haikuCalls },
  deltas: { costChange%, cacheChange%, latencyChange%, ... }
}
```

---

## 15. Component Library Recommendations

### 15.1 Charting Library: **Recharts**

Primary choice for React-based dashboard:
- Already ecosystem-compatible (React, TypeScript)
- Excellent responsive support
- Composable API (mix chart types easily)
- Good animation support
- Active maintenance, large community

Components needed:
- `BarChart` with `<Bar stackId="cost">` for stacked cost trend
- `PieChart` with `<Pie innerRadius>` for donut (cache efficiency)
- `AreaChart` for cache efficiency over time
- `LineChart` for optimization timeline
- `Tooltip`, `Legend`, `ResponsiveContainer`

### 15.2 Supplementary: **@visx** (for complex visualizations)

- Sankey diagram (not natively in Recharts)
- Heatmap for cache by stage
- Custom gauge charts
- Waterfall charts

### 15.3 Sparklines

- `recharts` `<Sparklines>` or `react-sparklines` package
- Configuration: 80px wide, 24px tall, no axes/labels, stroke-only with endpoint dots

### 15.4 Number Formatting

Extend existing `formatPrice()` in `tools/status-dashboard/src/utils/formatters.ts`:

```typescript
// Add to existing formatters.ts
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDelta(current: number, previous: number): {
  value: string; direction: 'up' | 'down' | 'flat'; color: string
} {
  if (previous === 0) return { value: 'N/A', direction: 'flat', color: '#9CA3AF' };
  const delta = ((current - previous) / previous) * 100;
  return {
    value: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    color: delta > 0 ? '#EF4444' : delta < 0 ? '#22C55E' : '#9CA3AF'
  };
}
```

---

## 16. Responsive / Mobile Considerations

### 16.1 Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| Desktop (>1200px) | Full grid: 6 KPI cards, side-by-side panels, full charts |
| Tablet (768-1200px) | 3 KPI cards per row, stacked panels, charts at full width |
| Mobile (<768px) | 2 KPI cards per row, single column, simplified charts |

### 16.2 Mobile Adaptations

| Desktop Component | Mobile Replacement |
|-------------------|--------------------|
| Sankey diagram | Cost breakdown list with proportion bars |
| Heatmap | Simplified list with colored badges |
| Waterfall chart | Collapsible turn list |
| Side-by-side comparison | Tabbed before/after view |
| Multi-axis charts | Single-metric sparkline cards |

### 16.3 Touch Interactions

- Replace hover tooltips with tap-to-reveal modals
- Swipe between time periods in charts
- Collapsible sections for detailed breakdowns
- Minimum touch target: 44x44px

---

## 17. Performance Considerations

### 17.1 Data Loading Strategy

- **KPI cards**: Load first (smallest query, most impactful)
- **Trend chart**: Load second (moderate query, primary visual)
- **Detail panels**: Load on-demand when section scrolls into view
- **Sankey/complex**: Load last or on explicit tab click
- Use skeleton loaders for all components while loading

### 17.2 Caching Strategy

- Cache analytics responses for 5 minutes (data doesn't change frequently)
- Use `stale-while-revalidate` pattern for background refresh
- Pre-compute daily aggregates in a materialized view or summary table for fast historical queries

### 17.3 Query Optimization

For production scale, pre-compute daily aggregates:

```sql
-- Daily aggregation table (computed nightly or on-demand)
CREATE TABLE BrainActivityDailyAgg (
  day DATE,
  model VARCHAR,
  callType VARCHAR,
  stage INT,
  totalCost DECIMAL(10,6),
  callCount INT,
  totalInputTokens BIGINT,
  totalOutputTokens BIGINT,
  totalCacheRead BIGINT,
  totalCacheWrite BIGINT,
  avgDurationMs INT,
  PRIMARY KEY (day, model, callType, stage)
);
```

---

## Summary of Visualization Types

| Metric | Chart Type | Primary Color | Interaction |
|--------|-----------|---------------|-------------|
| Cost over time | Stacked bar chart | Token type colors | Click drill-down |
| Cache hit rate | Donut chart | Green/blue/amber | Hover for details |
| Cache over time | 100% stacked area | Green/blue/amber | Time range zoom |
| Cache by stage | Heatmap | Sequential green→red | Hover for values |
| Model comparison | Grouped horizontal bar | Model colors | Click to filter |
| Cost by stage | Horizontal stacked bar | Model colors | Click to filter |
| Token budget | Half-donut gauge | Green/amber/red zones | Hover for breakdown |
| Context composition | Stacked horizontal bar | Category colors | Hover for values |
| Cost flow | Sankey diagram | Model + token colors | Hover to highlight |
| Optimization timeline | Annotated line chart | Before=gray, after=green | Scroll annotations |
| Savings waterfall | Waterfall chart | Green (savings), gray (baseline) | Hover for details |
| Per-session detail | Waterfall/timeline | Model colors | Click to expand |
| Real-time ticker | Live updating list | Status colors | Auto-updating |
| KPI summary | Cards + sparklines | Delta colors | Click to navigate |
| Period comparison | Side-by-side panels | Delta colors | Toggle periods |
