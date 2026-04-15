# Needs Info (L1)

Structured interview loop for vague or incomplete requests. Asks clarifying questions, polls for responses, and graduates the issue when enough context is gathered.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/question-templates.md` | Stage 02 | Clarifying question templates by category |
| `shared/graduation-criteria.md` | Stages 02-03 | Determine when enough info is gathered |
| `shared/slack/slack-post.md` | Stage 02 (24h nudge) | Slack thread reply for nudge |
| `shared/references/slack-format.md` | Stage 02 (24h nudge) | Slack mrkdwn formatting rules |
| `.claude/config/services.json` | Stage 02 (24h nudge) | Channel ID lookup |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Workspace operates on issue metadata, not app code |
| `docs/` | Not needed for interview loop |
| `shared/diagnostics/` | No diagnostic work involved |
| Other workspace stage files | Only this workspace's stages are relevant |

## Stage Progression

1. `01-create-issue` — Validate issue exists with correct content, post initial interview comment
2. `02-interview` — Read user responses, ask follow-ups, nudge after 24h, mark stale after 72h
3. `03-graduate` — Summarize gathered info, swap label to downstream workspace

## Orchestrator Rules

- Re-entry: stage 02 re-enters on each dispatcher tick until graduation or stale
- State tracking: HTML comment metadata in issue comments (`<!-- bot:needs-info-meta: {...} -->`)
- One issue per invocation (no batching)
