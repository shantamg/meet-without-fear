# Release Summary (L1)

Generate an AI-powered release summary from a deploy notification issue and post it to the `#releases` Slack channel. Auto-close the issue when done.

## Modes

| Mode | Trigger | Entry Stage |
|---|---|---|
| Summarize release | Issue labeled `bot:release-summary` (created by `release-notify.yml` GitHub Action) | `summarize` |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/summarize/CONTEXT.md` | Always | Stage contract |
| `shared/slack/slack-post.md` | Always | Slack posting conventions |
| `shared/references/slack-format.md` | Always | Slack mrkdwn formatting rules |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` | Not needed — summarizing git history, not architecture |
| repo root source code | Not modifying code — reading PR/commit metadata only |
| `shared/diagnostics/` | No diagnostic work |
| `shared/github/` | Not creating issues — only closing the trigger issue |
| `shared/skills/pr.md` | Not creating PRs |
| Other workspaces | Irrelevant context |

## Stage Progression

1. `summarize` — Read issue, gather PR details, generate summary, post to Slack, close issue

## Orchestrator Rules

- One issue per invocation
- Always auto-close the issue after posting to Slack
- Never post sensitive data (tokens, env vars, connection strings)
- Use channel ID from `services.json`, not hardcoded values
