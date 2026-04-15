# Workspace Builder (L1)

Create, modify, and audit ICM workspaces. Self-referential: this workspace follows the same conventions it enforces on others.

## Modes

Determine the mode from the issue body:

| Mode | Trigger | Entry Stage |
|---|---|---|
| Create new workspace | Issue describes a new workspace need | `01-discover` |
| Modify existing workspace | Issue references an existing workspace by name | `01-discover` |
| Audit all workspaces | Issue labeled `bot:workspace-builder/audit` | `05-validate` (audit mode) |

## What to Load

| Resource | When | Why |
|---|---|---|
| `stages/{current}/CONTEXT.md` | Always | Current stage contract |
| `shared/conventions.md` | Stages 02-03 | Convention enforcement during design/scaffold |
| `shared/templates/*` | Stage 03 | Blank file templates for scaffolding |
| `references/existing-workspaces.md` | Stage 01 | Understand what already exists |
| `label-registry.json` (root) | Stages 01, 04 | Check existing labels, register new ones |
| `CLAUDE.md` (root) | Stage 04 | Update root routing table |
| `shared/references/github-ops.md` | Stage 04 | GitHub label creation patterns |
| `shared/skills/pr.md` | Stage 04 | PR creation if needed |

## What NOT to Load

| Resource | Why |
|---|---|
| repo root source code | Workspace builder operates on workspace files, not app code |
| `docs/` | Not needed for workspace scaffolding |
| `shared/diagnostics/` | No diagnostic work involved |
| `shared/slack/` | Output goes to GitHub, not Slack |
| Other workspace stage files | Only read workspace CLAUDE.md/CONTEXT.md for reference |

## Stage Progression

1. `01-discover` — Read issue, identify purpose, triggers, and stages needed
2. `02-design` — Design stage breakdown, routing tables, exclusion tables
3. `03-scaffold` — Create the actual workspace directory structure with all files
4. `04-register` — Add label to label-registry.json, create GitHub label, update root routing table
5. `05-validate` — Dry-run routing check, convention compliance scan

## Orchestrator Rules

- One workspace per invocation (no batching)
- New workspaces get a dedicated branch: `feat/ws-<workspace-name>`
- All scaffolded files must pass convention checks before registration
- Audit mode scans all workspaces in a single pass
