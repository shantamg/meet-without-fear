# Milestone Builder

## Purpose

Execute structured milestone plans by creating a milestone branch, dispatching build agents wave by wave based on dependency ordering, reviewing and merging PRs to the milestone branch, and producing a final milestone→main PR for human review.

Replaces the execution stages (03-monitor, 04-finalize) of the `project-orchestrator` workspace.

## Stage Pointers

- `stages/01-initialize/CONTEXT.md` — Parse parent issue, create milestone branch, validate sub-issue structure
- `stages/02-monitor/CONTEXT.md` — Tick loop: promote dependencies, review PRs, merge, dispatch builds
- `stages/03-finalize/CONTEXT.md` — Create milestone→main PR, tag humans, clean up labels

## Shared Resources Used

- `shared/milestone-conventions.md` — Branch naming, PR format, merge strategy, label flow
- `shared/dependency-parser.md` — How to parse `blocked-by` metadata from issues
- `shared/review-conventions.md` — Quality check criteria for reviewing PRs on milestone branch

## Key Conventions

- **Milestone branch**: `milestone/{plan-name}` off `main`
- **Feature branches**: `feat/{description}-{issue-number}` off milestone branch
- **Label flow**: `blocked` → `bot:{workspace}` → `bot:pr` → closed
- **Merge strategy**: squash merge features→milestone, merge commit milestone→main
- **Human review**: required for milestone→main PR only
