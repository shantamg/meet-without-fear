---
title: API Specification
sidebar_position: 1
description: REST API endpoints for the Meet Without Fear backend. All endpoints use JSON request/response bodies.
slug: /backend/api
created: 2026-03-11
updated: 2026-04-19
status: living
---
# API Specification

REST API endpoints for the Meet Without Fear backend. All endpoints use JSON request/response bodies.

## Base URL

```
/api/v1
```

## Authentication

All endpoints require authentication via Bearer token (JWT) except where noted.

```
Authorization: Bearer <token>
```

## Response Format

All responses follow this structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

## Endpoint Categories

### [Sessions](./sessions.md)
Session creation, invitations, and lifecycle management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create new session and invite partner |
| `GET`  | `/sessions` | List user's sessions |
| `GET`  | `/sessions/:id` | Get session details |
| `POST` | `/sessions/:id/archive` | Archive a finished/abandoned session |
| `DELETE` | `/sessions/:id` | Mark session `ABANDONED` (hard delete-equivalent) |

> Pause/Resume are not implemented — the active states are `CREATED → INVITED → ACTIVE → (ABANDONED | ARCHIVED)`.

### [Invitations](./invitations.md)
Invitation acceptance and management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/invitations/:id` | Get invitation details |
| `POST` | `/invitations/:id/accept` | Accept invitation |
| `POST` | `/invitations/:id/decline` | Decline invitation |

### Stage progression

There is no generic `/stages/advance` or `/stages/:n/gates` endpoint. Progression is driven by stage-specific status endpoints that expose gate state and transition triggers per feature — e.g. `GET /sessions/:id/empathy/status`, `GET /sessions/:id/compact/status`, `GET /sessions/:id/needs`. Each stage page below documents which endpoint is the authoritative progress read for that stage.

### [Stage 0: Onboarding](./stage-0.md)
Curiosity Compact signing.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/compact/sign` | Sign the Curiosity Compact |
| `GET` | `/sessions/:id/compact/status` | Get compact signing status |

### [Stage 1: Witness](./stage-1.md)
Chat and emotional barometer for witness stage.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/messages/stream` | Send message and receive streaming AI response (SSE) — the primary send path |
| `POST` | `/sessions/:id/messages` | Non-streaming send (legacy; kept for backwards compatibility) |
| `GET`  | `/sessions/:id/messages` | Get message history |
| `POST` | `/sessions/:id/feel-heard` | Confirm feeling heard |

### [Chat Router](../../architecture/integrations.md)

A unified entry point that dispatches a user message to the correct stage handler, regardless of which session/stage context it belongs to.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat/message` | Dispatch a message through the unified chat router |
| `GET`  | `/chat/context` | Read current router context for the user |
| `POST` | `/chat/cancel` | Cancel an in-flight router turn |

### [Stage 2: Perspective Stretch](./stage-2.md)
Empathy exchange, share suggestions (asymmetric reconciler), and consent flows.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/empathy/draft` | Save empathy attempt draft |
| `GET`  | `/sessions/:id/empathy/draft` | Get current empathy draft |
| `POST` | `/sessions/:id/empathy/consent` | Consent to share empathy attempt |
| `GET`  | `/sessions/:id/empathy/partner` | Get partner's empathy attempt |
| `POST` | `/sessions/:id/empathy/validate` | Validate partner's attempt |
| `GET`  | `/sessions/:id/empathy/status` | Authoritative Stage-2 status + gate data |
| `GET`  | `/sessions/:id/empathy/share-suggestion` | Fetch a reconciler share suggestion when the partner missed feelings |
| `POST` | `/sessions/:id/empathy/share-suggestion/respond` | Accept / decline a share suggestion |

### [Emotional Barometer](./emotional-barometer.md)
Emotional tracking across all stages.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/emotions` | Record emotional reading |
| `GET` | `/sessions/:id/emotions` | Get emotional history |
| `POST` | `/sessions/:id/exercises/complete` | Log exercise completion |

### [Stage 3: What Matters](./stage-3.md)
User-driven self-reflection on what truly matters; AI facilitates needs clarity, not extraction.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/sessions/:id/needs` | Get synthesized needs |
| `POST` | `/sessions/:id/needs` | Add a custom need |
| `POST` | `/sessions/:id/needs/confirm` | Confirm/adjust needs |
| `POST` | `/sessions/:id/needs/consent` | Consent to share needs |
| `GET`  | `/sessions/:id/needs/comparison` | Compare confirmed needs across partners |
| `GET`  | `/sessions/:id/common-ground` | Get common ground |
| `POST` | `/sessions/:id/common-ground/confirm` | Confirm common ground |

### [Stage 4: Strategic Repair](./stage-4.md)
Collaborative strategy and agreement.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/strategies` | Get strategy pool (unlabeled) |
| `POST` | `/sessions/:id/strategies` | Propose new strategy |
| `POST` | `/sessions/:id/strategies/suggest` | Request AI suggestions |
| `POST` | `/sessions/:id/strategies/rank` | Submit private ranking |
| `GET` | `/sessions/:id/strategies/overlap` | Get ranking overlap |
| `POST` | `/sessions/:id/agreements` | Create agreement |
| `POST` | `/sessions/:id/resolve` | Resolve session |

### [Consent](./consent.md)
Consensual Bridge mechanism.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/consent/pending` | Get pending consent requests |
| `POST` | `/sessions/:id/consent/decide` | Grant or deny consent |
| `POST` | `/sessions/:id/consent/revoke` | Revoke previously granted consent |

### [Realtime](./realtime.md)
Ably channels for real-time updates.

| Channel | Purpose |
|---------|---------|
| `meetwithoutfear:session:{id}` | Session events (stage completion, agreements) |
| `meetwithoutfear:session:{id}:presence` | Partner online/offline status |

### [Authentication](./auth.md)
Identity provisioning lives in Clerk; the backend only exposes profile and token endpoints.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`    | `/auth/me` | Get current user profile + session counts |
| `PATCH`  | `/auth/me` | Update profile (name / firstName / lastName) |
| `DELETE` | `/auth/me` | Account deletion (abandons sessions, anonymizes data) |
| `GET`    | `/auth/ably-token` | Get Ably token for realtime |
| `POST`   | `/auth/push-token` | Register Expo push token |
| `DELETE` | `/auth/push-token` | Unregister push token |
| `PATCH`  | `/auth/biometric` | Update biometric preference (+ timestamp) |
| `PATCH`  | `/auth/me/mood` | Update default mood intensity |
| `GET`    | `/auth/me/memory-preferences` | Read memory-detection preferences |
| `PUT`    | `/auth/me/memory-preferences` | Replace memory preferences |
| `GET`    | `/auth/me/notification-preferences` | Read push notification prefs |
| `PATCH`  | `/auth/me/notification-preferences` | Partial update of prefs |

### [Slack Ingress](../../architecture/backend-overview.md#slack-ingress-backend)
Slack-originated MWF sessions. These routes use shared-secret auth (not Clerk JWT).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/slack/session-check` | Check if a `(channel, thread_ts)` pair is an active MWF session thread. Used by the EC2 socket listener to route DMs. Returns `{ ok: true, isSession: bool, activeThreadTs: string\|null }` |
| `POST` | `/slack/mwf-session` | Accept a Slack message payload from the EC2 socket listener |
| `GET`  | `/slack/health` | Health check: workspace load status and Slack configuration |

### Additional feature areas (not yet broken out in this index)

The routes below are live; consult the source directly until dedicated pages exist:

| Area | Base path | Source |
|------|-----------|--------|
| Gratitude practice | `/api/v1/gratitude` | `backend/src/routes/gratitude.ts` |
| Meditation | `/api/v1/meditation` | `backend/src/routes/meditation.ts` |
| Needs assessment (solo) | `/api/v1/needs` | `backend/src/routes/needs-assessment.ts` |
| People tracking | `/api/v1/people` | `backend/src/routes/people.ts` |
| Memories | `/api/v1/memories` | `backend/src/routes/memories.ts` |
| Knowledge base | `/api/v1/knowledge-base` | `backend/src/routes/knowledge-base.ts` |
| Inner Thoughts sessions | `/api/v1/inner-thoughts` | `backend/src/routes/inner-thoughts.ts` |
| Notifications | `/api/v1/notifications` | `backend/src/routes/notifications.ts` |
| Voice (AssemblyAI proxy) | `POST /api/v1/voice/token` | `backend/src/routes/voice.ts` |
| Brain diagnostics | `/api/v1/brain` (`/dashboard`, `/costs`, `/sessions/:id/context`) | `backend/src/routes/brain.ts` |
| E2E helpers (dev only) | `/api/v1/e2e/*` (`cleanup`, `seed`, `seed-session`, `trigger-reconciler`) | `backend/src/routes/e2e.ts` |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | User doesn't have access to resource |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `GATE_NOT_SATISFIED` | 400 | Stage gate requirements not met |
| `CONSENT_REQUIRED` | 403 | Content requires consent to access |
| `PARTNER_NOT_READY` | 400 | Partner hasn't completed required action |
| `SESSION_NOT_ACTIVE` | 400 | Session is paused, resolved, or abandoned |

## Real-time Updates

For real-time partner status updates, use Ably pub/sub. See [Real-time Integration](./realtime.md).

---

[Back to Backend](../index.md)
