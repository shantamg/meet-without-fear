---
slug: /backend/api/gate-mapping
sidebar_position: 13
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
| `partnerNeedsConfirmed` | Derived | Partner confirms needs |
| `commonGroundConfirmed` | `POST /sessions/:id/common-ground/confirm` | Both confirm common ground |

## Stage 4
| Gate | Endpoint | Payload trigger |
|------|----------|-----------------|
| `strategiesSubmitted` | `POST /sessions/:id/strategies/ready` | Caller marks ready |
| `rankingsSubmitted` | `POST /sessions/:id/strategies/rank` | Caller submits ranking |
| `overlapIdentified` | `GET /sessions/:id/strategies/overlap` | Overlap computed (even empty) |
| `agreementCreated` | `POST /sessions/:id/agreements` | Agreement saved |

## Notes
- WAITING state is derived: if one user’s gates for the current stage are all true and the partner’s are not, session shows waiting.
- Stage advance occurs when all gates for the user’s current stage are true and prerequisites met (e.g., Stage 4 requires both users completed Stage 3).
