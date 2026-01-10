# Waiting Status Refactor: State Derivation Architecture

## Problem Summary

The current waiting status implementation has 6 issues:

1. **Scattered Logic** - UI behavior rules spread across multiple locations
2. **Easy to Break** - Complex useEffect chains that are hard to reason about
3. **Order-Dependent** - Status checks happen in implicit order within useEffect
4. **No Type Safety** - Status transitions and inputs not well-typed
5. **Mixed Concerns** - Status calculation, UI behavior, and data fetching intertwined
6. **Complex Dependencies** - Manual dependency tracking in useEffect chains

## Solution Overview

Replace the imperative `useEffect`-based status watching with:

1. **Pure derivation function** (`computeWaitingStatus`) - calculates status from current data snapshot
2. **Configuration object** (`WAITING_STATUS_CONFIG`) - maps statuses to UI behaviors
3. **Simplified hook** - orchestrates data and returns derived values

---

## Implementation Plan

### Phase 1: Create Pure Status Derivation Function

**File:** `mobile/src/utils/getWaitingStatus.ts`

```typescript
import { Stage } from '@meet-without-fear/shared';
import { WaitingStatusState } from '../hooks/useUnifiedSession';

interface WaitingStatusInputs {
  myStage: Stage;
  partnerStage: Stage;
  // Stage 1 Inputs
  previousStatus: WaitingStatusState; // Needed for transition detection
  // Stage 2 Inputs
  empathyStatus: {
    analyzing?: boolean;
    awaitingSharing?: boolean;
    hasNewSharedContext?: boolean;
    myAttemptStatus?: string; // 'REVEALED', 'NEEDS_WORK', etc.
  } | undefined;
  empathyDraft: {
    alreadyConsented?: boolean;
  } | undefined;
  partnerEmpathy: boolean; // simple boolean: do we have it?
  shareOffer: {
    hasSuggestion?: boolean;
  } | undefined;
  // Stage 3 Inputs
  needs: { allConfirmed: boolean };
  commonGround: { count: number };
  // Stage 4 Inputs
  strategyPhase: string;
  overlappingStrategies: { count: number };
}

export function computeWaitingStatus(inputs: WaitingStatusInputs): WaitingStatusState {
  const {
    myStage,
    partnerStage,
    previousStatus,
    empathyStatus,
    empathyDraft,
    partnerEmpathy,
    shareOffer,
    needs,
    commonGround,
    strategyPhase,
    overlappingStrategies
  } = inputs;

  // --- Priority 1: User Action Required (Overrides waiting) ---

  // If user received new context, they must act (refine), so no waiting banner.
  if (empathyStatus?.hasNewSharedContext) {
    return null;
  }

  // --- Priority 2: Stage 1 (Witness) ---

  if (myStage === Stage.PERSPECTIVE_STRETCH && partnerStage === Stage.WITNESS) {
    return 'witness-pending';
  }

  if (
    myStage === Stage.PERSPECTIVE_STRETCH &&
    partnerStage === Stage.PERSPECTIVE_STRETCH &&
    previousStatus === 'witness-pending'
  ) {
    return 'partner-completed-witness'; // Transient state
  }

  // --- Priority 3: Stage 2 (Empathy) ---

  // Reconciler is running
  if (empathyStatus?.analyzing) {
    return 'reconciler-analyzing';
  }

  // User needs to respond to share suggestion (Subject side)
  if (shareOffer?.hasSuggestion) {
    return 'awaiting-context-share';
  }

  // Guesser waiting for Subject to decide on sharing (Guesser side)
  if (empathyStatus?.awaitingSharing && !empathyStatus?.hasNewSharedContext) {
    return 'empathy-pending';
  }

  // Good alignment: User is revealed, Partner is working on it
  if (
    empathyStatus?.myAttemptStatus === 'REVEALED' &&
    !partnerEmpathy &&
    !empathyStatus?.analyzing
  ) {
    return 'partner-considering-perspective';
  }

  // Standard waiting for partner to share
  if (
    empathyDraft?.alreadyConsented &&
    !partnerEmpathy &&
    !empathyStatus?.analyzing &&
    !empathyStatus?.awaitingSharing
  ) {
    return 'empathy-pending';
  }

  // Transition: Partner just shared
  if (partnerEmpathy && previousStatus === 'empathy-pending') {
    return 'partner-shared-empathy'; // Transient state
  }

  // --- Priority 4: Stage 3 (Needs) ---

  if (needs.allConfirmed && commonGround.count === 0) {
    return 'needs-pending';
  }

  if (commonGround.count > 0 && previousStatus === 'needs-pending') {
    return 'partner-confirmed-needs'; // Transient state
  }

  // --- Priority 5: Stage 4 (Strategies) ---

  if (strategyPhase === 'REVEALING' && overlappingStrategies.count === 0) {
    return 'ranking-pending';
  }

  return null;
}
```

**Tasks:**
- [ ] Create `mobile/src/utils/getWaitingStatus.ts`
- [ ] Export `WaitingStatusInputs` interface
- [ ] Write unit tests for `computeWaitingStatus` covering all priority paths

---

### Phase 2: Create UI Configuration Object

**File:** `mobile/src/config/waitingStatusConfig.ts`

```typescript
import { WaitingStatusState } from '../hooks/useUnifiedSession';

interface StatusConfig {
  showBanner: boolean;
  hideInput: boolean;
  showInnerThoughts: boolean; // Base rule, might still check stage in UI
  bannerText?: (partnerName: string) => string;
}

export const WAITING_STATUS_CONFIG: Record<NonNullable<WaitingStatusState>, StatusConfig> = {
  'witness-pending': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    bannerText: (p) => `Waiting for ${p} to feel heard.`,
  },
  'empathy-pending': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    bannerText: (p) => `Waiting for ${p} to share their perspective.`,
  },
  'partner-considering-perspective': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    bannerText: (p) => `${p} is now considering how you might feel.`,
  },
  'reconciler-analyzing': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    bannerText: () => `AI is analyzing your empathy match...`,
  },
  'awaiting-context-share': {
    showBanner: true,
    hideInput: false,
    showInnerThoughts: false,
    bannerText: () => `Review the suggestion below to help them understand you better.`,
  },
  'compact-pending': { showBanner: false, hideInput: false, showInnerThoughts: false },
  'needs-pending': { showBanner: true, hideInput: true, showInnerThoughts: false },
  'ranking-pending': { showBanner: true, hideInput: true, showInnerThoughts: false },
  'partner-signed': { showBanner: false, hideInput: false, showInnerThoughts: false },
  'partner-completed-witness': { showBanner: false, hideInput: false, showInnerThoughts: false },
  'partner-shared-empathy': { showBanner: false, hideInput: false, showInnerThoughts: false },
  'partner-confirmed-needs': { showBanner: false, hideInput: false, showInnerThoughts: false },
  'refining-empathy': { showBanner: false, hideInput: false, showInnerThoughts: false },
};

export const getStatusConfig = (status: WaitingStatusState): StatusConfig => {
  if (!status) return { showBanner: false, hideInput: false, showInnerThoughts: false };
  return WAITING_STATUS_CONFIG[status];
};
```

**Tasks:**
- [ ] Create `mobile/src/config/waitingStatusConfig.ts`
- [ ] Verify all `WaitingStatusState` values are covered in config
- [ ] Review `hideInput` values for each status (especially `awaiting-context-share`)

---

### Phase 3: Refactor useUnifiedSession Hook

**File:** `mobile/src/hooks/useUnifiedSession.ts`

**Changes:**
1. Remove existing `useEffect` chains for waiting status calculation
2. Add `useMemo` for derived status using `computeWaitingStatus`
3. Add minimal `useEffect` only for tracking `previousWaitingStatus`
4. Add `useMemo` for UI config using `getStatusConfig`
5. Return derived UI flags instead of raw status

```typescript
// Key changes in useUnifiedSession.ts

import { computeWaitingStatus } from '../utils/getWaitingStatus';
import { getStatusConfig } from '../config/waitingStatusConfig';

export function useUnifiedSession(sessionId: string | undefined) {
  // ... existing hook setup (queries, mutations) ...

  // 1. Track previous status for transition detection
  const [previousWaitingStatus, setPreviousWaitingStatus] = useState<WaitingStatusState>(null);

  // 2. Derive Current Status (pure computation)
  const waitingStatus = useMemo(() => {
    return computeWaitingStatus({
      myStage: myProgress?.stage,
      partnerStage: partnerProgress?.stage,
      previousStatus: previousWaitingStatus,
      empathyStatus: {
        analyzing: empathyStatusData?.analyzing,
        awaitingSharing: empathyStatusData?.awaitingSharing,
        hasNewSharedContext: empathyStatusData?.hasNewSharedContext,
        myAttemptStatus: empathyStatusData?.myAttempt?.status,
      },
      empathyDraft: { alreadyConsented: empathyDraftData?.alreadyConsented },
      partnerEmpathy: !!partnerEmpathy,
      shareOffer: { hasSuggestion: shareOfferData?.hasSuggestion },
      needs: { allConfirmed: allNeedsConfirmed },
      commonGround: { count: commonGround.length },
      strategyPhase,
      overlappingStrategies: { count: overlappingStrategies.length }
    });
  }, [
    myProgress?.stage, partnerProgress?.stage, previousWaitingStatus,
    empathyStatusData, empathyDraftData, partnerEmpathy,
    shareOfferData, allNeedsConfirmed, commonGround.length,
    strategyPhase, overlappingStrategies.length
  ]);

  // 3. Sync previous for next render (only side effect needed)
  useEffect(() => {
    if (waitingStatus !== previousWaitingStatus) {
      setPreviousWaitingStatus(waitingStatus);
    }
  }, [waitingStatus, previousWaitingStatus]);

  // 4. Derive UI Flags using config
  const statusConfig = useMemo(() => getStatusConfig(waitingStatus), [waitingStatus]);

  return {
    // ... other returns
    waitingStatus,

    // UI Convenience flags (derived from config)
    shouldShowWaitingBanner: statusConfig.showBanner,
    shouldHideInput: statusConfig.hideInput,
    shouldShowInnerThoughts: statusConfig.showInnerThoughts && currentStage >= Stage.PERSPECTIVE_STRETCH,

    // Banner text generator
    waitingBannerText: statusConfig.bannerText ? statusConfig.bannerText(partnerName) : undefined,
  };
}
```

**Tasks:**
- [ ] Identify and remove existing waiting status `useEffect` chains
- [ ] Add imports for new utility and config
- [ ] Add `previousWaitingStatus` state
- [ ] Add `waitingStatus` useMemo
- [ ] Add `previousWaitingStatus` sync useEffect
- [ ] Add `statusConfig` useMemo
- [ ] Update return object with derived UI flags
- [ ] Verify all required data is available for `computeWaitingStatus` inputs

---

### Phase 4: Update UnifiedSessionScreen

**File:** `mobile/src/screens/UnifiedSessionScreen.tsx`

**Changes:**
1. Consume new derived flags instead of checking status manually
2. Use `waitingBannerText` for banner content
3. Remove manual status checks for UI behavior

```typescript
const {
  waitingStatus,
  shouldShowWaitingBanner,
  shouldHideInput,
  waitingBannerText,
  // ... other hooks
} = useUnifiedSession(sessionId);

// Render Above Input
renderAboveInput={
  isInOnboardingUnsigned ? (
     // ... compact bar
  ) : shouldShowWaitingBanner ? () => (
    <Animated.View style={/* styles */}>
      <View style={styles.waitingBanner}>
        {waitingStatus === 'reconciler-analyzing' && <ActivityIndicator />}
        <Text style={styles.waitingBannerTextNormal}>
           {waitingBannerText}
        </Text>
        {/* Render specific actions based on status string if needed */}
      </View>
    </Animated.View>
  ) : null
}

hideInput={
  !shouldShowEmpathyPanel && shouldHideInput
}
```

**Tasks:**
- [ ] Update destructured values from `useUnifiedSession`
- [ ] Replace manual status checks with `shouldShowWaitingBanner`
- [ ] Replace manual hideInput logic with `shouldHideInput`
- [ ] Use `waitingBannerText` for banner content
- [ ] Keep `waitingStatus` checks only where specific status-dependent rendering is needed (e.g., ActivityIndicator for analyzing)

---

### Phase 5: Testing & Verification

**Tasks:**
- [ ] Write unit tests for `computeWaitingStatus`:
  - Test each priority path in isolation
  - Test priority ordering (higher priority overrides lower)
  - Test transition states with `previousStatus`
  - Test null returns for non-waiting states
- [ ] Write unit tests for `getStatusConfig`:
  - Test all status values return valid config
  - Test null status returns default config
- [ ] Integration testing:
  - [ ] Stage 1: Witness pending → partner completes
  - [ ] Stage 2: Empathy flows (analyzing, pending, context share)
  - [ ] Stage 3: Needs confirmation flow
  - [ ] Stage 4: Strategy ranking flow
- [ ] Run `npm run check` to verify types
- [ ] Run `npm run test` to verify all tests pass

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `mobile/src/utils/getWaitingStatus.ts` | Create | Pure status derivation function |
| `mobile/src/config/waitingStatusConfig.ts` | Create | UI behavior configuration |
| `mobile/src/hooks/useUnifiedSession.ts` | Modify | Replace useEffect with useMemo derivation |
| `mobile/src/screens/UnifiedSessionScreen.tsx` | Modify | Consume derived UI flags |
| `mobile/src/utils/__tests__/getWaitingStatus.test.ts` | Create | Unit tests for derivation |
| `mobile/src/config/__tests__/waitingStatusConfig.test.ts` | Create | Unit tests for config |

---

## Benefits Summary

| Problem | Solution |
|---------|----------|
| Scattered Logic | `WAITING_STATUS_CONFIG` centralizes all UI behavior rules |
| Easy to Break | `computeWaitingStatus` is pure and easily unit testable |
| Order-Dependent | Explicit priority logic with clear hierarchy in function |
| No Type Safety | TypeScript interfaces enforce input/output correctness |
| Mixed Concerns | Separation: Status Calculation / UI Behavior / Data Fetching |
| Complex Dependencies | `useMemo` handles dependency tracking; inputs are explicit |
