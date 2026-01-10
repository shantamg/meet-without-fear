/**
 * chatUIState.ts
 *
 * Pure derivation functions for computing the complete UI state of the chat screen.
 * This expands beyond waiting status to include ALL dynamic UI elements:
 * - Invitation panel
 * - Empathy statement panel
 * - Feel-heard confirmation
 * - Share suggestion panel
 * - Waiting banners
 * - Input visibility
 * - Inner thoughts button
 *
 * The goal is to have a single, testable, pure function that computes
 * exactly what UI elements should be visible given the current state.
 */

import { Stage, SessionStatus } from '@meet-without-fear/shared';
import { WaitingStatusState, computeWaitingStatus, WaitingStatusInputs } from './getWaitingStatus';
import { getWaitingStatusConfig, WaitingStatusConfig } from '../config/waitingStatusConfig';

// ============================================================================
// Types
// ============================================================================

/**
 * All possible above-input panels that can be shown.
 * Only ONE panel can be shown at a time - this defines priority.
 */
export type AboveInputPanel =
  | 'invitation' // Invitation share panel for inviters
  | 'empathy-statement' // Empathy statement review panel
  | 'feel-heard' // Feel heard confirmation panel
  | 'share-suggestion' // Share suggestion from reconciler (Subject side)
  | 'waiting-banner' // General waiting banner
  | 'compact-agreement-bar' // Compact agreement bar during onboarding
  | null;

/**
 * Input state for computing chat UI.
 * All values should be derived from React Query cache or component state.
 */
export interface ChatUIStateInputs extends WaitingStatusInputs {
  // Session context
  sessionStatus: SessionStatus | undefined;
  isInviter: boolean;

  // Loading states
  isLoading: boolean;
  loadingCompact: boolean;

  // Typewriter animation state
  isTypewriterAnimating: boolean;

  // Onboarding state
  compactMySigned: boolean | undefined;
  myProgress: { stage: Stage } | undefined;

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
  hasEmpathyContent: boolean; // liveProposedEmpathyStatement || empathyDraftData?.draft?.content
  empathyAlreadyConsented: boolean;
  hasSharedEmpathyLocal: boolean; // Local latch to prevent flash

  // Empathy refining mode (received shared context)
  isRefiningEmpathy: boolean;
  messageCountSinceSharedContext: number;
  myAttemptContent: boolean;

  // Share suggestion (Subject side)
  hasShareSuggestion: boolean;
  hasRespondedToShareOfferLocal: boolean;
}

/**
 * Complete derived UI state for the chat screen.
 */
export interface ChatUIState {
  // Core waiting status
  waitingStatus: WaitingStatusState;
  waitingStatusConfig: WaitingStatusConfig;

  // Which panel to show above input (only one at a time)
  aboveInputPanel: AboveInputPanel;

  // Whether the panel should animate (wait for typewriter)
  shouldAnimatePanel: boolean;

  // Input visibility
  shouldHideInput: boolean;

  // Inner thoughts button
  shouldShowInnerThoughts: boolean;

  // Specific panel visibility (for debugging/testing)
  panels: {
    showInvitationPanel: boolean;
    showEmpathyPanel: boolean;
    showFeelHeardPanel: boolean;
    showShareSuggestionPanel: boolean;
    showWaitingBanner: boolean;
    showCompactAgreementBar: boolean;
  };

  // Banner text (if waiting banner is shown)
  waitingBannerText: string | undefined;

  // Whether the user is in onboarding with unsigned compact
  isInOnboardingUnsigned: boolean;
}

// ============================================================================
// Priority Order for Above-Input Panels
// ============================================================================

/**
 * Panel priority order (highest priority first):
 *
 * 1. Compact Agreement Bar - During onboarding, must sign compact first
 * 2. Invitation Panel - After signing, must craft and send invitation
 * 3. Feel Heard Panel - Stage 1 completion requires feeling heard
 * 4. Share Suggestion Panel - Subject must respond to share suggestion
 * 5. Empathy Statement Panel - User's empathy statement to review
 * 6. Waiting Banner - Any waiting status
 */

// ============================================================================
// Pure Derivation Functions
// ============================================================================

/**
 * Determines if user is in onboarding with unsigned compact.
 */
function computeIsInOnboardingUnsigned(inputs: ChatUIStateInputs): boolean {
  const { compactMySigned, isLoading, myProgress } = inputs;

  // If compact is already signed, not in onboarding
  if (compactMySigned) {
    return false;
  }

  // If loading and no progress data, optimistically show compact (for invitees)
  if (isLoading && !myProgress) {
    return true;
  }

  // Check stage - ONBOARDING means compact not signed
  const currentStage = myProgress?.stage ?? Stage.ONBOARDING;
  return currentStage === Stage.ONBOARDING && !compactMySigned;
}

/**
 * Determines if invitation panel should show.
 */
function computeShowInvitationPanel(inputs: ChatUIStateInputs): boolean {
  const {
    isInviter,
    hasInvitationMessage,
    invitationConfirmed,
    isConfirmingInvitation,
    localInvitationConfirmed,
  } = inputs;

  return !!(
    isInviter &&
    hasInvitationMessage &&
    !invitationConfirmed &&
    !isConfirmingInvitation &&
    !localInvitationConfirmed
  );
}

/**
 * Determines if empathy statement panel should show.
 */
function computeShowEmpathyPanel(inputs: ChatUIStateInputs): boolean {
  const {
    myStage,
    hasEmpathyContent,
    empathyAlreadyConsented,
    hasSharedEmpathyLocal,
    isRefiningEmpathy,
    messageCountSinceSharedContext,
    myAttemptContent,
  } = inputs;

  const currentStage = myStage ?? Stage.ONBOARDING;

  // Local latch: Once user clicks Share, never show panel again (prevents flash during refetch)
  // EXCEPT when we're in refining mode, then we need to show it again
  if (hasSharedEmpathyLocal && !isRefiningEmpathy) {
    return false;
  }

  // Must be in Stage 2
  if (currentStage !== Stage.PERSPECTIVE_STRETCH) {
    return false;
  }

  // If already consented and not refining, don't show
  if (empathyAlreadyConsented && !isRefiningEmpathy) {
    return false;
  }

  // When refining (received shared context from partner), require at least 1 message
  // before showing the "Revisit what you'll share" button.
  // EXCEPTION: If AI just returned a proposedEmpathyStatement (hasEmpathyContent from live state),
  // show the panel immediately - the AI response proves user already sent a message,
  // even if empathyStatusData.messageCountSinceSharedContext hasn't refetched yet.
  if (isRefiningEmpathy && messageCountSinceSharedContext < 1 && !hasEmpathyContent) {
    return false;
  }

  // Must have content to show (from AI, draft, or refining)
  const hasContent = hasEmpathyContent || (isRefiningEmpathy && myAttemptContent);
  return hasContent;
}

/**
 * Determines if feel heard confirmation panel should show.
 */
function computeShowFeelHeardPanel(inputs: ChatUIStateInputs): boolean {
  const {
    myStage,
    showFeelHeardConfirmation,
    feelHeardConfirmedAt,
    isConfirmingFeelHeard,
  } = inputs;

  const currentStage = myStage ?? Stage.ONBOARDING;

  return !!(
    currentStage === Stage.WITNESS &&
    showFeelHeardConfirmation &&
    !feelHeardConfirmedAt &&
    !isConfirmingFeelHeard
  );
}

/**
 * Determines if share suggestion panel should show.
 */
function computeShowShareSuggestionPanel(inputs: ChatUIStateInputs): boolean {
  const { hasShareSuggestion, hasRespondedToShareOfferLocal } = inputs;

  return hasShareSuggestion && !hasRespondedToShareOfferLocal;
}

/**
 * Determines which waiting statuses should show a banner.
 */
function computeShouldShowWaitingBanner(status: WaitingStatusState): boolean {
  return (
    status === 'witness-pending' ||
    status === 'empathy-pending' ||
    status === 'partner-considering-perspective' ||
    status === 'reconciler-analyzing' ||
    status === 'awaiting-context-share'
  );
}

/**
 * Computes which panel should be shown above the input.
 * Only one panel can be shown at a time - this enforces priority.
 */
function computeAboveInputPanel(
  _inputs: ChatUIStateInputs,
  panels: ChatUIState['panels']
): AboveInputPanel {
  // Priority 1: Compact agreement bar (during onboarding)
  if (panels.showCompactAgreementBar) {
    return 'compact-agreement-bar';
  }

  // Priority 2: Invitation panel (after signing, before sending invite)
  if (panels.showInvitationPanel) {
    return 'invitation';
  }

  // Priority 3: Feel heard panel (Stage 1)
  if (panels.showFeelHeardPanel) {
    return 'feel-heard';
  }

  // Priority 4: Share suggestion panel (Subject side in Stage 2)
  if (panels.showShareSuggestionPanel) {
    return 'share-suggestion';
  }

  // Priority 5: Empathy statement panel (Stage 2)
  if (panels.showEmpathyPanel) {
    return 'empathy-statement';
  }

  // Priority 6: Waiting banner
  if (panels.showWaitingBanner) {
    return 'waiting-banner';
  }

  return null;
}

/**
 * Computes whether inner thoughts button should show.
 */
function computeShouldShowInnerThoughts(
  inputs: ChatUIStateInputs,
  waitingStatus: WaitingStatusState
): boolean {
  const { myStage } = inputs;
  const currentStage = myStage ?? Stage.ONBOARDING;

  // Show if stage 2 is completed (we're in stage 3 or 4)
  if (currentStage > Stage.PERSPECTIVE_STRETCH) {
    return true;
  }

  // Show if in stage 2 and waiting for partner
  if (
    currentStage === Stage.PERSPECTIVE_STRETCH &&
    (waitingStatus === 'witness-pending' ||
      waitingStatus === 'empathy-pending' ||
      waitingStatus === 'partner-considering-perspective')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes whether the input should be hidden.
 */
function computeShouldHideInput(
  waitingStatusConfig: WaitingStatusConfig,
  aboveInputPanel: AboveInputPanel,
  inputs: ChatUIStateInputs
): boolean {
  // If waiting status says hide input, hide it
  if (waitingStatusConfig.hideInput) {
    return true;
  }

  // During onboarding (compact agreement bar), input is hidden
  if (aboveInputPanel === 'compact-agreement-bar') {
    return true;
  }

  // Safety: In Stage 2, if empathy data is still loading (undefined),
  // hide input conservatively to avoid showing input when we shouldn't.
  // This prevents the flash of input on initial load before data arrives.
  // Exception: if there's a share suggestion, user CAN chat to respond.
  const currentStage = inputs.myStage ?? Stage.ONBOARDING;
  const hasShareSuggestion = inputs.shareOffer?.hasSuggestion === true;
  if (
    currentStage === Stage.PERSPECTIVE_STRETCH &&
    inputs.empathyDraft === undefined &&
    inputs.empathyStatus === undefined &&
    !hasShareSuggestion
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Main Derivation Function
// ============================================================================

/**
 * Computes the complete UI state for the chat screen.
 *
 * This is a pure function that takes a snapshot of all relevant state
 * and returns exactly what should be rendered. No side effects.
 *
 * @param inputs - Current state snapshot from hooks and queries
 * @returns Complete derived UI state
 */
export function computeChatUIState(inputs: ChatUIStateInputs): ChatUIState {
  // Step 1: Compute waiting status
  const waitingStatus = computeWaitingStatus(inputs);
  const waitingStatusConfig = getWaitingStatusConfig(waitingStatus);

  // Step 2: Compute isInOnboardingUnsigned
  const isInOnboardingUnsigned = computeIsInOnboardingUnsigned(inputs);

  // Step 3: Compute individual panel visibility
  const showInvitationPanel = computeShowInvitationPanel(inputs);
  const showEmpathyPanel = computeShowEmpathyPanel(inputs);
  const showFeelHeardPanel = computeShowFeelHeardPanel(inputs);
  const showShareSuggestionPanel = computeShowShareSuggestionPanel(inputs);
  const showWaitingBanner = computeShouldShowWaitingBanner(waitingStatus);
  const showCompactAgreementBar = isInOnboardingUnsigned;

  const panels = {
    showInvitationPanel,
    showEmpathyPanel,
    showFeelHeardPanel,
    showShareSuggestionPanel,
    showWaitingBanner,
    showCompactAgreementBar,
  };

  // Step 4: Determine which single panel to show (priority)
  const aboveInputPanel = computeAboveInputPanel(inputs, panels);

  // Step 5: Determine if panel should animate (wait for typewriter)
  const shouldAnimatePanel = !inputs.isTypewriterAnimating;

  // Step 6: Compute input visibility
  const shouldHideInput = computeShouldHideInput(waitingStatusConfig, aboveInputPanel, inputs);

  // Step 7: Compute inner thoughts visibility
  const shouldShowInnerThoughts = computeShouldShowInnerThoughts(inputs, waitingStatus);

  // Step 8: Compute banner text
  const waitingBannerText = waitingStatusConfig.bannerText?.(
    'Partner' // This will be replaced with actual partner name in the hook
  );

  return {
    waitingStatus,
    waitingStatusConfig,
    aboveInputPanel,
    shouldAnimatePanel,
    shouldHideInput,
    shouldShowInnerThoughts,
    panels,
    waitingBannerText,
    isInOnboardingUnsigned,
  };
}

/**
 * Creates default inputs for when data is loading or unavailable.
 * Useful for initial render before data loads.
 */
export function createDefaultChatUIStateInputs(): ChatUIStateInputs {
  return {
    // WaitingStatusInputs
    myStage: Stage.ONBOARDING,
    partnerStage: undefined,
    previousStatus: null,
    empathyStatus: undefined,
    empathyDraft: undefined,
    hasPartnerEmpathy: false,
    shareOffer: undefined,
    needs: { allConfirmed: false },
    commonGround: { count: 0 },
    strategyPhase: 'COLLECTING',
    overlappingStrategies: { count: 0 },

    // ChatUIStateInputs
    sessionStatus: undefined,
    isInviter: true,
    isLoading: true,
    loadingCompact: true,
    isTypewriterAnimating: false,
    compactMySigned: undefined,
    myProgress: undefined,
    hasInvitationMessage: false,
    invitationConfirmed: false,
    isConfirmingInvitation: false,
    localInvitationConfirmed: false,
    showFeelHeardConfirmation: false,
    feelHeardConfirmedAt: undefined,
    isConfirmingFeelHeard: false,
    hasEmpathyContent: false,
    empathyAlreadyConsented: false,
    hasSharedEmpathyLocal: false,
    isRefiningEmpathy: false,
    messageCountSinceSharedContext: 0,
    myAttemptContent: false,
    hasShareSuggestion: false,
    hasRespondedToShareOfferLocal: false,
  };
}
