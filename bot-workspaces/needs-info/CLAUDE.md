# Needs Info (L1)

Structured interview loop for vague or incomplete requests. Asks clarifying questions, polls for responses, and graduates the issue when enough context is gathered.

## Modes

The dispatcher always invokes this workspace at `entry_stage: 01-create-issue` because there is no per-issue stage state in the registry. Determine the actual current stage from the issue's bot comments before loading a stage CONTEXT.md:

- **No bot comment with `<!-- bot:needs-info-meta` metadata exists** → fresh issue, load `stages/01-create-issue/CONTEXT.md`.
- **A bot comment with `<!-- bot:needs-info-meta` metadata exists** → re-entry, load `stages/02-interview/CONTEXT.md` directly. Do NOT exit early expecting a "next tick" to handle stage 02 — the next tick will re-enter at stage 01 again, producing an infinite re-dispatch loop (every 30 min, while `bot:needs-info` carries `keep_label: true`).

The `waiting-human-${ISSUE_NUMBER}.txt` marker file in the claims dir is the only signal that gates re-dispatch. Whichever stage runs MUST leave that marker present on every exit path that does not graduate or close the issue.

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
