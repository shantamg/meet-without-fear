/**
 * getWaitingStatus.ts
 *
 * Pure derivation function for computing waiting status from session state.
 * This replaces the imperative useEffect-based status watching with a
 * declarative, testable computation.
 */

import { Stage, StrategyPhase } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * All possible waiting status states across the session lifecycle.
 * null means no waiting status is active.
 */
export type WaitingStatusState =
  | 'compact-pending' // Stage 0: Waiting for partner to sign compact
  | 'witness-pending' // Stage 1: Waiting for partner to complete witness
  | 'empathy-pending' // Stage 2: Waiting for partner to share empathy
  | 'partner-considering-perspective' // Stage 2: Partner felt heard, now building empathy for you (good alignment)
  | 'needs-pending' // Stage 3: Waiting for partner to confirm needs
  | 'ranking-pending' // Stage 4: Waiting for partner to submit ranking
  | 'partner-signed' // Partner has signed compact (transient)
  | 'partner-completed-witness' // Partner completed witness stage (transient)
  | 'partner-shared-empathy' // Partner shared their empathy attempt (transient)
  | 'partner-confirmed-needs' // Partner confirmed their needs (transient)
  | 'reconciler-analyzing' // Reconciler is analyzing empathy (first time)
  | 'revision-analyzing' // Reconciler is re-analyzing revised empathy (no spinner, same as first share UI)
  | 'awaiting-context-share' // Waiting for user to share context (Subject side - OFFER_SHARING)
  | 'awaiting-context-share-optional' // Waiting for user to share context (Subject side - OFFER_OPTIONAL)
  | 'awaiting-subject-decision' // Guesser waiting for subject to decide whether to share
  | 'subject-skipped-sharing' // Subject declined sharing (transient)
  | 'empathy-proceed' // Empathy match is good, no sharing needed (PROCEED)
  | 'refining-empathy' // Guesser is refining empathy after receiving shared context
  | null;

/**
 * Input data structure for computing waiting status.
 * All values should be derived from React Query cache or component state.
 */
export interface WaitingStatusInputs {
  // Stage progress
  myStage: Stage | undefined;
  partnerStage: Stage | undefined;

  // Previous status for transition detection
  previousStatus: WaitingStatusState;

  // Stage 2: Empathy status from reconciler
  empathyStatus: {
    analyzing?: boolean;
    awaitingSharing?: boolean;
    hasNewSharedContext?: boolean;
    myAttemptStatus?: string; // 'REVEALED', 'NEEDS_WORK', etc.
    myAttemptRevisionCount?: number; // Number of times empathy was revised
  } | undefined;

  // Stage 2: Empathy draft state
  empathyDraft: {
    alreadyConsented?: boolean;
  } | undefined;

  // Stage 2: Whether we have partner's empathy attempt for us
  hasPartnerEmpathy: boolean;

  // Stage 2: Share offer from reconciler (Subject side)
  shareOffer: {
    hasSuggestion?: boolean;
  } | undefined;

  // Stage 3: Needs confirmation state
  needs: {
    allConfirmed: boolean;
  };

  // Stage 3: Common ground discovery
  commonGround: {
    count: number;
  };

  // Stage 4: Strategy phase and overlap
  strategyPhase: StrategyPhase | string;
  overlappingStrategies: {
    count: number;
  };
}

// ============================================================================
// Pure Derivation Function
// ============================================================================

/**
 * Computes the current waiting status from session state.
 *
 * This is a pure function with explicit priority ordering:
 * 1. User Action Required (overrides waiting - user should act, not wait)
 * 2. Stage 2 Reconciler States (analyzing, context sharing)
 * 3. Stage-based Waiting States (witness, empathy, needs, ranking)
 * 4. Transition States (partner just completed something)
 *
 * @param inputs - Current session state snapshot
 * @returns The computed waiting status, or null if no waiting state applies
 */
export function computeWaitingStatus(inputs: WaitingStatusInputs): WaitingStatusState {
  const {
    myStage,
    partnerStage,
    previousStatus,
    empathyStatus,
    empathyDraft,
    hasPartnerEmpathy,
    shareOffer,
    needs,
    commonGround,
    strategyPhase,
    overlappingStrategies,
  } = inputs;

  // --- Priority 1: User Action Required (Overrides waiting) ---

  // If user received new context, they must act (refine), so no waiting banner.
  // The user can chat immediately after receiving shared context.
  if (empathyStatus?.hasNewSharedContext) {
    return null;
  }

  // --- Priority 2: Stage 2 Reconciler States (highest priority among waiting) ---

  // Reconciler is running
  if (empathyStatus?.analyzing) {
    // For revisions (revisionCount > 0), use a different status with no spinner
    if (empathyStatus.myAttemptRevisionCount && empathyStatus.myAttemptRevisionCount > 0) {
      return 'revision-analyzing';
    }
    return 'reconciler-analyzing';
  }

  // User needs to respond to share suggestion (Subject side)
  // This takes priority over other waiting states, but only during Stage 2
  if (shareOffer?.hasSuggestion && myStage === Stage.PERSPECTIVE_STRETCH) {
    return 'awaiting-context-share';
  }

  // --- Priority 3: Stage 1 (Witness) ---

  // Only show witness-pending AFTER user has shared their empathy
  // Before sharing, user should be able to work on their empathy draft without waiting
  if (
    myStage === Stage.PERSPECTIVE_STRETCH &&
    partnerStage === Stage.WITNESS &&
    empathyDraft?.alreadyConsented
  ) {
    return 'witness-pending';
  }

  // Transition: Partner just completed witness
  if (
    myStage === Stage.PERSPECTIVE_STRETCH &&
    partnerStage === Stage.PERSPECTIVE_STRETCH &&
    previousStatus === 'witness-pending'
  ) {
    return 'partner-completed-witness';
  }

  // --- Priority 4: Stage 2 (Empathy) ---

  // Guesser waiting for Subject to decide on sharing (Guesser side)
  // This happens when reconciler found gaps and is waiting for subject response
  if (empathyStatus?.awaitingSharing && !empathyStatus?.hasNewSharedContext) {
    return 'awaiting-subject-decision';
  }

  // Good alignment: User's empathy is READY (or REVEALED), partner is working on their empathy for us.
  // READY means the asymmetric reconciler has analyzed the guesser's empathy and approved it,
  // but the partner hasn't shared their own empathy yet.
  // REVEALED means both are ready and empathy has been revealed (brief transient state).
  if (
    (empathyStatus?.myAttemptStatus === 'READY' || empathyStatus?.myAttemptStatus === 'REVEALED') &&
    !hasPartnerEmpathy &&
    !empathyStatus?.analyzing
  ) {
    return 'partner-considering-perspective';
  }

  // Standard waiting for partner to share empathy
  // User has consented but partner hasn't shared yet
  if (
    empathyDraft?.alreadyConsented &&
    !hasPartnerEmpathy &&
    !empathyStatus?.analyzing &&
    !empathyStatus?.awaitingSharing
  ) {
    return 'empathy-pending';
  }

  // Transition: Partner just shared their empathy
  if (hasPartnerEmpathy && previousStatus === 'empathy-pending') {
    return 'partner-shared-empathy';
  }

  // --- Priority 5: Stage 3 (Needs) ---
  // Only show needs-pending when in Stage 3, needs confirmed, and no common ground yet
  if (myStage === Stage.NEED_MAPPING && needs.allConfirmed && commonGround.count === 0) {
    return 'needs-pending';
  }

  // Transition: Partner confirmed needs and common ground discovered
  if (commonGround.count > 0 && previousStatus === 'needs-pending') {
    return 'partner-confirmed-needs';
  }

  // --- Priority 6: Stage 4 (Strategies) ---

  if (strategyPhase === StrategyPhase.REVEALING && overlappingStrategies.count === 0) {
    return 'ranking-pending';
  }

  // No waiting status applies
  return null;
}
