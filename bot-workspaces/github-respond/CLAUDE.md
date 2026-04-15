# GitHub Respond Workspace (L1)

Respond to GitHub PR comments, mentions, and review requests.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/github-ops.md` | Always | PR comment reply patterns |
| `CLAUDE.md` | When making code changes | Docs routing, architecture |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Not needed for PR responses |
| `shared/slack/` | Responses go to GitHub, not Slack |
| Other workspaces | Irrelevant context |
| Full source tree | Load only files relevant to the PR diff |

## Stage Selection

| Trigger | Stage |
|---|---|
| PR comment or mention | `stages/respond/` |
| Review request | `stages/review/` |

## Safety

- Never force-push to someone else's branch
- If change is complex or ambiguous, ask for clarification
- Keep replies concise and professional
