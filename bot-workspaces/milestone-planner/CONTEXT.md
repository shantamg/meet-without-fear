# Milestone Planner — Workspace Context

## Purpose

Takes unstructured input (a brainstorm issue, a pile of related issues, or a vague feature idea) and produces a structured milestone plan: parent issue with sub-issues, dependency graph, labels, and sequencing. This is the *thinking* part of milestone execution — the builder handles the *doing*.

## Stage Pointers

- `stages/01-gather/CONTEXT.md` — Read input issue, resolve references, map full scope
- `stages/02-decompose/CONTEXT.md` — Break scope into discrete sub-issues with deliverables
- `stages/03-sequence/CONTEXT.md` — Build dependency DAG, identify parallel waves
- `stages/04-publish/CONTEXT.md` — Create sub-issues on GitHub, update parent with plan

## Shared Resources Used

- `shared/decomposition-guide.md` — How to break work into right-sized issues
- `shared/dependency-patterns.md` — Common dependency patterns and how to express them
- `shared/references/github-ops.md` — GitHub label and issue conventions
- `shared/github/create-issue.md` — Issue creation patterns

## Key Conventions

- Parent issue is the one labeled `bot:milestone-planner`
- Sub-issues use `<!-- blocked-by: X,Y -->` HTML comments for dependency tracking
- Wave 1 issues get their workspace labels (e.g., `bot:bug-fix`, `bot:workspace-builder`)
- Later-wave issues get `blocked` label until unblocked
- On completion, `bot:milestone-planner` label is removed — a human reviews the plan and adds `bot:milestone-builder` when ready to build
