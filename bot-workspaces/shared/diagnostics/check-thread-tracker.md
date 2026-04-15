# Check Thread Tracker Health

Inspect thread-tracker state for leaks, stale files, runaway follow-ups, and cron failures.

## State Directory

```
/opt/slam-bot/state/thread-tracker/
├── *.json           # Individual tracker files (one per tracked thread)
└── stats.json       # Daily aggregate stats
```

## Health Checks

Run these checks and flag any warnings:

### 1. Tracker file count

```bash
TRACKER_DIR="/opt/slam-bot/state/thread-tracker"
COUNT=$(find "$TRACKER_DIR" -name "*.json" ! -name "stats.json" | wc -l)
```

| Count | Status |
|---|---|
| 0–100 | Normal |
| 101–200 | Warning — possible tracker file leak (TTL not pruning?) |
| >200 | Critical — investigate immediately |

### 2. Oldest open tracker file

```bash
OLDEST=$(find "$TRACKER_DIR" -name "*.json" ! -name "stats.json" -exec jq -r 'select(.status != "resolved") | .created_at // empty' {} \; | sort | head -1)
```

| Age | Status |
|---|---|
| <14 days | Normal (within TTL) |
| >14 days | Warning — TTL pruning may be broken |

### 3. Follow-ups sent in last 24h

Read from `stats.json`:

```bash
STATS="$TRACKER_DIR/stats.json"
TODAY=$(date -u +%Y-%m-%d)
if [ -f "$STATS" ] && [ "$(jq -r .date "$STATS")" = "$TODAY" ]; then
  TOTAL=$(jq '.completions_sent + .nudges_sent + .closures_sent' "$STATS")
fi
```

| Follow-ups | Status |
|---|---|
| 0–20 | Normal |
| 21–50 | Warning — high volume, may indicate runaway loop |
| >50 | Critical — likely runaway, check cron and Claude invocations |

### 4. Last successful tick

Check the thread-tracker log for most recent tick summary:

```bash
LAST_TICK=$(grep '"event":"tick_summary"' /var/log/slam-bot/thread-tracker.log | tail -1 | jq -r '.timestamp')
```

| Age of last tick | Status |
|---|---|
| <90 min | Normal (cron runs every 30 min) |
| 90 min – 3h | Warning — cron may have missed cycles |
| >3h | Critical — cron likely broken |

## Stats File Format

`stats.json` is reset daily and tracks:

```json
{
  "date": "2026-04-11",
  "completions_sent": 3,
  "nudges_sent": 1,
  "closures_sent": 0,
  "threads_tracked": 12,
  "threads_resolved": 5,
  "threads_pruned": 2,
  "slack_api_calls": 15,
  "ticks_run": 48
}
```

## Integration with Health Check Workspace

Add a "Thread Tracker" section to the health report. Include:
- Tracker file count + warning level
- Oldest open tracker age + warning level
- 24h follow-up volume + warning level
- Last tick timestamp + warning level
- Any anomalies from `stats.json` (e.g., 0 ticks today = cron not running)
