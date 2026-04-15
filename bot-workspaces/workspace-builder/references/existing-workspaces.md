# Existing Workspaces

Summary of all current workspaces in `bot-workspaces/`. Auto-generated reference for the discover stage.

## Workspace Inventory

| Workspace | Label | Trigger | Entry Stage | Purpose |
|---|---|---|---|---|
| `brainstorm/` | `bot:brainstorm` | label | `1-digest` | Digest brainstorm transcripts into GitHub issues |
| `bug-fix/` | `bot:bug-fix` | cron | `01-select` | Investigate and fix bugs with worktree isolation |
| `ci-monitor/` | `bot:ci-monitor` | label | `tick` | Monitor CI status and report failures |
| `daily-strategy/` | `bot:daily-strategy` | cron | `1-gather` | Proactive daily briefing with autonomy tiers |
| `deploy/` | `bot:deploy` | manual | `prepare` | Prepare and execute deployments |
| `do-later-review/` | `bot:do-later-review` | cron | `01-scan` | Monthly re-triage of deferred do-later issues |
| `docs-audit/` | `bot:docs-audit` | cron | `incremental` | Audit documentation for accuracy |
| `expert-review/` | `bot:expert-review` | label | `01-initialize` | Multi-expert issue analysis with devil's advocate pushback |
| `general-pr/` | `bot:pr` | label | `01-implement` | General-purpose issue-to-PR execution |
| `github-respond/` | `bot:github-respond` | webhook | `respond` | Respond to GitHub issues and PR comments |
| `health-check/` | `bot:health-check` | cron | `audit` | System health audits |
| `milestone-planner/` | `bot:milestone-planner` | label | `01-gather` | Turn brainstorms and issues into structured milestone plans |
| `needs-info/` | `bot:needs-info` | label | `01-create-issue` | Structured interview loop for vague requests |
| `milestone-builder/` | `bot:milestone-builder` | label | `01-initialize` | Execute structured milestone plans end-to-end |
| `project-orchestrator/` | `bot:project-orchestrator` | label | `01-initialize` | Orchestrate multi-issue milestone projects |
| `security-audit/` | `bot:security-audit` | cron | `1-scan` | Security vulnerability scanning |
| `slack-triage/` | `bot:slack-triage` | cron | `1-fetch-and-classify` | Triage Slack messages from #pmf1 |
| `stale-sweeper/` | `bot:stale-sweeper` | cron | `1-identify` | Identify and close stale issues/PRs |
| `systems-architect/` | `bot:systems-architect` | cron | `01-scan` | Periodic architectural review for pattern drift |
| `pr-reviewer/` | `bot:pr-reviewer` | cron | `01-scan` | Scan bot PRs, rebase, review, fix, merge or tag humans |
| `spec-builder/` | `bot:spec-builder` | label | `01-initialize` | Structured interview to convert ideas into buildable specs |
| `workspace-builder/` | `bot:workspace-builder` | label | `01-discover` | Create, modify, and audit workspaces |

## Common Patterns

### Trigger types in use
- **cron** (8): slack-triage, health-check, daily-strategy, stale-sweeper, security-audit, docs-audit, do-later-review, pr-reviewer
- **label** (7): brainstorm, expert-review, ci-monitor, general-pr, project-orchestrator, workspace-builder, bug-fix
- **webhook** (1): github-respond
- **manual** (1): deploy

### Stage naming conventions
- Numbered: `1-investigate`, `2-plan`, `3-implement`, `4-pr`
- Zero-padded: `01-discover`, `02-design` (workspace-builder uses this)
- Named: `audit`, `compile`, `iterate`, `tick`, `respond`, `review`

### Shared resources commonly used
- `shared/github/create-issue.md` — Most label/cron workspaces
- `shared/skills/pr.md` — Bug-fix, deploy
- `shared/diagnostics/*` — Bug-fix, health-check, security-audit
- `shared/references/github-ops.md` — Brainstorm, github-respond
- `shared/slack/slack-post.md` — Slack-triage, daily-strategy
