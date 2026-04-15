# Proactive Opportunity Scanners

Shared scanning modules that detect actionable opportunities across production data, issue trackers, and code health signals. Used by `daily-strategy/` and `health-check/` workspaces.

## Available Scanners

| Scanner | File | Sources | Output |
|---|---|---|---|
| Sentry errors | `sentry-patterns.md` | Sentry API | Recurring/new errors with severity and suggested actions |
| Mixpanel friction | `mixpanel-friction.md` | Mixpanel Export API | Funnel drop-offs, feature abandonment, usage anomalies |
| Idle issues | `idle-issues.md` | GitHub Issues API | High-priority issues with no activity, unblocked work |
| Code health | `code-health.md` | Git history, test output | Test coverage drops, TODO/FIXME debt, vulnerability signals |

## Usage

Each scanner is a self-contained sub-agent instruction set. The calling workspace runs them as parallel sub-agents and collects structured output.

```
# In a workspace stage:
# "Launch sub-agent with shared/scanners/sentry-patterns.md"
# "Launch sub-agent with shared/scanners/idle-issues.md"
# etc.
```

## Output Format

Each scanner returns a structured findings block:

```
## [Scanner Name] Findings

**Status:** [clean | issues-found | error]
**Items found:** N

### Items
1. **[Title]** — [severity: low/medium/high/critical]
   - Description: ...
   - Suggested action: ...
   - Autonomy tier: [proceed | proceed | suggestion]
```

The `autonomy tier` maps to the daily-strategy classification:
- `proceed` — bot can fix this autonomously (bugs, known patterns)
- `proceed` — bot will start unless objected (unblocked work, follow-ups)
- `suggestion` — needs human approval (new features, large refactors)
