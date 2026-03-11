---
created: 2026-03-11
updated: 2026-03-11
status: living
---

# Meet Without Fear Documentation

Start here to find what you need.

## Quick Navigation

### For understanding the product
- [MVP Planning](mvp-planning/index.md) -- Product specs, stages, wireframes, mechanisms

### For understanding the codebase
- [Architecture](architecture/index.md) -- System architecture, tech stack, conventions, integrations, testing patterns
- [Backend](backend/index.md) -- Prompting architecture, caching strategy, reconciler flow
- [Diagrams](diagrams/index.md) -- State diagrams, user flow diagrams

### For working on the codebase
- [E2E Testing](e2e-testing/index.md) -- Test architecture and audit results
- [Deployment](deployment/index.md) -- Deployment strategies and distribution options

### For planning work
- `.planning/` -- Active planning directory (not in docs/)
  - `.planning/codebase/` -- Codebase reference docs (architecture, stack, conventions)
  - `.planning/research/` -- Research and analysis documents
  - `.planning/designs/` -- Active design work
  - `.planning/phases/` -- Completed phase execution records

### For historical reference
- [Archive](archive/index.md) -- Completed plans, old specs, implementation records, one-time reports

## Key Entry Points by Task

| Task | Start here |
|------|------------|
| Understand the product | [MVP Planning](mvp-planning/index.md) |
| Backend changes | [Backend](backend/index.md) then [Architecture](architecture/backend-overview.md) |
| Mobile changes | [Architecture](architecture/structure.md) then `CLAUDE.md` State Management section |
| Database changes | [Architecture](architecture/backend-overview.md) then `backend/prisma/schema.prisma` |
| AI/Prompt changes | [Backend: Prompting](backend/prompting-architecture.md) then [Prompt Caching](backend/prompt-caching.md) |
| Reconciler changes | [Backend: Reconciler](backend/reconciler-flow.md) then [Diagrams](diagrams/reconciler-paths.md) |
| Write tests | [Architecture: Testing](architecture/testing.md) then [E2E Testing](e2e-testing/architecture.md) |
| Add integrations | [Architecture: Integrations](architecture/integrations.md) |
| Deploy/release | [Deployment](deployment/index.md) |
| Stage 2B / Redesign | `.planning/BACKEND_ARCHITECTURE_PROPOSAL.md` and `.planning/designs/SHARE-REDESIGN.md` |
| Stage 3 work | `.planning/STAGE3_INTEGRATION_PLAN.md` |
