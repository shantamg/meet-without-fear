---
title: Database Row-Level Security
sidebar_position: 2
description: Current database RLS status and requirements for future enforcement.
slug: /backend/security/rls-policies
---
# Database Row-Level Security

PostgreSQL Row-Level Security (RLS) is not part of the active runtime security
model today. Data isolation is enforced in application code with authenticated
request context, explicit Prisma filters, relationship/session membership
checks, consent checks, and stage retrieval contracts.

## Current Status

Migration `20260430000000_remove_unenforced_rls` disables the previously created
RLS policies for:

- `InnerWorkSession`
- `InnerWorkMessage`
- `UserVessel`
- `UserMemory`
- `StageProgress`
- `EmpathyDraft`

The removed policies were created by
`20260311000000_add_row_level_security`, but they were not enforced at runtime:

- Prisma connects using the database owner role, which bypasses RLS unless every
  protected table has `FORCE ROW LEVEL SECURITY`.
- Production code did not set `app.current_user_id` before querying protected
  tables.
- No non-owner application database role was provisioned for normal runtime
  traffic.
- Several sensitive tables were never covered by the original policy set.

Keeping those policies in place gave a false impression that the database was
providing defense in depth. Removing them makes the security boundary explicit.

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

## Future RLS Requirements

RLS should only be reintroduced as an end-to-end project. A partial migration is
not sufficient. A future implementation must include:

- A non-owner application database role for normal runtime traffic.
- `FORCE ROW LEVEL SECURITY` on every protected table, with a separate owner or
  migration role for schema changes.
- Request-scoped transaction helpers that set PostgreSQL locals before every
  protected Prisma query path.
- Policies for all sensitive tables, including message, consent, empathy,
  strategy, memory, vessel, and inner-work data.
- Tests that prove cross-user reads and writes fail at the database layer, not
  only in route handlers.
- Deployment documentation for database roles, grants, connection strings, and
  admin bypass procedures.

Until all of those pieces exist, current documentation should treat RLS as
future hardening rather than an active guarantee.

## Related Documentation

- [Retrieval Contracts](../state-machine/retrieval-contracts.md) - App-layer access rules
- [Prisma Schema](../data-model/prisma-schema.md) - Data model
- [Security Architecture](./index.md) - Current security model

---

[Back to Security](./index.md) | [Back to Backend](../index.md)
