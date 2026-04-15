# Health Check Workspace (L1)

Daily production health audit. Cross-references Mixpanel activity, Render logs, and Sentry errors.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/audit/CONTEXT.md` | Always | Stage contract |
| `shared/references/credentials.md` | Always | API access |
| `shared/diagnostics/check-mixpanel.md` | Always | Activity analysis |
| `shared/diagnostics/check-sentry.md` | Always | Error tracking |
| `shared/diagnostics/render-logs.md` | Always | Log analysis |
| `shared/slack/slack-post.md` | Always | Post to #health-check |
| `shared/references/github-ops.md` | Always | Duplicate check, auto-creation thresholds |
| `shared/diagnostics/check-thread-tracker.md` | Always | Thread tracker health checks |
| `shared/github/create-issue.md` | When issues found | Issue creation |

## Stage Progression

1. `audit` — Cross-reference Mixpanel, Render logs, and Sentry errors; post health report

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Only load if investigating a specific error |
| `shared/skills/pr.md` | Health checks don't produce code changes |
| Other workspaces | Irrelevant context |
