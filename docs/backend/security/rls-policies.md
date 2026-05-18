---
title: Database Row-Level Security
sidebar_position: 2
description: Current database RLS status and requirements for full enforcement.
slug: /backend/security/rls-policies
---
# Database Row-Level Security

PostgreSQL Row-Level Security (RLS) policies exist on all high-sensitivity
tables but are **not yet enforced at runtime**. Data isolation is currently
guaranteed by application-layer authorization (controllers, services, Prisma
filters). RLS is configured as a defense-in-depth backstop that activates once
the infrastructure prerequisites are met.

## Current Status

Migration `20260507000000_reenable_rls` enables RLS and creates policies for:

### User-owned tables (direct `userId` column)

- `InnerWorkSession`
- `UserVessel`
- `UserMemory`
- `StageProgress`
- `EmpathyDraft`
- `ConsentRecord`
- `PreSessionMessage`
- `ValidationFeedbackDraft`

### Session-scoped tables (membership-based access)

- `InnerWorkMessage` — via `InnerWorkSession.userId`
- `Message` — via `Session` → `RelationshipMember.userId`
- `EmpathyAttempt` — via `Session` → `RelationshipMember.userId`

### Why policies exist but are not enforced

Prisma connects as the database owner, which bypasses RLS unless
`FORCE ROW LEVEL SECURITY` is set. The migration deliberately omits `FORCE`
because:

- No non-owner application database role is provisioned yet.
- `FORCE` on the owner connection would immediately require every query path
  (including migrations, background jobs, and admin scripts) to set
  `app.current_user_id`.
- The `withRLS()` utility in `backend/src/lib/rls.ts` is available for
  controllers to opt into today, but full adoption is not yet complete.

## Active Isolation Model

The backend relies on application-layer authorization:

- Auth middleware resolves the caller before protected routes run.
- Controllers and services scope Prisma queries with `userId`, `sessionId`, and
  relationship membership checks.
- Consent-sensitive data is read through consent records and shared-content
  state, including `consentActive` and revocation fields.
- Stage-specific access is governed by retrieval contracts and `StageProgress`
  gates before context is assembled for AI prompts.
- Admin and background jobs must keep explicit filters when reading user,
  session, relationship, vessel, message, consent, empathy, and strategy data.

Because this is the sole runtime access-control layer, missing filters in
controllers or services are security defects.

## Using `withRLS()`

The `withRLS` utility (`backend/src/lib/rls.ts`) wraps Prisma operations in an
interactive transaction that sets `app.current_user_id` via `SET LOCAL`:

```ts
import { withRLS } from '../lib/rls';

// All queries inside the callback run with RLS context
const vessels = await withRLS(userId, (tx) =>
  tx.userVessel.findMany({ where: { sessionId } })
);
```

This is safe to use today — when connecting as the database owner the variable
is set but policies are bypassed. Once the non-owner role is active, the same
code enforces database-level isolation with no changes.

## Activation Steps (Infrastructure)

To enforce RLS at the database level, complete these steps in order:

1. **Provision application role** on the managed database (Render):
   ```sql
   CREATE ROLE mwf_app LOGIN PASSWORD '<secret>';
   GRANT ALL ON ALL TABLES IN SCHEMA public TO mwf_app;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO mwf_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mwf_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mwf_app;
   ```

2. **Configure separate connection strings**:
   - `DATABASE_URL` → `mwf_app` role (runtime traffic)
   - `MIGRATION_DATABASE_URL` → owner role (migrations only)

3. **Verify** all query paths either:
   - Call `withRLS(userId, ...)`, or
   - Run under a service context that sets `app.current_user_id`

4. **Add `FORCE ROW LEVEL SECURITY`** (follow-up migration):
   ```sql
   ALTER TABLE "InnerWorkSession" FORCE ROW LEVEL SECURITY;
   -- repeat for each protected table
   ```

5. **Integration tests** proving cross-user reads/writes fail at the DB layer.

6. **Deployment documentation** for database roles, grants, admin bypass, and
   connection-string management.

## Migration History

| Migration | Action |
|---|---|
| `20260311000000_add_row_level_security` | Original RLS policies (6 tables) |
| `20260430000000_remove_unenforced_rls` | Removed policies (never enforced) |
| `20260507000000_reenable_rls` | Re-enabled with expanded coverage (11 tables) |

## Related Documentation

- [Retrieval Contracts](../state-machine/retrieval-contracts.md) - App-layer access rules
- [Prisma Schema](../data-model/prisma-schema.md) - Data model
- [Security Architecture](./index.md) - Current security model

---

[Back to Security](./index.md) | [Back to Backend](../index.md)
