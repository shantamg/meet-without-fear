# Neural Monitor v2 — UX Design Document

## Executive Summary

The Neural Monitor v2 is a redesign of the internal developer tool for monitoring the Meet Without Fear AI pipeline. It serves two audiences: **developers** debugging prompt behavior and response quality, and **stakeholders** monitoring costs and system health. The redesign transforms a local-only, session-focused viewer into a comprehensive observability platform with historical analysis, cost analytics, and prompt pipeline inspection.

---

## 1. Design Principles

1. **Progressive Disclosure** — Summary first, details on demand, raw data as last resort
2. **Information Density** — Show maximum useful data without clutter (inspired by Grafana/Datadog)
3. **Temporal Navigation** — Everything is anchored to time; scrub forward/backward through sessions
4. **Model-Aware Coloring** — Consistent color coding for models, stages, and severity throughout
5. **Developer-First Typography** — Monospace for data/code, sans-serif for narrative/labels
6. **Keyboard-Navigable** — Power users can navigate entirely via keyboard shortcuts

---

## 2. Visual Design System

### 2.1 Color Palette

```
Background Layers:
  --bg-base:     #0a0e1a    (deepest background)
  --bg-surface:  #111827    (cards, panels)
  --bg-elevated: #1e293b    (hover states, active items)
  --bg-overlay:  #334155    (modals, popovers)

Text:
  --text-primary:   #f1f5f9
  --text-secondary: #94a3b8
  --text-muted:     #64748b

Model Colors (used consistently for badges, chart lines, borders):
  Sonnet:  --model-sonnet:  #3b82f6  (blue)    — user-facing, expensive
  Haiku:   --model-haiku:   #10b981  (green)   — background, cheap
  Titan:   --model-titan:   #eab308  (yellow)  — embeddings

Stage Colors (used for stage badges and timeline markers):
  Stage 0 (Setup):             #6b7280  (gray)
  Stage 1 (Feel Heard):        #3b82f6  (blue)
  Stage 2 (Perspective Stretch):#8b5cf6  (purple)
  Stage 3 (Needs):             #f59e0b  (amber)
  Stage 4 (Resolution):        #10b981  (green)

Semantic Colors:
  Success:  #4ade80
  Warning:  #fbbf24
  Error:    #f87171
  Info:     #60a5fa
  Cost:     #fbbf24  (amber/gold for all monetary values)
```

### 2.2 Typography

```
UI Labels/Navigation:  Inter, system-ui, sans-serif  (14px base)
Data/Metrics:          'JetBrains Mono', 'Fira Code', monospace
Prompts/Code:          'JetBrains Mono', monospace (with syntax highlighting)
Narrative Text:        Inter, sans-serif (16px, 1.6 line-height)
```

### 2.3 Component Library (Key Primitives)

| Component | Description |
|-----------|-------------|
| `MetricCard` | Number + label + sparkline, used in dashboard overview |
| `ModelBadge` | Colored pill showing model name (Sonnet/Haiku/Titan) |
| `StageBadge` | Colored pill showing stage number + name |
| `CostDisplay` | Monospace price with significant digits highlighted |
| `TokenBar` | Horizontal bar showing input/output/cache token ratios |
| `TimelineEvent` | Collapsible card in session timeline |
| `PromptBlock` | Syntax-highlighted prompt text with cache indicators |
| `DataTable` | Sortable, filterable table for session lists |
| `SparkChart` | Inline mini chart for trends (cost over time, etc.) |

---

## 3. Navigation Structure

### 3.1 Layout: Sidebar + Main Content

```
┌─────────────────────────────────────────────────────┐
│ ● Neural Monitor          [search]    [🔔] [⚙️]    │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │           MAIN CONTENT                   │
│          │                                          │
│ ◉ Dash   │  (varies by selected view)               │
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

### 3.2 Route Structure

| Route | View | Description |
|-------|------|-------------|
| `/` | Dashboard Overview | Key metrics, active sessions, recent activity |
| `/sessions` | Session List | Browse/filter/search all sessions |
| `/sessions/:id` | Session Detail | Timeline view of a single session |
| `/sessions/:id/prompt/:activityId` | Prompt Inspector | Deep-dive into a single LLM call |
| `/sessions/:id/context` | Context Bundle | AI context assembly view (existing) |
| `/costs` | Cost Analysis | Cost breakdown charts and tables |
| `/live` | Live Monitor | Real-time event stream |

### 3.3 Sidebar Design

The sidebar is **240px wide**, collapsible to icon-only (56px) via toggle or `Cmd+B`.

**Top section:** Main navigation icons + labels
**Bottom section:** "Recent Sessions" — last 5 sessions visited, each showing name + cost badge. Clicking navigates directly to session detail.

---

## 4. Screen Designs

### 4.1 Dashboard Overview (`/`)

**Purpose:** At-a-glance health check. A stakeholder should understand system state in 5 seconds.

**Layout:** 2-row grid of metric cards + recent activity feed

```
┌─────────────────────────────────────────────────────────┐
│  DASHBOARD                                    [24h ▾]   │
├─────────────┬─────────────┬─────────────┬───────────────┤
│ ACTIVE NOW  │ TODAY COST  │ CACHE HIT   │ AVG RESPONSE  │
│    ●● 2     │  $0.0847    │   72.3%     │   2.4s        │
│  ▁▂▃▅▆▃▂▁  │  ▁▂▃▅▇▅▃▂  │  ▅▆▇▇▇▆▅▃  │  ▃▂▂▃▄▃▂▂    │
├─────────────┴─────────────┴─────────────┴───────────────┤
│                                                         │
│  COST TREND (7 day)              MODEL DISTRIBUTION     │
│  ┌────────────────────┐          ┌──────────────────┐   │
│  │     ╱╲             │          │ ██████ Sonnet 68%│   │
│  │   ╱    ╲    ╱╲     │          │ ███    Haiku  27%│   │
│  │ ╱        ╲╱    ╲   │          │ █      Titan   5%│   │
│  └────────────────────┘          └──────────────────┘   │
│                                                         │
│  RECENT SESSIONS                                        │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ● Alex & Jordan   Stage 2   5 turns   $0.0234  2m  ││
│  │ ○ Sam's Thoughts  Stage 1   3 turns   $0.0089  5m  ││
│  │ ○ Pat & Casey     Resolved  12 turns  $0.0456 1h   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Metric Cards (top row):**

| Card | Primary Value | Sparkline | Subtext |
|------|--------------|-----------|---------|
| Active Sessions | Count with pulsing dots | 24h activity histogram | "2 partner, 0 inner work" |
| Today's Cost | Dollar amount in gold | Cost per hour over today | "+12% vs yesterday" |
| Cache Hit Rate | Percentage | Hit rate over 24h | "saving ~$X.XX/day" |
| Avg Response Time | Seconds | Response time trend | "p95: 4.2s" |

**Interactions:**
- Time range selector (24h / 7d / 30d) in top-right corner
- Click any metric card to navigate to its detail view (cost card → `/costs`)
- Click any session row to navigate to `/sessions/:id`
- Sparklines are non-interactive (informational only)

---

### 4.2 Session List (`/sessions`)

**Purpose:** Browse, filter, and search all sessions. Primary workflow entry point for developers investigating specific sessions.

**Layout:** Filter bar + sortable table

```
┌─────────────────────────────────────────────────────────┐
│  SESSIONS                                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ [🔍 Search by name, email...]  [Status ▾] [Type ▾] ││
│  │                           [Stage ▾] [Date range ▾]  ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──┬──────────────┬────────┬───────┬──────┬──────┬───┐│
│  │  │ PARTICIPANTS │ STATUS │ STAGE │TURNS │ COST │AGE ││
│  ├──┼──────────────┼────────┼───────┼──────┼──────┼───┤│
│  │● │Alex & Jordan │ Active │ S2 ◼  │  5   │$0.02│ 2m ││
│  │  │              │        │       │      │      │    ││
│  │○ │Sam           │ Waiting│ S1 ◼  │  3   │$0.01│ 5m ││
│  │  │Inner Thoughts│        │       │      │      │    ││
│  │○ │Pat & Casey   │Resolved│ S4 ◼  │ 12   │$0.05│ 1h ││
│  │  │              │        │       │      │      │    ││
│  │○ │Robin & Dana  │Archived│ S4 ◼  │ 24   │$0.11│ 2d ││
│  └──┴──────────────┴────────┴───────┴──────┴──────┴───┘│
│                                                         │
│  Showing 1-25 of 142 sessions          [◀ 1 2 3 ... ▶] │
└─────────────────────────────────────────────────────────┘
```

**Columns:**

| Column | Content | Sort |
|--------|---------|------|
| Status indicator | Green dot (active), gray dot (inactive) | — |
| Participants | Names for partner sessions; "Inner Thoughts" label for solo | Alpha |
| Status | Badge: Active/Waiting/Resolved/Abandoned/Archived | Default |
| Stage | Stage number with color-coded square | Numeric |
| Turns | Turn count | Numeric |
| Cost | Total cost in gold monospace | Numeric (default sort: desc) |
| Age | Relative time since creation | Chronological |

**Filters (combinable):**
- **Search**: Full-text across participant names, emails, session IDs
- **Status**: Multi-select dropdown (Active, Waiting, Resolved, Abandoned, Archived)
- **Type**: Partner / Inner Thoughts
- **Stage**: 0-4 multi-select
- **Date range**: Preset ranges (Today, Last 7d, Last 30d, Custom)

**Interactions:**
- Click row → navigate to `/sessions/:id`
- Sort by clicking column headers
- Filters persist in URL query params (shareable links)
- Pagination: 25 per page, infinite scroll option

---

### 4.3 Session Detail (`/sessions/:id`)

**Purpose:** Complete view of a single session. This is the most complex and most-used screen.

**Layout:** Header + optional split view + timeline

```
┌─────────────────────────────────────────────────────────┐
│  ← Sessions    Alex & Jordan    ● Live   Stage 2        │
│  Partner Session  |  12 turns  |  $0.0456  |  Started 2h│
│  [Timeline] [Context] [Prompts] [Cost]                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌── Alex (Initiator) ──────┬── Jordan (Invitee) ──────┐│
│  │                          │                          ││
│  │  Turn 1 · 2:34 PM        │  Turn 1 · 2:35 PM       ││
│  │  ┌────────────────────┐  │  ┌────────────────────┐  ││
│  │  │ 👤 "I feel like..." │  │  │ 👤 "I've been..."  │  ││
│  │  └────────────────────┘  │  └────────────────────┘  ││
│  │                          │                          ││
│  │  ▶ Intent Detection      │  ▶ Intent Detection      ││
│  │    haiku · 0.3s · $0.001 │    haiku · 0.3s · $0.001 ││
│  │  ▶ Retrieval Planning    │  ▶ Retrieval Planning     ││
│  │    haiku · 0.4s · $0.001 │    haiku · 0.4s · $0.001 ││
│  │  ▼ Orchestrated Response │  ▼ Orchestrated Response  ││
│  │    sonnet · 2.1s · $0.01 │    sonnet · 2.1s · $0.01 ││
│  │    ┌──────────────────┐  │    ┌──────────────────┐   ││
│  │    │ SYSTEM PROMPT    │  │    │ SYSTEM PROMPT     │   ││
│  │    │ [cached ✓] 2.4k  │  │    │ [cached ✓] 2.4k   │   ││
│  │    │ MESSAGES [7]     │  │    │ MESSAGES [7]      │   ││
│  │    │ RESPONSE         │  │    │ RESPONSE          │   ││
│  │    │ "I hear that..." │  │    │ "That sounds..."  │   ││
│  │    └──────────────────┘  │    └──────────────────┘   ││
│  │                          │                          ││
│  │  ┌────────────────────┐  │  ┌────────────────────┐  ││
│  │  │ 🤖 "I hear that..."│  │  │ 🤖 "That sounds..."│  ││
│  │  └────────────────────┘  │  └────────────────────┘  ││
│  │                          │                          ││
│  └──────────────────────────┴──────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Header Bar:**
- Back button (← Sessions)
- Session title (participant names)
- Live indicator (pulsing green dot if active)
- Stage badge (colored)
- Summary stats: turns, total cost, duration
- Sub-navigation tabs: **Timeline** | Context | Prompts | Cost

**Split View (Partner Sessions):**
- Two scrollable columns, one per participant
- Column header: avatar, name, role badge (Initiator/Invitee)
- Each column scrolls independently
- Color-coded top border (blue = initiator, purple = invitee)

**Single View (Inner Thoughts):**
- Single centered column (max-width 900px)

**Turn Cards (within each column):**
Each turn shows:
1. **Turn header**: timestamp + turn number
2. **User message bubble**: blue background, right-aligned text
3. **Pipeline steps**: collapsible event cards (from EventRenderer)
4. **AI response bubble**: dark background, left-aligned text

**Pipeline Step Cards (the core developer tool):**
Each step is a collapsible card showing:
- **Collapsed**: icon + title + preview text + model badge + duration + cost + status
- **Expanded**: Full structured output + raw data toggle

**Progressive Disclosure Levels:**
```
Level 0: Turn summary (user message → AI response, steps collapsed)
Level 1: Step headers visible (model, duration, cost)
Level 2: Step expanded (structured output, key fields)
Level 3: Raw JSON toggle (full input/output)
```

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `j/k` | Navigate between turns |
| `h/l` | Switch between split view columns |
| `Enter` | Expand/collapse selected step |
| `e` | Expand all steps in current turn |
| `c` | Collapse all steps |
| `p` | Open prompt inspector for selected step |

---

### 4.4 Prompt Inspector (`/sessions/:id/prompt/:activityId`)

**Purpose:** Deep-dive into exactly what was sent to and received from the LLM for a single call. This is the "Chrome DevTools Network tab" equivalent.

**Layout:** 3-panel horizontal split

```
┌─────────────────────────────────────────────────────────┐
│  ← Session Detail    Prompt Inspector                   │
│  Orchestrated Response · Sonnet · Turn 3 · $0.0123      │
├───────────────────┬───────────────────┬─────────────────┤
│                   │                   │                  │
│  REQUEST          │  RESPONSE         │  METADATA        │
│                   │                   │                  │
│  System Prompt    │  Response Text    │  Model            │
│  ┌─────────────┐  │  ┌─────────────┐  │  claude-sonnet   │
│  │ FACILITATOR  │  │  │ "I hear     │  │                  │
│  │ RULES        │  │  │  that you   │  │  Tokens          │
│  │ [CACHED ✓]   │  │  │  feel..."   │  │  In:  2,847      │
│  │              │  │  │             │  │  Out:   312      │
│  │ You are a    │  │  │             │  │  Cache: 2,102    │
│  │ skilled...   │  │  └─────────────┘  │                  │
│  └─────────────┘  │                   │  Cost Breakdown   │
│                   │  Structured Out   │  Input:  $0.0089  │
│  Dynamic Context  │  ┌─────────────┐  │  Output: $0.0034  │
│  ┌─────────────┐  │  │ thinking:   │  │  Cache:  -$0.006  │
│  │ Stage: S1   │  │  │ "The user   │  │  Total:  $0.0063  │
│  │ Intent: ... │  │  │  seems..."  │  │                  │
│  │ [NOT CACHED] │  │  │ response:   │  │  Timing           │
│  └─────────────┘  │  │ "I hear..." │  │  Queued:   0.1s   │
│                   │  │ empathy: {} │  │  TTFB:     0.8s   │
│  Messages [7]     │  └─────────────┘  │  Total:    2.1s   │
│  ┌─────────────┐  │                   │                  │
│  │ 👤 user msg  │  │  Raw JSON  [▾]  │  Cache Analysis   │
│  │ 🤖 ai resp   │  │                   │  ┌─────────────┐ │
│  │ 👤 user msg  │  │                   │  │ ████░░ 74%  │ │
│  │ 🤖 ai resp   │  │                   │  │ cached      │ │
│  │ 👤 user msg  │  │                   │  └─────────────┘ │
│  │  [3 earlier] │  │                   │                  │
│  └─────────────┘  │                   │                  │
│                   │                   │                  │
└───────────────────┴───────────────────┴─────────────────┘
```

**Left Panel — Request:**
- **System Prompt Block**: Rendered with syntax highlighting. Cache indicator badge (`CACHED ✓` in green or `NOT CACHED` in gray). Shows token count. Collapsible (long prompts truncated with "Show full" toggle).
- **Dynamic Context Block**: Stage, intent, memories, facts injected into the call. Shows cache status separately from system prompt.
- **Messages Array**: Chat-style rendering of the conversation history sent to the model. Earlier messages collapsed by default ("Show 3 earlier messages"). Each message shows role badge + content.

**Center Panel — Response:**
- **Response Text**: The final AI response, rendered as prose
- **Structured Output**: If the call returned structured JSON (thinking, empathy draft, etc.), shown as labeled fields in cards
- **Raw JSON Toggle**: Expandable raw response JSON

**Right Panel — Metadata:**
- Model name + version
- Token counts (input, output, cache read, cache write)
- Cost breakdown (input cost, output cost, cache savings, total)
- Timing (queue time, time to first byte, total duration)
- Cache analysis: visual bar showing what % of tokens were cache hits
- Call ID for cross-referencing with backend logs

**Interactions:**
- Click system prompt sections to expand/collapse
- Toggle between "Formatted" and "Raw JSON" views for any panel
- Copy buttons on prompt text blocks
- "Compare with previous turn" button to diff prompts

---

### 4.5 Cost Analysis (`/costs`)

**Purpose:** Dedicated cost analytics for stakeholders and budget monitoring.

**Layout:** Time-series chart + breakdown cards + cost table

```
┌─────────────────────────────────────────────────────────┐
│  COST ANALYSIS                       [7d ▾] [Export ▾]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SUMMARY CARDS                                          │
│  ┌──────────┬──────────┬──────────┬────────────────────┐│
│  │ PERIOD   │ VS PREV  │ PER SESS │ CACHE SAVINGS      ││
│  │ $0.5924  │ -8.2%  ▼ │ $0.0234  │ $0.1847 saved      ││
│  └──────────┴──────────┴──────────┴────────────────────┘│
│                                                         │
│  COST OVER TIME                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │   $0.15 ┤                                          ││
│  │         │    ╱╲                                     ││
│  │   $0.10 ┤  ╱    ╲       ╱╲                         ││
│  │         │╱        ╲   ╱    ╲    ╱╲                  ││
│  │   $0.05 ┤          ╲╱        ╲╱    ╲                ││
│  │         │                            ╲              ││
│  │   $0.00 ┤──────────────────────────────             ││
│  │         Mon  Tue  Wed  Thu  Fri  Sat  Sun           ││
│  │                                                     ││
│  │  ── Total  ── Sonnet  ── Haiku  ── Titan            ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  BREAKDOWN                                              │
│  ┌─────────────────────┬───────────────────────────────┐│
│  │ BY MODEL            │ BY CALL TYPE                  ││
│  │ ┌──────────────────┐│ ┌───────────────────────────┐ ││
│  │ │ ████████ Sonnet  ││ │ ████████ Orchestrated 62% │ ││
│  │ │   68% · $0.403   ││ │ ███      Reconciler   18% │ ││
│  │ │ ████    Haiku    ││ │ ██       Classification 8% │ ││
│  │ │   27% · $0.160   ││ │ █        Intent        5% │ ││
│  │ │ █       Titan    ││ │ █        Other         7% │ ││
│  │ │    5% · $0.029   ││ └───────────────────────────┘ ││
│  │ └──────────────────┘│                               ││
│  └─────────────────────┴───────────────────────────────┘│
│                                                         │
│  COST BY SESSION                                        │
│  ┌──┬──────────────┬──────┬───────┬───────┬───────────┐│
│  │  │ SESSION      │TURNS │SONNET │ HAIKU │ TOTAL     ││
│  ├──┼──────────────┼──────┼───────┼───────┼───────────┤│
│  │1 │Alex & Jordan │ 12   │$0.038 │$0.007 │ $0.0456   ││
│  │2 │Pat & Casey   │  8   │$0.025 │$0.005 │ $0.0312   ││
│  │3 │Sam (Inner)   │  3   │$0.007 │$0.002 │ $0.0089   ││
│  └──┴──────────────┴──────┴───────┴───────┴───────────┘│
└─────────────────────────────────────────────────────────┘
```

**Summary Cards (top row):**
- Period total cost (with period label)
- Change vs previous period (green/red arrow)
- Average cost per session
- Total cache savings (how much would have been spent without caching)

**Cost Over Time Chart:**
- Area chart with stacked model costs
- Hover tooltip showing exact values per model at that point
- Toggleable series (click legend to show/hide models)
- Time range selector syncs all charts on the page

**Breakdown Section:**
- **By Model**: Horizontal bar chart, percentage + absolute cost
- **By Call Type**: Horizontal bar chart, showing which pipeline steps cost most

**Cost by Session Table:**
- Sortable table showing per-session cost breakdown
- Columns: Session name, turns, Sonnet cost, Haiku cost, Titan cost, total
- Click row to navigate to session detail

**Interactions:**
- Time range selector (24h, 7d, 30d, custom) affects all charts
- Export button: CSV download of cost data
- Chart hover: tooltip with exact values
- Chart click: drill down to that time period

---

### 4.6 Live Monitor (`/live`)

**Purpose:** Real-time event stream for all active sessions. The "tail -f" for the AI pipeline.

**Layout:** Session tabs + event stream + optional detail pane

```
┌─────────────────────────────────────────────────────────┐
│  LIVE MONITOR                    ● Connected    [Pause] │
├─────────────────────────────────────────────────────────┤
│  [All Sessions] [Alex & Jordan ●] [Sam ●]               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  EVENT STREAM                                           │
│                                                         │
│  14:23:05.123  ● Alex & Jordan                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 🎯 Intent Detection     haiku  0.3s  $0.001    ✓   ││
│  │    intent: sharing_feelings  confidence: 0.92       ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  14:23:04.891  ● Alex & Jordan                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 📨 User Message Received                            ││
│  │    "I feel like we never talk about..."             ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  14:23:01.445  ● Sam                                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 🧠 Orchestrated Response  sonnet  2.1s  $0.012  ✓  ││
│  │    "I hear that you're feeling frustrated..."       ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  14:22:58.220  ● Sam                                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ⏳ Orchestrated Response  sonnet  ...       ↻       ││
│  │    Generating response...                           ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  [Auto-scroll ✓]                    142 events received │
└─────────────────────────────────────────────────────────┘
```

**Header:**
- Connection status indicator (connected/reconnecting/disconnected)
- Pause/Resume button (pauses auto-scroll, buffers events)
- Event counter

**Session Tabs:**
- "All Sessions" tab shows interleaved events from all active sessions
- One tab per active session (auto-created when session becomes active)
- Pulsing dot on tabs with recent activity
- Click tab to filter to that session only

**Event Cards:**
- Timestamp (HH:MM:SS.mmm precision)
- Session indicator (name + colored dot)
- Event type with icon
- Model badge + duration + cost
- Status: spinning for in-progress, checkmark for complete, X for error
- One-line preview of result

**Interactions:**
- Click event card to expand (shows full output, same as session detail)
- Click session name to navigate to session detail
- Auto-scroll toggle (sticky to bottom)
- Filter dropdown: LLM calls only / All events / Errors only
- Pause/Resume stream

**Real-Time Behaviors:**
- In-progress events (PENDING status) show spinner and update in-place when complete
- New events slide in from top (reversed chronological)
- Sound notification option for errors

---

### 4.7 Session Playback Mode (within Session Detail)

**Purpose:** Step through a session turn by turn, as if watching it happen live. Useful for understanding conversation flow and debugging stage transitions.

**Activation:** Button in session detail header: `[▶ Playback]`

```
┌─────────────────────────────────────────────────────────┐
│  PLAYBACK MODE                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ◀◀  ◀  ▶▶  │  Turn 3 of 12  │  Stage 1 → Stage 2  ││
│  │ ──●──────────────────────────────────────────────── ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  (Session detail view, but only showing up to current   │
│   turn. Steps auto-expand as you advance.)              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Controls:**
- **Scrubber**: Timeline scrubber showing all turns, current position highlighted
- **Step Forward/Back**: Advance one turn at a time
- **Auto-play**: Play through turns with configurable speed (1s, 2s, 5s per turn)
- **Stage markers**: Visual markers on scrubber showing where stage transitions occurred

**Display:**
- Session detail view is filtered to show only turns up to the current playback position
- Current turn is highlighted with a glow effect
- Pipeline steps in the current turn auto-expand as you arrive
- Stage badge updates as you cross stage transitions

---

## 5. Interaction Patterns

### 5.1 Progressive Disclosure Hierarchy

```
Level 0: Dashboard metrics (glanceable)
  └─ Level 1: Session list (scannable)
       └─ Level 2: Session detail — turn summaries (readable)
            └─ Level 3: Expanded event cards (inspectable)
                 └─ Level 4: Prompt inspector (debuggable)
                      └─ Level 5: Raw JSON (copy-pasteable)
```

### 5.2 Cross-Linking

Every entity links to related views:
- Session name → Session Detail
- Model badge → Cost Analysis filtered by that model
- Stage badge → Session Detail scrolled to that stage transition
- Cost value → Cost Analysis
- Event card → Prompt Inspector

### 5.3 Search (Global, `Cmd+K`)

Global search accessible via `Cmd+K` (or search bar in header):
- Searches across session names, participant emails, session IDs
- Returns results grouped by type (Sessions, Events, etc.)
- Quick actions: "Go to session...", "Show costs for..."

---

## 6. Responsive Design

**Desktop (>1280px):** Full sidebar + split view in session detail
**Tablet (768-1280px):** Collapsed sidebar (icons only) + stacked columns in session detail
**Mobile (<768px):** Not a primary target. Bottom tab navigation replaces sidebar. Session detail shows single column with toggle.

---

## 7. Existing Patterns to Preserve

The current dashboard has strong patterns worth keeping:

1. **Split view for partner sessions** — Side-by-side columns per participant (SplitView.tsx)
2. **Event type dispatch** — EventRenderer.tsx pattern with BaseEventWrapper
3. **Warm/Cool accent colors** — Sonnet = warm/amber, Haiku = cool/cyan for event borders
4. **FormattedPrice component** — Monospace cost display with significant digit highlighting
5. **DetailBlock collapsibles** — Expand/collapse for raw data sections
6. **SmartDataViewer** — Intelligent JSON rendering with message detection
7. **Connection status indicators** — Live/Offline badge via Ably
8. **Dark theme CSS variables** — Existing `--bg-dark`, `--bg-card`, `--accent` system

### Changes from Current:
- **Add sidebar navigation** (currently just a top nav with one link)
- **Add dashboard overview** (currently jumps straight to session list)
- **Add dedicated cost page** (currently cost is inline per-session only)
- **Add live monitor** (currently live events only visible within session detail)
- **Add prompt inspector** (currently buried in expandable event cards)
- **Add playback mode** (new capability)
- **Add global search** (currently no search)
- **Preserve and extend** the event rendering system, split view, and context page

---

## 8. Chart Library Recommendation

For the cost analysis charts and dashboard sparklines, use **Recharts** (already React-compatible, lightweight, good dark theme support) or **Tremor** (built specifically for dashboard UIs with dark mode).

Recommended chart types:
- **Sparklines**: Inline trend indicators in metric cards
- **Area charts**: Cost over time (stacked by model)
- **Horizontal bar charts**: Model/call-type breakdown
- **Donut chart**: Model distribution
- **Heatmap**: Activity by hour/day (optional, for the dashboard)
