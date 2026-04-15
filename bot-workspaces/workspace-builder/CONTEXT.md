# Workspace Builder — Workspace Context

## Purpose

Self-referential workspace that creates, modifies, and audits other ICM workspaces. Takes an issue describing a workflow need and produces a fully scaffolded, registered, and validated workspace.

## Stage Pointers

- `stages/01-discover/CONTEXT.md` — Read issue, identify purpose and requirements
- `stages/02-design/CONTEXT.md` — Design stage breakdown and routing tables
- `stages/03-scaffold/CONTEXT.md` — Create directory structure and all files
- `stages/04-register/CONTEXT.md` — Register label, update routing table
- `stages/05-validate/CONTEXT.md` — Convention compliance and routing verification

## Shared Resources Used

- `shared/conventions.md` — ICM conventions (enforced during scaffolding)
- `shared/templates/` — Blank CLAUDE.md, CONTEXT.md, stage contract templates
- `references/existing-workspaces.md` — Summary of all current workspaces
- Root `label-registry.json` — Canonical label-to-workspace mapping
- Root `CLAUDE.md` — Root routing table (updated during registration)

## Key Conventions

- Workspace names are lowercase, hyphenated (e.g., `sentry-alerts`)
- Labels follow `bot:<workspace-name>` pattern
- Every workspace must have CLAUDE.md (L1) and CONTEXT.md
- Every stage must have CONTEXT.md with Input/Process/Output contract
- Stage CONTEXT.md files must be under 80 lines
- Reference files must be under 200 lines
