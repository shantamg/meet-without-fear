# Branch and PR Naming Conventions

## Branch Format

| Issue Label | Branch Pattern | Example |
|---|---|---|
| `bug` | `fix/<short-description>-<issue-number>` | `fix/health-score-null-crash-423` |
| `security` | `fix/security-<short-description>-<issue-number>` | `fix/security-auth-bypass-401` |
| `bot-pr` | `feat/<short-description>-<issue-number>` | `feat/add-export-button-445` |

## PR Title Format

| Issue Label | Title Pattern | Example |
|---|---|---|
| `bug` | `fix(<area>): <description> (#<issue-number>)` | `fix(health): handle null scores in dashboard (#423)` |
| `security` | `fix(security): <description> (#<issue-number>)` | `fix(security): validate auth tokens on WebSocket (#401)` |
| `bot-pr` | `feat(<area>): <description> (#<issue-number>)` | `feat(workbench): add CSV export to health page (#445)` |

## Area Names

Use the service or app name as the area:

| Code Location | Area |
|---|---|
| `apps/gateway/src/services/identity/` | `identity` |
| `apps/gateway/src/services/recording/` | `recording` |
| `apps/gateway/src/services/insights/` | `insights` |
| `apps/gateway/src/services/coaching/` | `coaching` |
| `apps/gateway/src/services/orchestrator/` | `orchestrator` |
| `apps/gateway/src/services/social/` | `social` |
| `apps/gateway/src/services/analytics/` | `analytics` |
| `apps/gateway/src/services/device/` | `device` |
| `apps/gateway/src/services/push/` | `push` |
| `apps/mobile/` | `mobile` |
| `apps/workbench/` | `workbench` |
| `packages/shared/` | `shared` |
| `packages/prisma/` | `data` |
| Cross-cutting | `core` |

## Short Description Rules

- Use lowercase kebab-case: `fix-null-score`, not `Fix_Null_Score`
- Max 4-5 words: `health-score-null-crash`, not `fix-the-issue-where-health-scores-crash-when-null`
- Describe the fix, not the symptom: `handle-null-scores` not `dashboard-broken`
