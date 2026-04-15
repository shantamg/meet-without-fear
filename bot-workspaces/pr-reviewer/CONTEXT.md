# PR Reviewer — Workspace Context

## Purpose

Autonomously manage the full lifecycle of bot-created PRs: detect conflicts, rebase, quality-review, fix issues, and merge (or tag humans for main). Eliminates manual PR babysitting.

## Stage Pointers

- `stages/01-scan/CONTEXT.md` — Find and classify all open bot PRs
- `stages/02-rebase/CONTEXT.md` — Rebase conflicting PRs onto target branch
- `stages/03-review/CONTEXT.md` — Quality-check diff and post review comment
- `stages/04-fix/CONTEXT.md` — Fix review feedback or failing checks
- `stages/05-merge-or-tag/CONTEXT.md` — Merge or tag humans for final approval

## Shared Resources Used

- `shared/references/github-ops.md` — GitHub CLI patterns for PR operations

## Key Conventions

- Fully autonomous — never prompt for user input
- Process PRs one at a time through the pipeline
- Never force-merge PRs targeting `main` — always tag @shantamg @mengerink
- Max 3 fix attempts per PR before requesting human help
- Skip PRs with `bot:ci-monitor` label (handled by ci-monitor workspace)
