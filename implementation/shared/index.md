# Shared Implementation Plans

Build these first - backend and mobile depend on shared types.

## Execution Order

| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [session-types.md](./session-types.md) | Session, Stage, Participant DTOs | None |
| [api-contracts.md](./api-contracts.md) | Request/response types for all endpoints | session-types.md |
| [validation.md](./validation.md) | Zod schemas and validators | api-contracts.md |

## Source Documentation

- [Data Model](../../docs/mvp-planning/plans/backend/data-model/index.md)
- [Prisma Schema](../../docs/mvp-planning/plans/backend/data-model/prisma-schema.md)
- [API Index](../../docs/mvp-planning/plans/backend/api/index.md)
