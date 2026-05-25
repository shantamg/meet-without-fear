---
title: Gate → Endpoint Mapping (MVP)
sidebar_position: 13
description: Canonical mapping from gate keys to the endpoints/payloads that set them. Used by QA and backend to keep progression consistent.
slug: /backend/api/gate-mapping
---
# Gate → Endpoint Mapping (MVP)

Canonical mapping from gate keys to the endpoints/payloads that set them. Used by QA and backend to keep progression consistent.

## Stage 0
| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `compactSigned` | `POST /sessions/:id/compact/sign` | Call succeeds |
| `partnerCompactSigned` | Derived | Partner's compactSigned true |

## Stage 1
| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `feelHeardConfirmed` | `POST /sessions/:id/feel-heard` | `confirmed: true` |

## Stage 2
| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `empathyDraftReady` | `POST /sessions/:id/empathy/draft` | `readyToShare: true` |
| `empathyConsented` | `POST /sessions/:id/empathy/consent` | Consent decision GRANTED |
| `partnerConsented` | `GET /sessions/:id/empathy/partner` | Partner attempt present |
| `partnerValidated` | `POST /sessions/:id/empathy/validate` | `validated: true` |

## Stage 3
| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `needsConfirmed` | `POST /sessions/:id/needs/confirm` | Caller confirms needs |
| `needsShared` | `POST /sessions/:id/needs/consent` | Caller consents to share confirmed needs |
| `needsValidated` | Set automatically after both users share needs; legacy `POST /sessions/:id/needs/validate` remains for compatibility | Side-by-side reveal has been reviewed / Stage 4 can start |

## Stage 4

**Redesigned flow (primary — willingness-selection model):**

| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `selectionSubmitted` | `POST /sessions/:id/stage4/proposals/:proposalId/selection` or `POST /sessions/:id/stage4/selections` or `POST /sessions/:id/stage4/share-selections` | Caller submits or shares willingness decisions |
| `agreementCreated` | `POST /sessions/:id/stage4/close` | Stage 4 closed with SHARED_AGREEMENT outcome |

**Legacy flow (vestigial — kept for backward compatibility):**

| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `strategiesSubmitted` | `POST /sessions/:id/strategies/ready` | Caller marks ready |
| `rankingsSubmitted` | `POST /sessions/:id/strategies/rank` | Caller submits ranking |
| `overlapIdentified` | `GET /sessions/:id/strategies/overlap` | Overlap computed (even empty) |

## Notes
- WAITING state is derived: if one user’s gates for the current stage are all true and the partner’s are not, session shows waiting.
- Stage advance occurs when all gates for the user’s current stage are true and prerequisites met (e.g., Stage 4 requires both users completed Stage 3).
- Tending endpoints (`/sessions/:id/tending/*`) operate post-resolution and do not set stage gates.
