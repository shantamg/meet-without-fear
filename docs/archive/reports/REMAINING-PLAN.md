# Neural Monitor v2 — Remaining Implementation Plan

## What's Done

All core pages and backend endpoints are implemented:
- Dashboard Overview with metric cards, cost trend chart, model distribution
- Cost Analysis with stacked area charts, model/call-type breakdowns, cache efficiency, CSV export
- Enhanced Session List with filters, search, sorting, URL-persisted state
- Prompt Inspector with 3-panel layout (request/response/metadata)
- Session Detail sub-tabs (Timeline/Context/Cost/Prompts) with cache badges
- Live Monitor with real-time Ably stream, session tabs, pause/resume
- 4 new backend API endpoints (dashboard, costs, enhanced sessions, prompt detail)
- Production serving from backend at /monitor
- Sidebar navigation with collapsible layout

## What Remains

8 features across 3 workstreams. All are independent and can be parallelized.

---

### Stream A: Session Playback + Keyboard Navigation

#### Task A1: Session Playback Mode

Add playback controls to the Session Detail page for stepping through historical sessions turn-by-turn.

**Files to create:**
- `src/components/playback/PlaybackControls.tsx`
- `src/components/playback/PlaybackOverlay.tsx`

**Files to modify:**
- `src/components/session/SessionDetail.tsx` — Add "▶ Playback" button to header, render PlaybackOverlay when active

**Implementation:**

PlaybackControls component:
- Timeline scrubber showing all turns as markers on a horizontal bar
- Stage transition markers (colored dots on the scrubber matching stage colors)
- Current position indicator (highlighted marker)
- Controls: ◀◀ (first) | ◀ (prev) | ▶ (play/pause) | ▶▶ (next)
- Speed selector: 1s / 2s / 5s per turn
- Turn counter: "Turn 3 of 12"
- Stage badge updating as playback crosses stage transitions

PlaybackOverlay component:
- Wraps the existing timeline view
- Filters activities to only show turns up to the current playback position
- Highlights the current turn with a glow/border effect (CSS class `playback-current-turn`)
- Auto-expands pipeline steps in the current turn

State management:
```typescript
const [playbackActive, setPlaybackActive] = useState(false);
const [currentTurn, setCurrentTurn] = useState(0);
const [isPlaying, setIsPlaying] = useState(false);
const [playbackSpeed, setPlaybackSpeed] = useState(2000); // ms per turn
```

Auto-play: `useEffect` with `setInterval` that advances `currentTurn` at `playbackSpeed` intervals when `isPlaying` is true.

The turn list should be derived from the existing activity data using the `turnGrouping.ts` utility that already groups activities by turn.

#### Task A2: Keyboard Shortcuts

Add keyboard navigation throughout the app.

**Files to create:**
- `src/hooks/useKeyboardShortcuts.ts`

**Files to modify:**
- `src/components/session/SessionDetail.tsx` — j/k turn navigation, h/l column switching, Enter expand
- `src/components/layout/AppLayout.tsx` — Cmd+K global search trigger (just the keybinding, actual search is Task A3)

**Shortcuts:**

| Context | Key | Action |
|---------|-----|--------|
| Session Detail | `j` | Next turn |
| Session Detail | `k` | Previous turn |
| Session Detail | `h` | Switch to left column (initiator) |
| Session Detail | `l` | Switch to right column (invitee) |
| Session Detail | `Enter` | Expand/collapse selected event |
| Session Detail | `e` | Expand all events in current turn |
| Session Detail | `c` | Collapse all events |
| Session Detail | `p` | Open prompt inspector for selected event |
| Global | `Cmd+K` | Open global search |
| Global | `Cmd+B` | Toggle sidebar (already implemented) |
| Playback | `Space` | Play/pause |
| Playback | `←` | Previous turn |
| Playback | `→` | Next turn |

Implementation: Custom hook `useKeyboardShortcuts(shortcuts: Map<string, () => void>)` that registers/deregisters event listeners. Each page registers its own shortcuts. Shortcuts disabled when an input/textarea is focused.

The hook needs to track "focused turn index" and "focused column" state in SessionDetail, using a visual indicator (subtle border highlight) on the focused turn.

#### Task A3: Global Search (Cmd+K)

Command palette for quick navigation.

**Files to create:**
- `src/components/layout/GlobalSearch.tsx`

**Files to modify:**
- `src/components/layout/AppLayout.tsx` — Render GlobalSearch, handle Cmd+K to toggle

**Implementation:**

Modal overlay (centered, 500px wide) with:
- Search input (auto-focused)
- Results grouped by type: Sessions, Quick Actions
- Keyboard navigation: ↑/↓ to select, Enter to navigate, Escape to close

Search sources:
- Sessions: Fetch from `/api/brain/sessions?search=<query>&limit=5` (already supported)
- Quick actions: Static list — "Go to Dashboard", "Go to Costs", "Go to Live Monitor"

Debounce search input (200ms). Show results as they arrive. Recent searches stored in localStorage.

Styling: Dark overlay backdrop, search modal with --bg-elevated background, results with hover highlight.

---

### Stream B: Prompt Diff Viewer + API URL Config

#### Task B1: Prompt Diff Viewer

Compare system prompts between consecutive turns to see what changed.

**Files to create:**
- `src/components/prompt/PromptDiffViewer.tsx`
- `src/utils/diffEngine.ts`

**Files to modify:**
- `src/pages/PromptInspectorPage.tsx` — Add "Compare with previous" button
- `src/components/session/SessionPromptsTab.tsx` — Add "Diff" button between adjacent prompt rows

**Implementation:**

diffEngine.ts:
- Simple line-by-line diff algorithm (no library needed for internal tool)
- `computeDiff(oldText: string, newText: string): DiffLine[]`
- `DiffLine = { type: 'same' | 'added' | 'removed', content: string, lineNumber: number }`
- Group consecutive changes into change hunks with N lines of context

PromptDiffViewer.tsx:
- Side-by-side view (two columns) or unified view (single column, toggle)
- Left = previous turn's system prompt, Right = current turn's
- Added lines: green background (#10b98120)
- Removed lines: red background (#f8717120)
- Unchanged lines: normal background
- Change category badges at top: "TURN_COUNTER", "INTENSITY_CHANGE", "PHASE_SHIFT", "STAGE_TRANSITION" (detect by checking which sections changed)
- Line numbers in gutter
- Collapse unchanged sections with "Show N unchanged lines" expander

Data: Fetch two adjacent prompt details and extract their system prompt text for comparison. The prompt detail endpoint already returns the full system prompt blocks.

#### Task B2: VITE_API_URL Support

Make the API base URL configurable for flexible deployment.

**Files to modify:**
- `src/services/api.ts` — Prefix all fetch URLs with configurable base

**Implementation:**

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '';
```

Then replace all `fetch('/api/brain/...')` with `fetch(`${API_BASE}/api/brain/...`)`.

This is a small change (find-and-replace) but enables deploying the dashboard to a different origin than the backend (e.g., Vercel) with CORS configured on the backend.

---

### Stream C: Performance + Resilience

#### Task C1: Code Splitting with Lazy Loading

Split the 940KB bundle into route-based chunks.

**Files to modify:**
- `src/App.tsx` — Replace static imports with `React.lazy()` + `<Suspense>`

**Implementation:**

```tsx
import { lazy, Suspense } from 'react';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CostAnalysisPage = lazy(() => import('./pages/CostAnalysisPage').then(m => ({ default: m.CostAnalysisPage })));
const LiveMonitorPage = lazy(() => import('./pages/LiveMonitorPage').then(m => ({ default: m.LiveMonitorPage })));
const PromptInspectorPage = lazy(() => import('./pages/PromptInspectorPage').then(m => ({ default: m.PromptInspectorPage })));
// Keep SessionListPage and SessionDetail eager (most visited)
```

Wrap route content in `<Suspense fallback={<LoadingSpinner />}>`.

Also add manual chunks in vite.config.ts:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        recharts: ['recharts'],
      }
    }
  }
}
```

This splits Recharts (~400KB) into its own chunk loaded only when a page with charts is visited.

#### Task C2: Error Boundaries

Prevent one component crash from taking down the whole app.

**Files to create:**
- `src/components/ErrorBoundary.tsx`

**Files to modify:**
- `src/App.tsx` — Wrap each route in ErrorBoundary
- `src/pages/LiveMonitorPage.tsx` — Wrap Ably event stream in ErrorBoundary (most likely to error)

**Implementation:**

```tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  // Standard React error boundary pattern
  // Fallback UI: "Something went wrong" card with error message + "Reload" button
  // Log errors to console with component stack
}
```

Add ErrorBoundary around:
1. Each route (page-level) — shows error + "Go to Dashboard" link
2. Each chart component — shows "Chart failed to load" placeholder
3. Live Monitor event stream — shows "Stream disconnected" with reconnect button

#### Task C3: Virtualized Scrolling

Handle sessions with 1000+ activities without performance degradation.

**Files to modify:**
- `tools/status-dashboard/package.json` — Add `react-window` dependency
- `src/components/session/SessionDetail.tsx` or the TurnView rendering — Wrap turn list in `FixedSizeList` or `VariableSizeList`
- `src/pages/LiveMonitorPage.tsx` — Wrap event stream in virtualized list

**Implementation:**

Install: `npm install react-window @types/react-window`

For Session Detail timeline:
- Use `VariableSizeList` since turns have variable height (depends on number of events)
- Estimate row height based on event count per turn
- Keep a `rowHeightCache` that measures actual rendered height and updates estimates
- Only render turns visible in the viewport + 3 overscan

For Live Monitor:
- Use `VariableSizeList` with reverse layout (newest at top)
- Buffer: keep 500 events max, drop oldest

#### Task C4: Retry Logic + Ably Recovery

Add resilience to API calls and real-time connection.

**Files to create:**
- `src/utils/fetchWithRetry.ts`

**Files to modify:**
- `src/services/api.ts` — Use fetchWithRetry instead of raw fetch
- `src/hooks/useAblyConnection.ts` — Add recovery logic

**Implementation:**

fetchWithRetry.ts:
```typescript
async function fetchWithRetry(url: string, options?: RequestInit, retries = 2, delay = 1000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res; // Don't retry 4xx
      if (i < retries) await new Promise(r => setTimeout(r, delay * (i + 1)));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

Ably recovery:
- On disconnect, show yellow "Reconnecting..." banner
- Ably SDK auto-reconnects, but add a manual reconnect button after 30s
- On reconnect, fetch missed events by querying `/api/brain/activity/:sessionId` for events after the last received timestamp
- Show "N events may have been missed" indicator if gap detected

---

## Task Dependencies

All 3 streams are fully independent and can run in parallel:

```
Stream A (Playback + Navigation):
  A1 Session Playback ──────────→ independent
  A2 Keyboard Shortcuts ────────→ independent
  A3 Global Search (Cmd+K) ────→ independent

Stream B (Prompt Diff + Config):
  B1 Prompt Diff Viewer ────────→ independent
  B2 VITE_API_URL Support ──────→ independent (5 min task)

Stream C (Performance + Resilience):
  C1 Code Splitting ────────────→ independent
  C2 Error Boundaries ──────────→ independent
  C3 Virtualized Scrolling ─────→ independent
  C4 Retry Logic + Ably Recovery → independent
```

## Priority Order

If implementing sequentially, prioritize by impact:

1. **C1 Code Splitting** — Immediate performance win, easy
2. **C2 Error Boundaries** — Prevents crashes, easy
3. **B2 VITE_API_URL** — 5-minute change, enables flexible deployment
4. **A3 Global Search** — High-impact UX improvement
5. **A1 Session Playback** — Unique debugging capability
6. **C4 Retry Logic** — Resilience for production use
7. **A2 Keyboard Shortcuts** — Power user productivity
8. **B1 Prompt Diff Viewer** — Developer debugging tool
9. **C3 Virtualized Scrolling** — Only needed at scale

## Verification

After all tasks complete, run:
```bash
cd tools/status-dashboard && npm run build   # Frontend builds clean
cd backend && npx tsc --noEmit               # Backend compiles
cd backend && npm test                       # Backend tests pass
```
