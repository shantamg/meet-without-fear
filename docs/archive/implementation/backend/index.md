# Backend Implementation Plans

Express API, Prisma database, and business logic.

## Execution Order

### Foundation (Sequential)
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [database.md](./database.md) | Prisma schema, migrations | shared/session-types.md |
| [auth.md](./auth.md) | Supabase auth, JWT handling | database.md |
| [realtime.md](./realtime.md) | Ably setup, channel patterns | auth.md |

### Stage APIs (Can parallelize after foundation)
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [stage-0-api.md](./stage-0-api.md) | Onboarding endpoints | auth.md, realtime.md |
| [stage-1-api.md](./stage-1-api.md) | Witness phase endpoints | stage-0-api.md |
| [stage-2-api.md](./stage-2-api.md) | Perspective stretch endpoints | stage-1-api.md |
| [stage-3-api.md](./stage-3-api.md) | Need mapping endpoints | stage-2-api.md |
| [stage-4-api.md](./stage-4-api.md) | Strategic repair endpoints | stage-3-api.md |

### Supporting Features
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [emotional-barometer.md](./emotional-barometer.md) | Barometer tracking API | database.md |
| [invitations.md](./invitations.md) | Partner invitation system | auth.md |

## Source Documentation

- [Backend Overview](../../docs/mvp-planning/plans/backend/index.md)
- [Architecture](../../docs/mvp-planning/plans/backend/overview/architecture.md)
- [API Specs](../../docs/mvp-planning/plans/backend/api/index.md)
- [State Machine](../../docs/mvp-planning/plans/backend/state-machine/index.md)
