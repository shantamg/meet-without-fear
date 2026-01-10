/**
 * useChatUIState Hook
 *
 * Custom hook that computes the complete UI state for the chat screen
 * using pure derivation functions. This replaces scattered useEffect chains
 * with a single, testable computation.
 *
 * Usage:
 * ```tsx
 * const { uiState, updatePreviousStatus } = useChatUIState({
 *   // ...inputs from useUnifiedSession
 * });
 *
 * // Access derived values
 * uiState.aboveInputPanel // 'invitation' | 'empathy-statement' | 'waiting-banner' | etc.
 * uiState.shouldHideInput // boolean
 * uiState.waitingBannerText // string with partnerName interpolated
 * ```
 */

import { useMemo, useState, useEffect } from 'react';
import { Stage, SessionStatus, StrategyPhase } from '@meet-without-fear/shared';
import {
  computeChatUIState,
  ChatUIStateInputs,
  ChatUIState,
} from '../utils/chatUIState';
import { WaitingStatusState } from '../utils/getWaitingStatus';
import { getWaitingBannerText } from '../config/waitingStatusConfig';

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the useChatUIState hook.
 * These are the "raw" values from useUnifiedSession and component state.
 */
export interface UseChatUIStateProps {
  // Partner context (for banner text)
  partnerName: string;

  // Session context
  sessionStatus: SessionStatus | undefined;
  isInviter: boolean;

  // Loading states
  isLoading: boolean;
  loadingCompact: boolean;

  // Typewriter animation state
  isTypewriterAnimating: boolean;

  // Progress data
  myProgress: { stage: Stage } | undefined;
  partnerProgress: { stage: Stage } | undefined;

  // Compact state
  compactMySigned: boolean | undefined;

  // Invitation phase
  hasInvitationMessage: boolean;
  invitationConfirmed: boolean;
  isConfirmingInvitation: boolean;
  localInvitationConfirmed: boolean;

  // Stage 1: Feel heard
  showFeelHeardConfirmation: boolean;
  feelHeardConfirmedAt: string | null | undefined;
  isConfirmingFeelHeard: boolean;

  // Stage 2: Empathy
  empathyStatusData: {
    analyzing?: boolean;
    awaitingSharing?: boolean;
    hasNewSharedContext?: boolean;
    myAttempt?: { status?: string; content?: string };
    messageCountSinceSharedContext?: number;
  } | undefined;
  empathyDraftData: {
    alreadyConsented?: boolean;
    draft?: { content?: string };
  } | undefined;
  hasPartnerEmpathy: boolean;
  hasLiveProposedEmpathyStatement: boolean;
  hasSharedEmpathyLocal: boolean;

  // Stage 2: Share suggestion (Subject side)
  shareOfferData: {
    hasSuggestion?: boolean;
  } | undefined;
  hasRespondedToShareOfferLocal: boolean;

  // Stage 3: Needs
  allNeedsConfirmed: boolean;
  commonGroundCount: number;

  // Stage 4: Strategies
  strategyPhase: StrategyPhase | string;
  overlappingStrategiesCount: number;
}

/**
 * Return value from useChatUIState hook.
 */
export interface UseChatUIStateResult {
  /** Complete derived UI state */
  uiState: ChatUIState;

  /** Current waiting status (for backward compatibility) */
  waitingStatus: WaitingStatusState;

  /** Banner text with partner name interpolated */
  waitingBannerText: string | undefined;

  /** Whether waiting banner should show */
  shouldShowWaitingBanner: boolean;

  /** Whether to hide the input */
  shouldHideInput: boolean;

  /** Whether to show inner thoughts button */
  shouldShowInnerThoughts: boolean;

  /** Whether user is in onboarding with unsigned compact */
  isInOnboardingUnsigned: boolean;

  /** Which panel should show above input */
  aboveInputPanel: ChatUIState['aboveInputPanel'];

  /** Individual panel visibility (for specific panel logic) */
  panels: ChatUIState['panels'];
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Custom hook that computes chat UI state from session data.
 *
 * This hook:
 * 1. Maintains previousWaitingStatus state for transition detection
 * 2. Builds ChatUIStateInputs from props
 * 3. Calls computeChatUIState (pure function)
 * 4. Returns derived values with partner name interpolated
 */
export function useChatUIState(props: UseChatUIStateProps): UseChatUIStateResult {
  const {
    partnerName,
    sessionStatus,
    isInviter,
    isLoading,
    loadingCompact,
    isTypewriterAnimating,
    myProgress,
    partnerProgress,
    compactMySigned,
    hasInvitationMessage,
    invitationConfirmed,
    isConfirmingInvitation,
    localInvitationConfirmed,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt,
    isConfirmingFeelHeard,
    empathyStatusData,
    empathyDraftData,
    hasPartnerEmpathy,
    hasLiveProposedEmpathyStatement,
    hasSharedEmpathyLocal,
    shareOfferData,
    hasRespondedToShareOfferLocal,
    allNeedsConfirmed,
    commonGroundCount,
    strategyPhase,
    overlappingStrategiesCount,
  } = props;

  // Track previous waiting status for transition detection
  const [previousWaitingStatus, setPreviousWaitingStatus] = useState<WaitingStatusState>(null);

  // Build inputs for the pure computation function
  const inputs: ChatUIStateInputs = useMemo(() => ({
    // WaitingStatusInputs
    myStage: myProgress?.stage,
    partnerStage: partnerProgress?.stage,
    previousStatus: previousWaitingStatus,
    empathyStatus: empathyStatusData ? {
      analyzing: empathyStatusData.analyzing,
      awaitingSharing: empathyStatusData.awaitingSharing,
      hasNewSharedContext: empathyStatusData.hasNewSharedContext,
      myAttemptStatus: empathyStatusData.myAttempt?.status,
    } : undefined,
    empathyDraft: empathyDraftData ? {
      alreadyConsented: empathyDraftData.alreadyConsented,
    } : undefined,
    hasPartnerEmpathy,
    shareOffer: shareOfferData ? {
      hasSuggestion: shareOfferData.hasSuggestion,
    } : undefined,
    needs: { allConfirmed: allNeedsConfirmed },
    commonGround: { count: commonGroundCount },
    strategyPhase,
    overlappingStrategies: { count: overlappingStrategiesCount },

    // ChatUIStateInputs
    sessionStatus,
    isInviter,
    isLoading,
    loadingCompact,
    isTypewriterAnimating,
    compactMySigned,
    myProgress,
    hasInvitationMessage,
    invitationConfirmed,
    isConfirmingInvitation,
    localInvitationConfirmed,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt,
    isConfirmingFeelHeard,
    hasEmpathyContent: hasLiveProposedEmpathyStatement || !!empathyDraftData?.draft?.content,
    empathyAlreadyConsented: empathyDraftData?.alreadyConsented ?? false,
    hasSharedEmpathyLocal,
    isRefiningEmpathy: empathyStatusData?.hasNewSharedContext ?? false,
    messageCountSinceSharedContext: empathyStatusData?.messageCountSinceSharedContext ?? 0,
    myAttemptContent: !!empathyStatusData?.myAttempt?.content,
    hasShareSuggestion: shareOfferData?.hasSuggestion ?? false,
    hasRespondedToShareOfferLocal,
  }), [
    myProgress?.stage,
    partnerProgress?.stage,
    previousWaitingStatus,
    empathyStatusData,
    empathyDraftData,
    hasPartnerEmpathy,
    shareOfferData,
    allNeedsConfirmed,
    commonGroundCount,
    strategyPhase,
    overlappingStrategiesCount,
    sessionStatus,
    isInviter,
    isLoading,
    loadingCompact,
    isTypewriterAnimating,
    compactMySigned,
    myProgress,
    hasInvitationMessage,
    invitationConfirmed,
    isConfirmingInvitation,
    localInvitationConfirmed,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt,
    isConfirmingFeelHeard,
    hasLiveProposedEmpathyStatement,
    hasSharedEmpathyLocal,
    hasRespondedToShareOfferLocal,
  ]);

  // Compute the complete UI state using the pure function
  const uiState = useMemo(() => computeChatUIState(inputs), [inputs]);

  // Sync previous waiting status for next render (only side effect needed)
  useEffect(() => {
    if (uiState.waitingStatus !== previousWaitingStatus) {
      setPreviousWaitingStatus(uiState.waitingStatus);
    }
  }, [uiState.waitingStatus, previousWaitingStatus]);

  // Compute banner text with actual partner name
  const waitingBannerText = useMemo(() => {
    return getWaitingBannerText(uiState.waitingStatus, partnerName);
  }, [uiState.waitingStatus, partnerName]);

  return {
    uiState,
    waitingStatus: uiState.waitingStatus,
    waitingBannerText,
    shouldShowWaitingBanner: uiState.panels.showWaitingBanner,
    shouldHideInput: uiState.shouldHideInput,
    shouldShowInnerThoughts: uiState.shouldShowInnerThoughts,
    isInOnboardingUnsigned: uiState.isInOnboardingUnsigned,
    aboveInputPanel: uiState.aboveInputPanel,
    panels: uiState.panels,
  };
}
