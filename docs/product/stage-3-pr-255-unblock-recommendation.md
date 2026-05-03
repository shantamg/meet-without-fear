# Stage 3 PR #255 Unblock Recommendation

Status: draft
Related: #247, #248, #250, #251, #255
Date checked: 2026-05-02

## Recommendation

Use a short-lived compatibility bridge in `shared/src/dto/needs.ts`, then merge PR #255 into `milestone/stage-3-redesign`.

The current CI break is narrow and caused by removed exports, not by a broad backend/mobile behavioral mismatch. Reintroducing deprecated common-ground DTO exports keeps downstream TypeScript green while #250/#251 remove the common-ground UI and hook consumers in the next wave.

This is lower risk than batching #250/#251 into #255 because PR #255 only changes shared Stage 3 DTOs and gates. Expanding it into consumer cleanup would turn a type-contract PR into a broad mobile/backend refactor.

## CI Evidence

PR #255:

- Head: `feat/stage3-shared-types-248`
- Base: `milestone/stage-3-redesign`
- State: open, mergeable
- Changed files:
  - `shared/src/dto/needs.ts`
  - `shared/src/dto/stage.ts`

Failing check:

- GitHub Actions run `25242911068`
- Job: `Checks & Tests`
- Command that fails: mobile `tsc --noEmit`

Representative errors:

```text
src/hooks/useStages.ts(38,3): Module '@meet-without-fear/shared' has no exported member 'GetCommonGroundResponse'.
src/hooks/useStages.ts(40,3): Module '@meet-without-fear/shared' has no exported member 'ConfirmCommonGroundRequest'.
src/hooks/useStages.ts(41,3): Module '@meet-without-fear/shared' has no exported member 'ConfirmCommonGroundResponse'.
src/screens/NeedMappingScreen.tsx(36,36): Module '@meet-without-fear/shared' has no exported member 'CommonGroundDTO'.
```

The later implicit `any` errors are downstream of those missing types.

## Smallest Patch

In PR #255, restore these exports in `shared/src/dto/needs.ts` with `@deprecated` comments:

- `CommonGroundDTO`
- `GetCommonGroundResponse`
- `ConfirmCommonGroundRequest`
- `ConfirmCommonGroundResponse`
- `NeedsComparisonCommonGroundDTO`

Also consider preserving `ConsentShareNeedsResponse.commonGroundReady` as deprecated until mobile no longer reads it.

Keep the new DTOs introduced by #255:

- `CapturedNeedInput`
- `CaptureNeedsRequest`
- `CaptureNeedsResponse`
- `ValidateNeedsResponse`
- side-by-side `GetNeedsComparisonResponse` without overlap as the target contract

Do not restore common ground into the new Stage 3 product semantics. The bridge should exist only to keep older consumers compiling while the milestone branch advances.

## Follow-up Cleanup

#250/#251 should remove the compatibility bridge by updating:

- `mobile/src/hooks/useStages.ts`
- `mobile/src/hooks/useUnifiedSession.ts`
- `mobile/src/screens/NeedMappingScreen.tsx`
- `mobile/src/screens/StrategicRepairScreen.tsx`
- any web/mobile screen still rendering `CommonGroundCard`, shared need badges, or common-ground confirmation
- e2e expectations that assert shared needs or common-ground discovery

The consumer cleanup should replace common-ground confirmation with the new consent, reveal, noticing, and validation gates.

## Risks

- A compatibility bridge can hide stale UI paths if it stays too long.
- The bridge should be tracked as milestone debt and removed in the #250/#251 cleanup wave.
- Backend contracts may still need a separate cleanup once routes stop returning common-ground payloads.

## Verification

Run locally on the PR branch after the bridge patch:

```bash
npm run check --workspace @meet-without-fear/shared
npm run check --workspace @meet-without-fear/mobile
npm run check
```

Then rerun PR #255 CI and verify `Checks & Tests` and `CI Result` pass.
