---
title: Prisma ↔ API Mapping (MVP)
sidebar_position: 14
description: Quick reference linking API endpoints to the tables/fields they touch.
slug: /backend/api/prisma-api-map
---
# Prisma ↔ API Mapping (MVP)

Quick reference linking API endpoints to the tables/fields they touch.

## Core
- `POST /sessions` → Session, RelationshipMember, SharedVessel, UserVessel
- `GET /sessions/:id` → Session, StageProgress, Relationship, RelationshipMember
- `POST /sessions/:id/pause` / `resume` → Session.status

## Stage 0
- `POST /sessions/:id/compact/sign` → StageProgress.gatesSatisfied.compactSigned

## Stage 1
- `POST /sessions/:id/messages` → Message (+ optional EmotionalReading), embeddings async
- `POST /sessions/:id/feel-heard` → StageProgress.gatesSatisfied.feelHeardConfirmed

## Stage 2
- `POST /sessions/:id/empathy/draft` → EmpathyDraft (content, readyToShare, version)
- `POST /sessions/:id/empathy/consent` → ConsentRecord (targetType EMPATHY_ATTEMPT), EmpathyAttempt, ConsentedContent
- `GET /sessions/:id/empathy/partner` → EmpathyAttempt (partner) + gate partnerConsented
- `POST /sessions/:id/empathy/validate` → EmpathyValidation; gate partnerValidated

## Stage 3
- `GET/POST /sessions/:id/needs` / `confirm` → IdentifiedNeed (confirmed), StageProgress.gatesSatisfied.needsConfirmed
- `POST /sessions/:id/needs/consent` → ConsentRecord targetType IDENTIFIED_NEED; ConsentedContent
- `GET/POST /sessions/:id/common-ground` / `confirm` → CommonGround; gate commonGroundConfirmed

## Stage 4
- `POST /sessions/:id/strategies` → StrategyProposal (source USER_SUBMITTED)
- `POST /sessions/:id/strategies/suggest` → StrategyProposal (source AI_SUGGESTED)
- `POST /sessions/:id/strategies/ready` → StrategyPhase transition + gate strategiesSubmitted
- `POST /sessions/:id/strategies/rank` → StrategyRanking; gate rankingsSubmitted
- `GET /sessions/:id/strategies/overlap` → computes overlap; sets gate overlapIdentified
- `POST /sessions/:id/agreements` → Agreement (type MICRO_EXPERIMENT, proposalId optional); gate agreementCreated

## Consent
- `GET /sessions/:id/consent/pending` → ConsentRecord (decision null)
- `POST /sessions/:id/consent/decide` → ConsentRecord decision, ConsentedContent insert
- `POST /sessions/:id/consent/revoke` → ConsentRecord.revokedAt, ConsentedContent.consentActive=false; mark derived objects stale

## Emotional Barometer
- `POST /sessions/:id/emotions` → EmotionalReading
- `POST /sessions/:id/exercises/complete` → EmotionalExerciseCompletion

## Realtime
- `GET /auth/ably-token` → no DB write; uses User.pushToken for push fallbacks

## Admin/Global Library (future)
- `GlobalLibraryItem` CRUD (not required for MVP; admin-only role)

## Key invariants
- StageProgress.gatesSatisfied keys must match `gate-mapping.md`
- ConsentRecord must include sessionId, targetType, targetId where applicable
- StrategyProposal source is never exposed to the partner
- Agreement.proposalId links back to the chosen StrategyProposal when applicable
