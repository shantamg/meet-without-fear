# Bot Workspaces — Root Router (L0)

Route each bot job to its workspace and entry stage. The workspace `CLAUDE.md` (L1) tells you what to load; the stage `CONTEXT.md` (L2) tells you what to do.

## Routing Table

| Job Slug | Workspace | Entry Stage |
|---|---|---|
| `dm-reply` | `slack-triage/` | `1-fetch-and-classify` |
| `slam-bot-reply` | `slack-triage/` | `1-fetch-and-classify` |
| `respond-github` | `github-respond/` | `respond` |
| `review-pr` | `github-respond/` | `review` |
| `fix-bugs` | `bug-fix/` | `01-select` |
| `investigate` | `bug-fix/` | `02-investigate` |
| `health-check` | `health-check/` | `audit` |
| `bot:expert-review` | `expert-review/` | `01-initialize` |
| `check-pr` / `check-pr-tick` | `ci-monitor/` | `tick` |
| `general-pr` | `general-pr/` | `01-implement` |
| `pr-reviewer` | `pr-reviewer/` | `01-scan` |
| `review-impl` | `pr-reviewer/` | `review-impl` |

## What NOT to Load (root level)

| Resource | Why |
|---|---|
| Repo source code | Loaded only by stages that need it |
| `docs/` | Loaded only by relevant workspaces |
| Other workspace folders | Each invocation sees only its own workspace |

## How to Use

1. Match the incoming job slug to the routing table above
2. `cd` into the workspace directory
3. Read the workspace `CLAUDE.md` (L1) for load/skip tables
4. Read the entry stage `CONTEXT.md` (L2) for the Input/Process/Output contract
5. Execute the stage contract

## Shared Utilities

Cross-workspace resources live in `shared/`:

| Directory | Contents |
|---|---|
| `shared/references/` | Credential patterns, formatting rules, GitHub conventions |
| `shared/diagnostics/` | Database, Sentry, Mixpanel, pipeline, Render log utilities |
| `shared/github/` | Issue creation, image attachment |
| `shared/slack/` | Message posting, file upload |
| `shared/skills/` | PR creation, voice messages |

Workspaces reference these via their L1 "What to Load" tables — never load all of `shared/` at once.
