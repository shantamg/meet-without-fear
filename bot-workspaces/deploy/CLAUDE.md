# Deploy Workspace (L1)

Prepare a deployment build with AI-generated changelog.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/prepare/CONTEXT.md` | Always | Stage contract |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | Deploy prep reads git history, not production |
| `shared/slack/` | No Slack posting needed |
| `shared/github/` | No issue creation |
| `docs/` | Not needed for changelog generation |
| Other workspaces | Irrelevant context |
