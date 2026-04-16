# Docs Audit — Workspace Context

## Purpose

Detect documentation drift by comparing docs against code. Two modes: incremental (git-aware, fast) and full (brute-force, thorough).

## Stage Pointers

- `stages/incremental/CONTEXT.md` — Git-history-aware targeted audit
- `stages/full/CONTEXT.md` — Complete brute-force audit of all living docs

## Shared Resources Used

- `shared/slack/slack-post.md` — Summary to #bot-ops
- `shared/skills/pr.md` — PR for doc updates

## Code-to-Doc Mapping

| Code area | Docs to check |
|---|---|
| `apps/identity/`, `apps/recording/`, etc. | `docs/architecture/services.md` |
| `packages/prisma/` | `docs/architecture/data-model.md` |
| `apps/insights/`, health scoring | `docs/architecture/health-scoring.md`, `docs/science/` |
| `apps/mobile/` | `docs/mobile/` |
| `apps/workbench/` | `docs/workbench/` |
| `render.yaml`, `vercel.json`, `.github/workflows/` | `docs/infrastructure/` |
| `packages/shared/` | Any doc referencing shared types |
| `.claude/commands/`, `CLAUDE.md` | `docs/processes/`, `docs/guides/` |
