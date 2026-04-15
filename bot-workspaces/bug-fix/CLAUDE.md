# Bug Fix Workspace (L1)

Investigate and fix bugs, security issues, and bot-pr implementation requests. Six-stage pipeline with worktree isolation per fix.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `references/branch-naming.md` | Stage 01, 03 | Branch and PR title conventions |
| `references/test-patterns.md` | Stage 04, 05 | Test framework patterns |
| `references/pr-conventions.md` | Stage 06 | PR body format, reviewers, issue linking |
| `shared/references/credentials.md` | Stage 02 | DB/API access for investigation |
| `shared/diagnostics/*.md` | Stage 02 | Investigation tools (Sentry, DB, Mixpanel, logs) |
| `shared/skills/pr.md` | Stage 06 | PR creation workflow |
| `CLAUDE.md` | Stage 02, 03 | Docs routing table, architecture principles |
| `shared/slack/slack-post.md` | Stage 02 (standalone) | Slack thread reply after investigation |
| `shared/references/slack-format.md` | Stage 02 (standalone) | Slack mrkdwn formatting rules |
| `repo root .claude/config/services.json` | Stage 02 (standalone) | Channel ID lookup for Slack reply |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` wholesale | Only load specific docs identified during Stage 02 investigation |
| `shared/slack/` | Not needed for pipeline mode (stages 01-06 communicate via PR). Loaded only for standalone `bot:investigate` Slack follow-up |
| Other workspaces | Irrelevant context |
| Full source tree | Stage 02 identifies specific files; Stage 03 reads them |
| `shared/diagnostics/*` | Only needed in Stage 02 -- skip in later stages |

## Stage Progression

```
01-select ──┐
            ├─→ [sub-agent per issue, in worktree] ──→ 02-investigate
            │                                          03-plan
            │                                          04-implement
            │                                          05-verify
            │                                          06-pr
            └─→ [orchestrator collects reports] ──→ summary table
```

1. `01-select` — Fetch issues, filter untouched, classify, batch into sub-agents
2. `02-investigate` — Parallel diagnostics, read docs, identify root cause
3. `03-plan` — Design the fix, identify files, determine branch name
4. `04-implement` — Code changes + tests in worktree
5. `05-verify` — Run tests, type checks, push branch
6. `06-pr` — Create PR with issue linking, deregister WIP

## Orchestrator Rules

- Stage 01 runs as the orchestrator (single agent)
- Stages 02-06 run per issue in isolated sub-agents (`isolation: "worktree"`)
- Process issues in **batches of 3** concurrent sub-agents (EC2: t3.medium, 2 vCPU, 4GB RAM)
- Each sub-agent handles one issue end-to-end (Stages 02 through 06)
- PRs require human review -- no auto-merge
- Wait for a batch to complete before launching the next

## Shell Pre-Check

The shell script `scripts/ec2-bot/scripts/fix-bugs.sh` performs issue filtering *before* invoking Claude:
- Fetches `bug`, `security`, `bot-pr` issues from GitHub
- Filters to untouched issues (0 comments, 0 linked PRs)
- Passes only qualifying issue numbers to the agent prompt
- Performs post-session `bot-pr` label cleanup as a safety net

When invoked via the shell script, Stage 01 receives pre-filtered issue numbers. When invoked manually (e.g., `/fix-bugs`), Stage 01 performs the full filtering itself.

## Branch and PR Naming

| Label | Branch | PR Title |
|---|---|---|
| `bug` | `fix/<desc>-<issue>` | `fix(<area>): <desc> (#<issue>)` |
| `security` | `fix/security-<desc>-<issue>` | `fix(security): <desc> (#<issue>)` |
| `bot-pr` | `feat/<desc>-<issue>` | `feat(<area>): <desc> (#<issue>)` |
