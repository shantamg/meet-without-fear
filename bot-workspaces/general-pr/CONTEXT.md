# General PR — Workspace Context

## Purpose

Execute a GitHub issue end-to-end: read it, implement the requested changes, and open a PR. Designed for issues that are already well-defined and need no triage or investigation — just implementation.

## Stage Pointers

- `stages/01-implement/CONTEXT.md` — Read issue, find relevant docs/code, implement, test
- `stages/02-pr/CONTEXT.md` — Create branch, commit, push, open PR with issue linking

## Shared Resources Used

- `shared/skills/pr.md` — PR creation format and conventions
- `shared/references/github-ops.md` — GitHub label and linking patterns

## Key Conventions

- Branch naming: `feat/<short-description>-<issue-number>`
- Issue linking: always use `Related to #N` (never `Fixes #N`) — all issues stay open for human verification (see `shared/skills/pr.md`)
- PR body must include Provenance section
- Always request reviewers: `shantamg`
- Use CLAUDE.md docs routing table to find relevant documentation before implementing
