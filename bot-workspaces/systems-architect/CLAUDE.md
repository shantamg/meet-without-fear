# Systems Architect (L1)

Periodic architectural review ensuring the codebase stays true to formalized architecture patterns, catching drift like unauthorized microservice patterns, protocol exceptions, or infrastructure changes.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `docs/architecture/system-overview.md` | Stage 01 | Canonical architecture reference |
| `docs/architecture/services.md` | Stage 01 | Service layer conventions |
| `docs/architecture/data-model.md` | Stage 01 | Data model conventions |
| `CLAUDE.md` | Stage 01 | Architecture principles and conventions |
| `shared/github/create-issue.md` | Stage 02 | Issue creation for findings |
| `shared/slack/slack-post.md` | Stage 02 | Report to Slack |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Architecture audit uses code analysis, not runtime diagnostics |
| `shared/skills/pr.md` | Audit reports, doesn't produce code changes |
| Other workspaces | Irrelevant context |
| `docs/science/` | Science docs not relevant to architectural review |

## Stage Progression

1. `01-scan` — Parallel specialist agents audit architectural domains against formalized patterns
2. `02-report` — Compile findings, create issues for violations, post summary to Slack
