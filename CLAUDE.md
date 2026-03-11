# Meet Without Fear Development

## Development Practices

### Test-Driven Development

- Write tests first, then implementation
- Run `npm run test` in the relevant workspace before considering work complete
- Run `npm run check` to verify types before committing
- Backend tests run in silent mode by default; use `--verbose` flag to see console output when debugging

### Code Organization

- **Shared types in `shared/`** - All DTOs, contracts, and cross-workspace types
- **Small, testable functions** - Each function does one thing
- **Logic separate from views** - Mobile: hooks/services for logic, components for UI

### Verification Before Completion

Always run before considering a task done:

```bash
npm run check   # Type checking across all workspaces
npm run test    # Tests across all workspaces
```

### Git Workflow

- Commit and push often (small, focused commits)
- Each commit should pass check and test

### Database Migrations

- **Never use `prisma db push`** - Always create proper migrations
- Use `npx prisma migrate dev --name <description>` to create migrations

### Database Queries

To run ad-hoc Prisma queries, create a temp file in `backend/src/` that imports from `./lib/prisma` and run with `npx ts-node`.

## Documentation

### Doc Routing Table

When working on a task, consult the relevant docs first:

| Task Area | Primary Doc | Secondary |
|-----------|-------------|-----------|
| **Product design / stages** | `docs/mvp-planning/index.md` | `docs/mvp-planning/plans/stages/` |
| **Backend architecture** | `docs/architecture/backend-overview.md` | `docs/architecture/structure.md` |
| **Backend prompting / AI** | `docs/backend/prompting-architecture.md` | `docs/backend/prompt-caching.md` |
| **Reconciler / empathy** | `docs/backend/reconciler-flow.md` | `docs/diagrams/reconciler-paths.md` |
| **Mobile architecture** | `docs/architecture/structure.md` | |
| **Database / Prisma** | `docs/architecture/backend-overview.md` | `backend/prisma/schema.prisma` |
| **Testing** | `docs/architecture/testing.md` | `docs/e2e-testing/architecture.md` |
| **Integrations (Ably, Clerk, Bedrock)** | `docs/architecture/integrations.md` | |
| **Code conventions** | `docs/architecture/conventions.md` | |
| **Tech stack** | `docs/architecture/stack.md` | |
| **Deployment** | `docs/deployment/index.md` | |
| **Stage 2B / Redesign** | `.planning/BACKEND_ARCHITECTURE_PROPOSAL.md` | `.planning/designs/SHARE-REDESIGN.md` |
| **Stage 3 work** | `.planning/STAGE3_INTEGRATION_PLAN.md` | `.planning/STAGE3_UX_SYNTHESIS.md` |
| **Known concerns / tech debt** | `docs/architecture/concerns.md` | |
| **Historical plans/specs** | `docs/archive/index.md` | |

**Fallback**: If no route matches, check `docs/index.md` or search the codebase.

### Documentation Rules

- **Living docs** (`docs/` except `archive/`): Always reflect current state. Update when code changes.
- **Archive docs** (`docs/archive/`): Read-only. Never update.
- **Planning docs** (`.planning/`): Working documents. May be stale.

## State Management Architecture

The mobile app uses **Cache-First** (Single Source of Truth) via React Query.

### Rules

1. **If it's on screen, it's in cache** — Never use `useState`/`useRef` to bridge user actions to server responses. Derive UI state from cache.
2. **Optimistic updates via `onMutate`** — Write expected results to cache immediately, rollback in `onError`.
3. **Indicators are data** — Timeline indicators derived from timestamps in cache via `deriveIndicators()` in `chatListSelector.ts`.
4. **Typing indicator derived from last message role** — `role === USER` means waiting for AI, not a boolean flag.
5. **Query keys centralized** in `mobile/src/hooks/queryKeys.ts`. All hooks import from there.
6. **Never `invalidateQueries` on a key with optimistic updates in-flight** — Use `setQueryData` instead.
7. **Ably event handlers use `setQueryData`** to merge updates, not `invalidateQueries` (prevents refetch races).
