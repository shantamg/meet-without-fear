---
title: Sessions API
sidebar_position: 2
description: Session creation, listing, and lifecycle management.
slug: /backend/api/sessions
---
# Sessions API

Session creation, listing, and lifecycle management.

## Create Session

Creates a new session and sends an invitation to the partner.

```
POST /api/v1/sessions
```

### Request Body

```typescript
interface CreateSessionRequest {
  // Existing person (returns existing active session if one already exists)
  personId?: string;

  // Or, name-only invite for a brand-new person
  inviteName?: string;

  // Optional context (private to creator, used to seed the AI intro)
  context?: string;

  // Optional link to the Inner Thoughts entry that motivated the session
  innerThoughtsId?: string;
}
```

### Validation Rules

- Must provide `personId` OR `inviteName`
- If `personId` has an existing `ACTIVE`/`CREATED`/`INVITED` session, that session is returned instead of creating a new one

### Invitation Delivery

The backend returns a shareable `invitationUrl`; the inviter forwards it through whatever channel they prefer (iMessage, email, WhatsApp). The backend itself does **not** send invitation emails or SMS. See [Invitations API](./invitations.md) for the full model.

### Response

```typescript
interface CreateSessionResponse {
  session: SessionSummaryDTO;
  invitationId: string;
  invitationUrl: string;  // Deep link for partner
}
```

### Example

```bash
curl -X POST /api/v1/sessions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "inviteName": "Alex",
    "context": "Discussion about household responsibilities"
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "sess_abc123",
      "relationshipId": "rel_xyz789",
      "status": "CREATED",
      "createdAt": "2024-01-15T10:30:00Z",
      "partner": {
        "id": "user_pending",
        "name": "Alex"
      },
      "myProgress": {
        "stage": 0,
        "status": "NOT_STARTED",
        "startedAt": null,
        "completedAt": null
      },
      "partnerProgress": {
        "stage": 0,
        "status": "NOT_STARTED",
        "startedAt": null,
        "completedAt": null
      },
      "selfActionNeeded": ["compactSigned"],
      "partnerActionNeeded": ["partnerCompactSigned"]
    },
    "invitationId": "inv_def456",
    "invitationUrl": "meetwithoutfear://invite/inv_def456"
  }
}
```

### Errors

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Missing required fields |
| `NOT_FOUND` | `personId` doesn't exist |

### Session lifecycle

`CREATED → INVITED → ACTIVE → ARCHIVED | ABANDONED`. There are no pause/resume states. `CREATED` flips to `INVITED` once the inviter confirms the invitation message; `INVITED` flips to `ACTIVE` when the partner accepts.

> **Background AI**: After the inviter confirms the invitation message (`POST /sessions/:id/invitation/confirm`), the HTTP response returns immediately and the backend fires an AI transition message generation + Ably session-event publish asynchronously (fire-and-forget).

---

## List Sessions

Listing the caller's sessions is currently surfaced via **unread count** + per-person **People API** rather than a generic `GET /sessions` endpoint. The `GET /sessions/unread-count` endpoint returns aggregate badge data.

```
GET /api/v1/sessions/unread-count
```

---

## Get Session Details

Get full details for a specific session.

```
GET /api/v1/sessions/:id
```

### Response

```typescript
interface SessionDetailDTO {
  id: string;
  relationshipId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;

  partner: {
    id: string;
    name: string | null;
  };

  myProgress: StageProgressDTO;
  partnerProgress: StageProgressDTO;

  relationship: {
    id: string;
    createdAt: string;
    sessionCount: number;
  };

  currentGates: StageGateDTO[];
  resolvedAt: string | null;

  selfActionNeeded: string[];
  partnerActionNeeded: string[];
}
```

### Errors

| Code | When |
|------|------|
| `UNAUTHORIZED` (401) | No auth token |
| `NOT_FOUND` (404) | Session doesn't exist, or the authenticated user isn't a participant (non-participants see 404, not 403, to avoid disclosing session IDs) |

---

## Session state, timeline, and progress

The frontend doesn't reconstruct session state from `GET /sessions/:id` alone. Use these companion endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/api/v1/sessions/:id/state` | Consolidated session + stage + gate state |
| `GET`  | `/api/v1/sessions/:id/timeline` | Ordered ChatItem timeline (messages + indicators) |
| `GET`  | `/api/v1/sessions/:id/progress` | Per-user `StageProgress` + gate satisfaction |
| `POST` | `/api/v1/sessions/:id/stages/advance` | Advance the caller's stage when all gates for the current stage are satisfied |
| `POST` | `/api/v1/sessions/:id/resolve` | Resolve session. Requires at least one `AGREED` agreement exists in the shared vessel; returns `VALIDATION_ERROR` otherwise |
| `POST` | `/api/v1/sessions/:id/viewed` | Mark the session as viewed (clears unread flags) |
| `POST` | `/api/v1/sessions/:id/share-tab-viewed` | Mark the Sharing tab as viewed |
| `GET`  | `/api/v1/sessions/:id/invitation` | Get the current draft invitation message (inviter only) |
| `PUT`  | `/api/v1/sessions/:id/invitation/message` | Replace the draft invitation message |
| `POST` | `/api/v1/sessions/:id/invitation/confirm` | Confirm the invitation message; transitions session `CREATED → INVITED` |
| `GET`  | `/api/v1/sessions/:id/inner-thoughts` | Fetch the linked Inner Thoughts entry (if any) |

> **Stage gates** (code: `STAGE_GATES`): Stage 0 requires `compactSigned`; Stage 1 requires `feelHeardConfirmed`; later stages have their own gate keys. `/progress` surfaces which gates the caller and the partner still need to satisfy.

### Pause / Resume

Not implemented. Sessions cannot be paused. For cooling-off, users can stop messaging — all state persists, and the session remains in `ACTIVE` until archived, abandoned, or resolved.

---

## Related Documentation

- [User Journey](../../overview/user-journey.md) - High-level session flow
- [Session Status States](../../wireframes/session-dashboard.md) - UI states for sessions
- [Invitations API](./invitations.md) - Partner invitation flow

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
