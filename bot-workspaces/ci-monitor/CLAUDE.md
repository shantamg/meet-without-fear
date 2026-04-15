# CI Monitor Workspace (L1)

Monitor PR CI checks, fix failures automatically, and merge when green. Runs autonomously in a loop — NEVER prompt for user input.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/tick/CONTEXT.md` | Always | Stage contract |
| `shared/references/github-ops.md` | Always | PR patterns |

## What NOT to Load

| Resource | Why |
|---|---|
| `shared/diagnostics/` | CI issues diagnosed from check logs, not production |
| `shared/slack/` | CI monitor communicates via GitHub |
| `docs/` | Only load if fixing architecture-related failures |
| Other workspaces | Irrelevant context |
