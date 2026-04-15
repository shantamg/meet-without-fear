# CI Monitor — Workspace Context

## Purpose

Autonomously monitor PR CI checks, diagnose and fix failures, merge when all checks pass. Runs in a 5-minute loop via `/loop 5m`.

## Stage Pointers

- `stages/tick/CONTEXT.md` — Single iteration of the check loop

## Key Conventions

- Fully autonomous — NEVER prompt for user input
- Merge with `--squash --delete-branch --admin`
- Classify failures: FIXABLE, NEEDS HUMAN, UNFIXABLE
- Stop loop on: merge, close, draft, needs human, unfixable
- Continue loop on: pending checks, just pushed a fix
