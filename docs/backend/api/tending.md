---
title: "Tending API"
sidebar_position: 12
description: Post-resolution check-in and re-entry endpoints for follow-through on Stage 4 agreements.
slug: /backend/api/tending
created: 2026-05-06
updated: 2026-05-06
status: living
---
# Tending API

Post-resolution check-in and re-entry endpoints. Tending surfaces after a session reaches `RESOLVED` status to help both partners follow through on the agreements and commitments made during Stage 4.

## Overview

Two Tending flows exist:

- **Scheduled check-ins** (`SCHEDULED_SHARED_AGREEMENT_CHECKIN`) — created automatically when `Stage4Closure` records agreements with a `followUpDate`. The cron script `backend/src/scripts/open-due-tending-entries.ts` opens them when their scheduled time arrives.
- **Passive re-entry** (`USER_INITIATED_REENTRY`) — created on demand when a user returns to a resolved session and wants to reconnect with its outcomes. Context is assembled from the Stage 4 closure summary, agreements, open needs, and individual commitments.

### Entry status lifecycle

```
SCHEDULED → (cron opens when due) → OPEN → PARTIAL (one partner responds) → COMPLETED (both respond)
                                          ↓
                                      CANCELLED / EXPIRED
```

---

## List Tending Entries

```
GET /api/v1/sessions/:id/tending
```

Returns all Tending entries for the session, enriched with response counts and the caller's own response (if any).

### Response

```typescript
interface ListTendingEntriesResponse {
  entries: TendingEntryDTO[];
}

interface TendingEntryDTO {
  id: string;
  type: TendingEntryType;
  status: TendingEntryStatus;
  scheduledFor: string | null;    // ISO 8601; null for re-entry
  openedAt: string | null;
  completedAt: string | null;
  summary: string | null;         // Context assembled at creation time
  myResponse: TendingResponseDTO | null;
  responseCount: number;          // How many partners have responded
}

interface TendingResponseDTO {
  id: string;
  tendingEntryId: string;
  userId: string;
  status: string;                 // e.g. "WORKED", "PARTLY", "DID_NOT_WORK"
  reflection: string | null;
  continueChoice: string | null;  // e.g. "CONTINUE", "ADJUST", "CLOSE"
  submittedAt: string;
}

enum TendingEntryType {
  SCHEDULED_SHARED_AGREEMENT_CHECKIN = 'SCHEDULED_SHARED_AGREEMENT_CHECKIN',
  USER_INITIATED_REENTRY             = 'USER_INITIATED_REENTRY',
}

enum TendingEntryStatus {
  SCHEDULED = 'SCHEDULED',
  OPEN      = 'OPEN',
  PARTIAL   = 'PARTIAL',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED   = 'EXPIRED',
}
```

---

## Submit Tending Response

Record the caller's response to an open Tending entry. One response per entry/user (upsert on repeat submission).

```
POST /api/v1/sessions/:id/tending/:entryId/responses
```

### Request Body

```typescript
interface SubmitTendingResponseRequest {
  status: string;             // Required; max 80 chars. e.g. "WORKED", "PARTLY", "DID_NOT_WORK"
  reflection?: string;        // Optional; max 2000 chars
  continueChoice?: string;    // Optional; max 80 chars. e.g. "CONTINUE", "ADJUST", "CLOSE"
}
```

### Response

```typescript
interface SubmitTendingResponseResponse {
  entry: TendingEntryDTO;     // Updated entry with new response counts + myResponse
}
```

### Side Effects

- Entry status advances to `PARTIAL` after the first response, `COMPLETED` when all session members have responded.
- On the transition to `COMPLETED`, a session event is published to notify the partner.

### Preconditions

- Entry must be in `OPEN` or `PARTIAL` status (not `SCHEDULED`, `COMPLETED`, `CANCELLED`, or `EXPIRED`).
- Caller must be a member of the session.

---

## Initiate Passive Re-entry

Create a new `USER_INITIATED_REENTRY` entry for a resolved session. Assembles context from the Stage 4 closure record, agreements, open needs, and individual commitments.

```
POST /api/v1/sessions/:id/tending/reentry
```

### Request Body

```typescript
interface CreateTendingReentryRequest {
  intent?: string;    // Optional; max 1000 chars. Caller's stated reason for re-entry
}
```

### Response

Returns `201 Created`.

```typescript
interface CreateTendingReentryResponse {
  entry: TendingEntryDTO;
}
```

### Preconditions

- Session must be `RESOLVED`.
- Caller must be a session member.

---

## Scheduled Entry Opening (Cron)

The script `backend/src/scripts/open-due-tending-entries.ts` is run by cron. It:

1. Queries all `SCHEDULED` entries whose `scheduledFor` is in the past.
2. Sets their status to `OPEN`.
3. Publishes a session event so both partners are notified.

This script has no HTTP endpoint — it is invoked directly by the scheduler.

---

## Data Model

See [Prisma Schema: Tending](../data-model/prisma-schema.md#tending) for the full `TendingEntry` and `TendingResponse` model definitions.

---

## Error Codes

| Code | HTTP | Condition |
|------|------|-----------|
| `NOT_FOUND` | 404 | Session or entry not found |
| `VALIDATION_ERROR` | 400 | Entry is not in a state that accepts responses (e.g. SCHEDULED) |
| `UNAUTHORIZED` | 401 | Missing auth |
| `FORBIDDEN` | 403 | Caller is not a session member |

---

[Back to API Index](./index.md) | [Back to Stage 4](./stage-4.md)
