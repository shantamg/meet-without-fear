# Do-Later Review -- Workspace Context

## Purpose

Re-triage issues labeled `do-later` on a monthly cadence. For each deferred issue, evaluate whether context has changed (new code, closed related issues, shifted priorities) and recommend: reopen and act, keep deferred, or close as wontfix.

## Stage Pointers

- `stages/01-scan/CONTEXT.md` -- Fetch and categorize all do-later issues
- `stages/02-evaluate/CONTEXT.md` -- Evaluate each issue against changed context
- `stages/03-report/CONTEXT.md` -- Post summary to Slack and apply label/status changes

## Shared Resources Used

- `shared/evaluation-criteria.md` -- Decision framework for reopen/keep/close
- `shared/references/github-ops.md` (root) -- GitHub label operations
- `shared/slack/slack-post.md` (root) -- Slack message posting

## Key Conventions

- Trigger: cron (monthly, 1st of month)
- No branch or PR created -- this workspace reads and triages, does not modify code
- Recommendations that reopen issues swap `do-later` label for appropriate `bot:*` label
- All actions are logged in the Slack summary for audit trail
