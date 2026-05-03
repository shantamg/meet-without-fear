# Stage 3 Golden Alignment Audit

Status: draft
Date: 2026-05-03
Related: #196, #212, #244, #247, #282
Source material: `docs/product/source-material/golden-transcripts/`

## Context

Darryl's Adam/Eve and James/Catherine examples are now stored as canonical source material:

- `docs/product/source-material/golden-transcripts/adam-eve.md`
- `docs/product/source-material/golden-transcripts/james-catherine.md`
- `docs/product/source-material/golden-transcripts/core-protocol-update.md`

Before this audit, the examples were only Slack attachments referenced by issues. GitHub issues #196, #212, #244, #247, and #282 summarized or pointed to the examples, but did not preserve the full transcript text in the repo.

## Target Stage 3 Flow

The target flow is not a decision to drift away from the golden examples. It is the Stage 3 mechanism implied by the golden examples:

1. AI retains Stage 1-2 context, but does not present pre-extracted needs.
2. User articulates what matters through conversation.
3. AI offers needs language as suggestion, not correction.
4. User confirms their own needs.
5. User consents before needs are shared.
6. After both consent, both users see side-by-side needs.
7. AI asks an open noticing question, conceptually "What do you notice?"
8. AI does not identify, label, or score common ground for the users.
9. Users process the reveal and validate whether both lists are valid before Stage 4.

## Current Drift

### Active Behavior To Verify Or Remove

- `backend/src/controllers/stage3.ts`
  - Still imports and calls `extractNeedsFromConversation`.
  - Still exposes `GET /sessions/:id/common-ground`.
  - Still exposes `POST /sessions/:id/common-ground/confirm`.
  - Still calls `findCommonGround` when no common-ground rows exist.
  - Has `needsValidated` compatibility, but common-ground routes remain active.

- `backend/src/controllers/messages.ts`
  - Still calls `runStage3SafetyNetExtraction` after enough Stage 3 turns.
  - This can create AI-extracted needs outside the user-confirmed capture flow.

- `backend/src/controllers/sessions.ts`
  - Stage advancement still checks `commonGroundConfirmed` in addition to or instead of the new needs-validation gate.

- `backend/src/services/needs.ts`
  - Still implements AI-powered Stage 3 extraction and common-ground analysis.
  - Still has mock common-ground output.

- `mobile/src/hooks/useStages.ts`
  - Still exposes `useCommonGround` and `useConfirmCommonGround`.

- `mobile/src/screens/UnifiedSessionScreen.tsx`
  - Still uses common-ground naming for the reveal/validation panel and local completion state.
  - This may be a compatibility naming shim, but it should be renamed or documented so the active path is unambiguous.

- `mobile/src/screens/NeedMappingScreen.tsx`
  - Still uses legacy common-ground component and hook imports.
  - Verify whether this screen is still reachable. If reachable, it conflicts with the golden Stage 3 flow.

- `mobile/src/screens/StrategicRepairScreen.tsx`
  - Still fetches Stage 3 common ground and renders a "Common Ground Foundation."
  - This conflicts with Stage 4's intended orientation from the confirmed needs reveal rather than AI-authored overlap.

### Compatibility Shims To Preserve Temporarily

- `shared/src/dto/needs.ts`
  - Deprecated common-ground DTO exports exist for downstream compatibility.

- `mobile/src/hooks/useUnifiedSession.ts`
  - Bridges side-by-side validation through old common-ground-shaped names.

- `backend/src/controllers/stage3.ts`
  - `getNeedsComparison`/`GET /needs/reveal` is the newer side-by-side reveal path and returns `commonGround: []` for older consumers.

- `shared/src/dto/realtime.ts` and `backend/src/services/realtime.ts`
  - Realtime event names still include common-ground naming. Treat as compatibility until client event consumers are renamed.

### Stale Tests And Fixtures

- `backend/src/fixtures/stage-3-needs.ts`
  - Still describes deterministic responses for "needs extraction and common ground discovery."
  - Still includes `extract-needs` and `common-ground` operation fixtures.

- `backend/src/fixtures/user-a-full-journey.ts`, `backend/src/fixtures/stage-4-strategies.ts`, and reconciler fixtures
  - Some still include `extract-needs` or `common-ground` operation responses for older E2E paths.

- `backend/src/routes/__tests__/stage3.test.ts`
  - Still imports and tests `getCommonGround` and `confirmCommonGround`.

- `mobile/src/screens/__tests__/NeedMappingScreen.test.tsx`
  - Still covers "Common Ground Discovery."

- `mobile/src/components/__tests__/CommonGroundCard.test.tsx`
  - Tests a stale component for the old shared-needs card.

- `e2e/tests/two-browser-stage-3.spec.ts` and `e2e/tests/two-browser-full-flow.spec.ts`
  - Still expect `common-ground-confirm-button` and common-ground screenshots.

- `e2e/helpers/test-utils.ts`
  - Still has helper behavior for common-ground confirmation.

- `backend/src/testing/state-factory.ts`
  - Seeded `NEED_MAPPING_COMPLETE` state still creates confirmed `CommonGround` records.

### Stale Docs

- `docs/backend/api/stage-3.md`
  - Still documents common-ground analysis and confirmation endpoints as Stage 3 API.

- `docs/backend/state-machine/index.md`
  - Still lists `commonGroundConfirmed` as the Stage 3 gate.

- `docs/backend/api/gate-mapping.md`
  - Still maps `commonGroundConfirmed` to `/common-ground/confirm`.

- `docs/backend/api/index.md`
  - Still lists common-ground endpoints.

- `docs/backend/state-machine/retrieval-contracts.md`
  - Still treats `CommonGround` as a derived retrieval object.

- `docs/product/user-journey.md`
  - Still describes Stage 3 around AI synthesis/common-ground discovery.

## Recommended Cleanup Sequence

1. **Source-of-truth PR**
   - Commit the golden transcript source material and this audit.
   - Update #196/#212/#244/#247/#282 with links to the committed files.

2. **Stage 3 active-path PR**
   - Remove automatic common-ground analysis from the active Stage 3 path.
   - Make the reveal/validation path use `needsValidated` naming end to end.
   - Keep temporary response-shape compatibility only where needed for deployed clients, and mark it explicitly deprecated.

3. **Fixture and E2E PR**
   - Rewrite Stage 3 fixtures around capture -> confirm -> consent -> reveal -> notice -> validate.
   - Rename E2E selectors away from common-ground language where the user-facing behavior is now needs reveal/validation.

4. **Docs PR**
   - Update backend API docs, gate mapping, state-machine docs, and retrieval contracts.
   - Keep `CommonGround` model docs only if it remains as legacy/deprecated storage.

5. **Eval Harness PR**
   - Add golden scenario fixtures under `eval/golden-scenarios/`.
   - Use the committed transcripts as `reference_transcript_id` anchors.
   - First vertical slice should be James/Catherine no-shared-agreement.

## Merge Safety

The source-of-truth PR is safe to merge first because it does not change runtime behavior. The active-path cleanup should be a separate PR with backend, mobile, and E2E verification because current code still has live references to common-ground analysis and selectors.
