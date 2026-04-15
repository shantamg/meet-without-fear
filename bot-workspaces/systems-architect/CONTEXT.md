# Systems Architect — Workspace Context

## Purpose

Run periodic architectural reviews to ensure the codebase stays true to formalized architecture patterns. Detects drift such as new microservice patterns, protocol exceptions, unauthorized infrastructure, and convention violations before they compound.

## Stage Pointers

- `stages/01-scan/CONTEXT.md` — Parallel specialist agents audit architecture domains
- `stages/02-report/CONTEXT.md` — Compile findings, create issues, post Slack report

## Shared Resources Used

- `shared/github/create-issue.md` — Issue creation for architectural violations
- `shared/slack/slack-post.md` — Report posting

## Key Docs to Read First

- `docs/architecture/system-overview.md`
- `docs/architecture/services.md`
- `docs/architecture/data-model.md`
- `CLAUDE.md` (Architecture principles section)
