# Stage 3 Golden Alignment Plan

Status: ready for implementation planning
Date: 2026-05-03
Related: #247, #282, PR #306
Source material: `docs/product/source-material/golden-transcripts/`

## Goal

Get Stage 3 production-testable against the golden examples without trying to solve Stage 4, Tending, or the full eval harness in the same change set.

Stage 3 should match the intent of Adam/Eve and James/Catherine:

1. AI keeps Stage 1-2 context, but does not present pre-extracted needs to the user.
2. Each user articulates what matters through conversation.
3. AI offers needs language as suggestion, not correction.
4. Each user confirms their own needs.
5. Each user consents before needs are shared.
6. After both consent, both users see side-by-side needs.
7. AI asks an open noticing prompt, conceptually "What do you notice?"
8. AI does not identify, label, or score common ground for the users.
9. Users process the reveal and validate whether both lists are valid before Stage 4 opens.

## What Happened

The drift was not intentional product drift away from the golden examples.

Darryl shared the Adam/Eve and James/Catherine golden examples in Slack. Issues summarized them, but the full transcript source material was not committed to the repo until PR #306. Stage 3 implementation then moved through a compatibility path where old common-ground DTOs, routes, hooks, tests, and UI names stayed alive so CI and existing screens would keep working.

That left two Stage 3 models in the codebase:

- Target model: user articulates needs -> consent -> side-by-side reveal -> "what do you notice?" -> validate.
- Legacy model: AI extracts needs -> AI finds common ground -> users confirm common ground.

The alignment work is to remove the legacy model from the active path while preserving only clearly marked compatibility shims where needed.

## Acceptance Criteria

- No active user path presents AI-extracted Stage 1-2 needs as the user's needs.
- No active user path runs or displays AI-authored common-ground analysis.
- `needsValidated` is the Stage 3 advancement gate.
- Side-by-side reveal is the primary post-consent Stage 3 surface.
- User-facing copy says needs reveal/validation, not common-ground discovery/confirmation.
- The Stage 3 production smoke path completes with two users:
  - both articulate and confirm needs
  - both consent
  - both see the side-by-side reveal
  - both validate
  - session advances to Stage 4
- Deprecated common-ground types/routes, if temporarily retained, are explicitly marked as compatibility and do not create new common-ground analysis.

## Source Of Truth

Start from these files:

- `docs/product/source-material/golden-transcripts/README.md`
- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`
- `docs/product/stage-3-golden-alignment-audit.md`
- `docs/product/stages/stage-3-what-matters.md`
- `docs/product/gold-flow-next-session-plan.md`

## Implementation Sequence

### PR 1: Source Material

Merge PR #306 first.

Purpose:

- Preserve the golden examples in the repo.
- Give future implementation and review a stable reference.
- Avoid another cycle where Slack attachments are treated as implicit product requirements.

### PR 2: Backend Active Path

Purpose: remove legacy extraction/common-ground behavior from active Stage 3 runtime.

Likely files:

- `backend/src/controllers/stage3.ts`
- `backend/src/controllers/messages.ts`
- `backend/src/controllers/sessions.ts`
- `backend/src/services/needs.ts`
- `backend/src/routes/stage3.ts`
- `shared/src/dto/needs.ts`
- `shared/src/contracts/stages.ts`
- `shared/src/dto/realtime.ts`

Required changes:

- Stop `GET /sessions/:id/needs` from triggering `extractNeedsFromConversation`.
- Disable/remove `runStage3SafetyNetExtraction` from Stage 3 active flow.
- Stop `/sessions/:id/common-ground` from running `findCommonGround`.
- Make `/sessions/:id/needs/reveal` or `/sessions/:id/needs/comparison` the primary reveal endpoint.
- Make `POST /sessions/:id/needs/validate` the active validation endpoint.
- Make session advancement read `needsValidated`, not `commonGroundConfirmed`, for Stage 3.
- Keep old common-ground DTO exports only as deprecated compatibility shims if needed.
- If common-ground routes remain temporarily, they must return a deprecated/empty compatibility response and must not create new AI analysis.

Verification:

- Backend typecheck.
- Backend Stage 3 controller tests updated and passing.
- Add/keep a regression test proving common-ground analysis is not triggered by Stage 3 consent/reveal/validation.

### PR 3: Mobile Active Path

Purpose: remove legacy common-ground behavior from the active client flow and make copy/naming match needs reveal/validation.

Likely files:

- `mobile/src/hooks/useStages.ts`
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/screens/UnifiedSessionScreen.tsx`
- `mobile/src/components/NeedsDrawer.tsx`
- `mobile/src/utils/chatUIState.ts`
- `mobile/src/utils/getWaitingStatus.ts`
- `mobile/src/config/waitingStatusConfig.ts`
- `mobile/src/screens/NeedMappingScreen.tsx`
- `mobile/src/screens/StrategicRepairScreen.tsx`

Required changes:

- Remove active calls to `/common-ground` and `/common-ground/confirm`.
- Rename user-facing common-ground copy to needs reveal/validation.
- Keep the side-by-side reveal surface.
- Ensure the reveal/validation panel calls the needs validation endpoint.
- Verify whether `NeedMappingScreen.tsx` is still reachable. If it is reachable, align it. If it is not reachable, remove or archive it in a separate cleanup.
- Stop Stage 4 from depending on AI-authored common ground as its foundation. Stage 4 can receive confirmed needs; full Stage 4 redesign remains out of scope.

Verification:

- Mobile typecheck.
- Mobile unit tests updated and passing.
- Manual or browser smoke path for Stage 3 reveal/validation.

### PR 4: Fixtures, E2E, And Docs

Purpose: make tests and docs reinforce the target flow instead of resurrecting the legacy model.

Likely files:

- `backend/src/fixtures/stage-3-needs.ts`
- `backend/src/fixtures/user-a-full-journey.ts`
- `backend/src/fixtures/stage-4-strategies.ts`
- `backend/src/routes/__tests__/stage3.test.ts`
- `backend/src/testing/state-factory.ts`
- `e2e/tests/two-browser-stage-3.spec.ts`
- `e2e/tests/two-browser-full-flow.spec.ts`
- `e2e/helpers/test-utils.ts`
- `mobile/src/screens/__tests__/NeedMappingScreen.test.tsx`
- `mobile/src/components/__tests__/NeedsDrawer.test.tsx`
- `mobile/src/utils/__tests__/chatUIState.test.ts`
- `docs/backend/api/stage-3.md`
- `docs/backend/state-machine/index.md`
- `docs/backend/api/gate-mapping.md`
- `docs/backend/api/index.md`
- `docs/backend/state-machine/retrieval-contracts.md`
- `docs/product/user-journey.md`

Required changes:

- Rewrite Stage 3 fixtures around capture -> confirm -> consent -> reveal -> notice -> validate.
- Remove expectations that common-ground analysis creates output.
- Rename E2E selectors and screenshots away from common-ground where feasible.
- Update backend API and state-machine docs to describe needs reveal/validation.
- Keep old common-ground docs only if explicitly marked deprecated.

Verification:

- Backend tests.
- Mobile tests.
- Stage 3 E2E.
- Full-flow smoke if available.

### PR 5: Production Smoke Test

Purpose: verify the aligned Stage 3 flow in production or staging before broad Stage 4/Tending work resumes.

Production/staging script:

1. User A reaches Stage 3.
2. User A chats with AI and articulates needs.
3. User A confirms needs.
4. User B reaches Stage 3.
5. User B chats with AI and articulates needs.
6. User B confirms needs.
7. Both users consent to share.
8. Both users see side-by-side needs.
9. AI asks an open noticing/processing prompt.
10. Both users validate the needs.
11. Session advances to Stage 4.

Pass/fail should be judged against the golden examples' Stage 3 intent, not exact wording.

## Out Of Scope For This Plan

- Stage 4 collaborative dialogue redesign.
- Tending implementation.
- Full golden eval harness.
- Rewriting all old docs outside the Stage 3 path unless they directly cause implementation confusion.

## Review Guidance

Do not frame this as "moving away from the golden examples." The correct framing is:

> We are removing leftover implementation from the previous Stage 3 model so the merged product matches the golden examples' Stage 3 intent.

When reviewing PRs, reject changes that preserve active AI-authored common-ground analysis under a renamed surface. Compatibility shims are acceptable only if they are temporary, documented, and inert.
