# Mobile Implementation Plans

Expo React Native app.

## Execution Order

### Foundation (Sequential)
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [navigation.md](./navigation.md) | Tab structure, routing | shared/session-types.md |
| [auth-flow.md](./auth-flow.md) | Login, signup, session management | navigation.md |
| [api-client.md](./api-client.md) | API hooks, error handling | shared/api-contracts.md |

### Core Screens (Can parallelize after foundation)
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [home-dashboard.md](./home-dashboard.md) | Home screen, session list | auth-flow.md, api-client.md |
| [chat-interface.md](./chat-interface.md) | AI conversation UI | api-client.md |
| [emotional-barometer-ui.md](./emotional-barometer-ui.md) | Barometer component | api-client.md |

### Stage Screens
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [stage-0-ui.md](./stage-0-ui.md) | Onboarding screens | home-dashboard.md |
| [stage-1-ui.md](./stage-1-ui.md) | Witness phase UI | chat-interface.md |
| [stage-2-ui.md](./stage-2-ui.md) | Perspective stretch UI | stage-1-ui.md |
| [stage-3-ui.md](./stage-3-ui.md) | Need mapping UI | stage-2-ui.md |
| [stage-4-ui.md](./stage-4-ui.md) | Strategic repair UI | stage-3-ui.md |

### Supporting Features
| Plan | Description | Prerequisites |
|------|-------------|---------------|
| [notifications.md](./notifications.md) | Push notification handling | auth-flow.md |
| [person-detail.md](./person-detail.md) | Partner profile screens | home-dashboard.md |

## Source Documentation

- [Wireframes](../../docs/mvp-planning/plans/wireframes/index.md)
- [User Journey](../../docs/mvp-planning/plans/overview/user-journey.md)
- [Stage Flows](../../docs/mvp-planning/plans/stages/index.md)
