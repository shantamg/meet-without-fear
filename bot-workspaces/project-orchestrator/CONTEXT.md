# Project Orchestrator — Workspace Context

## Purpose

End-to-end execution of multi-issue plans. Takes a parent issue with sub-issues, creates a milestone branch, manages the dependency graph, dispatches sub-issue builds, reviews/merges PRs, and produces a final milestone-to-main PR when all work is complete.

Manages the full lifecycle of milestone-driven plans.

## Stage Pointers

- `stages/01-initialize/CONTEXT.md` — Parse parent issue, create milestone branch, emit plan.json
- `stages/02-resolve-dependencies/CONTEXT.md` — Build dependency DAG, label first wave for dispatch
- `stages/03-monitor/CONTEXT.md` — Tick loop: promote, review, merge, spawn, notify
- `stages/04-finalize/CONTEXT.md` — Create milestone-to-main PR, write summary

## Shared Resources Used

- `shared/dependency-parser.md` — Parsing blocked-by and dependency metadata
- `shared/review-conventions.md` — PR quality-check criteria for milestone branches
- `shared/milestone-conventions.md` — Branch naming, PR format, merge strategy
- `shared/github/create-issue.md` — Issue cross-referencing
- `shared/skills/pr.md` — PR creation workflow

## Key Conventions

- Milestone branches: `milestone/{plan-name}`
- Feature branches off milestone: `feat/{description}-{issue-number}`
- PRs target the milestone branch, NOT main
- Quality check + merge (no formal review needed for milestone PRs)
- Final milestone-to-main PR requires human review
- Label flow: `blocked` -> `bot:{workspace}` -> `bot:pr` -> closed
- Parent issue label: `bot:project-orchestrator` (removed on finalization)
