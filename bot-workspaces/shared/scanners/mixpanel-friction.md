# Mixpanel User Friction Scanner

Detect user friction patterns from Mixpanel data that warrant investigation or improvement.

## Prerequisites

- Load `shared/references/credentials.md` for Mixpanel API access
- Load `shared/diagnostics/check-mixpanel.md` for query patterns

## Process

### 1. Export recent events

```bash
# Export last 24h of events
curl -s --user "$MIXPANEL_USER:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=3998202&from_date=$(date -d '1 day ago' +%Y-%m-%d)&to_date=$(date +%Y-%m-%d)"
```

### 2. Analyze recording funnel

Track the recording flow: `recording_started` -> `recording_stopped` -> `recording_uploaded` -> `recording_processed`

- Calculate conversion rates between each step
- Compare to 7-day rolling average
- Flag steps with >20% drop from average as friction points

### 3. Detect feature abandonment

Look for patterns where users:
- Start a flow but don't complete it (e.g., start recording setup but never record)
- Visit a screen repeatedly but take no action
- Trigger errors or retry events (indicates confusion or bugs)

### 4. Detect usage anomalies

Compare today's metrics to 7-day averages:
- Total events (flag if <50% of average)
- Active users (flag if <50% of average)
- Key feature usage (flag if any feature drops >30%)

### 5. Rank by user impact

| Impact Level | Criteria | Autonomy Tier |
|---|---|---|
| Critical | Recording funnel broken (0 completions) | `proceed` |
| High | >50% funnel drop-off at a step | `proceed` |
| Medium | Feature abandonment >30% | `suggestion` |
| Low | Minor usage anomaly | `suggestion` |

## Output Format

```
## Mixpanel Friction Findings

**Status:** [clean | issues-found]
**Items found:** N

### Funnel Health
- recording_started -> recording_stopped: N% conversion (avg: N%)
- recording_stopped -> recording_uploaded: N% conversion (avg: N%)
- recording_uploaded -> recording_processed: N% conversion (avg: N%)

### Items
1. **[Friction point description]** — [severity: critical/high/medium/low]
   - Metric: [specific numbers]
   - Baseline: [7-day average]
   - User impact: [N users affected]
   - Suggested action: [investigate UX | check backend | create issue]
   - Autonomy tier: [proceed | proceed | suggestion]
```
