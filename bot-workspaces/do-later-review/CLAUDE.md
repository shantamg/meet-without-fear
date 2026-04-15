# Do-Later Review (L1)

Monthly re-triage of issues labeled `do-later`. Evaluates whether context has changed and recommends: reopen, keep deferred, or close as wontfix.

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/evaluation-criteria.md` | Stage 02 | Criteria for reopen/keep/close decisions |
| `shared/references/github-ops.md` (root) | Stage 03 | Label manipulation patterns |
| `shared/slack/slack-post.md` (root) | Stage 03 | Slack summary posting |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Only git log is used, not source reading |
| `docs/` | Not auditing documentation |
| `shared/diagnostics/` | No Sentry/DB/Mixpanel diagnostics needed |
| Other workspace folders | Each invocation sees only its own workspace |

## Stage Progression

1. `01-scan` -- Fetch all `do-later` issues, group by category, sort by age
2. `02-evaluate` -- For each issue, check context changes and recommend action
3. `03-report` -- Post Slack summary with recommendations, apply label changes

## Orchestrator Rules

- One full pass per invocation (all do-later issues in a single run)
- Cron-triggered: no label swap needed at completion
- If zero do-later issues found, post a short "nothing to review" summary and exit
