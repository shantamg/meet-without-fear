# Security Audit Workspace (L1)

Comprehensive security posture assessment using specialized parallel agents covering 12 audit domains.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/credentials.md` | Stage 1 | API access for scanning |
| `shared/github/create-issue.md` | Stage 2 | Issue creation for findings |
| `shared/slack/slack-post.md` | Stage 2 | Report to #bot-ops (`$BOT_OPS_CHANNEL_ID`) |
| `docs/architecture/system-overview.md` | Stage 1 | System context |
| `docs/infrastructure/production-access.md` | Stage 1 | Access controls |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Security audit has its own scanning approach |
| `shared/skills/pr.md` | Audit reports, doesn't produce code changes |
| Other workspaces | Irrelevant context |
| Full source tree | Agents load specific files per domain |

## Stage Progression

1. `1-scan` — 7 parallel specialist agents across security domains
2. `2-report` — Compile, prioritize, create issues, post to Slack
