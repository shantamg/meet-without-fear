# Verify Workspace (L1)

Post-implementation verification workspace. Runs automated checks against a PR's changes and posts a verification report on the issue. Triggered by `bot:verify` label after a PR has been created.

## Modes

Determine the current stage from the context provided by the dispatcher. If invoked fresh on a labeled issue, start at `01-check`.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/references/github-ops.md` | Stage 01, 03, 04 | Issue/PR operations, label management |
| `shared/diagnostics/check-sentry.md` | Stage 02 | Post-deploy Sentry error check |
| `shared/diagnostics/render-status.md` | Stage 02 | Staging deployment status |
| `shared/references/credentials.md` | Stage 02 | Sentry/Render API access |
| `CLAUDE.md` | Stage 01 | Docs routing, test conventions |

## What NOT to Load

| Resource | Why |
|---|---|
| `docs/` wholesale | Only load specific docs identified during Stage 01 |
| `shared/slack/` | Output goes to GitHub, not Slack |
| `shared/skills/pr.md` | This workspace verifies PRs, it does not create them |
| Other workspaces | Irrelevant context |
| Full source tree | Stage 01 identifies affected packages; Stage 02 tests only those |

## Stage Progression

1. `01-check` -- Read issue, spec, and linked PR. Determine verification strategy.
2. `02-verify` -- Execute automated verification (tests, types, build, Sentry).
3. `03-report` -- Post verification report on the issue with structured results.
4. `04-close` -- Label management based on result (PASS/FAIL routing).

## Orchestrator Rules

- One issue per invocation (no batching)
- Stages run sequentially (01 -> 02 -> 03 -> 04)
- The workspace operates on the PR branch -- check it out before running tests
- If Stage 02 finds failures, still proceed to Stage 03 (report the failures)
- Stage 04 determines next action based on the report result
- Remove `bot:verify` label after Stage 04 completes (keep_label: false)
