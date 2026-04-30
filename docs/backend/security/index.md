---
title: Security Architecture
sidebar_position: 1
description: Security implementation for Meet Without Fear, focusing on privacy isolation and consent enforcement.
slug: /backend/security
---
# Security Architecture

Security implementation for Meet Without Fear, focusing on privacy isolation and consent enforcement.

## Documentation

### [Database Row-Level Security](./rls-policies.md)
Current PostgreSQL RLS status and requirements for future enforcement. RLS is not active runtime protection today.

### Access Control
API-level authorization and role-based access (user vs admin vs AI acting-on-behalf)

### Encryption
Data encryption at rest and in transit (Render Postgres + TLS everywhere)

### Audit Logging
Consent decisions and retrieval attempts recorded for review

## Core Security Principles

| Principle | Implementation |
|-----------|----------------|
| Privacy by default | UserVessel data isolated by app-layer user/session filters |
| Consent at query time | Every SharedVessel query checks `consentActive` |
| Defense in depth | Auth middleware + app-layer authorization + consent/retrieval contracts |
| Audit everything | All consent decisions logged |
| Minimal privilege | AI receives only stage-appropriate context |

## MVP Decisions

- **Stage enforcement source of truth**: App-layer retrieval contracts + StageProgress gates.
- **Consent scope**: All consent records are tied to a session + targetId + targetType; revocation must cascade to SharedVessel content (set `consentActive=false`) and mark dependent outputs stale.
- **Admin access**: Only for global library curation; no access to user vessels. Admin queries must keep explicit user/session/relationship filters.
- **Encryption**: TLS to Postgres, Render at-rest encryption, hash push tokens, and avoid storing secrets in user rows.
- **Audit log**: Log every `/consent/decide`, `/consent/revoke`, and retrieval contract rejection.

---

[Back to Backend](../index.md)
