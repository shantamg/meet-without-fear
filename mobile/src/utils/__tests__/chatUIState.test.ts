/**
 * Tests for chatUIState.ts
 *
 * Tests the pure derivation function that computes complete chat UI state
 * from session data. This includes panel visibility, input hiding, and more.
 */

import { Stage } from '@meet-without-fear/shared';
import {
  computeChatUIState,
  ChatUIStateInputs,
  createDefaultChatUIStateInputs,
} from '../chatUIState';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates inputs with sensible defaults that can be overridden.
 */
function createInputs(overrides: Partial<ChatUIStateInputs> = {}): ChatUIStateInputs {
  return {
    ...createDefaultChatUIStateInputs(),
    isLoading: false,
    loadingCompact: false,
    ...overrides,
  };
}

// ============================================================================
// Onboarding State Tests
// ============================================================================

describe('Onboarding State (isInOnboardingUnsigned)', () => {
  it('returns true when compact not signed and stage is ONBOARDING', () => {
    const inputs = createInputs({
      myStage: Stage.ONBOARDING,
      compactMySigned: false,
      myProgress: { stage: Stage.ONBOARDING },
    });

    const result = computeChatUIState(inputs);
    expect(result.isInOnboardingUnsigned).toBe(true);
  });

  it('returns false when compact is signed', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
    });

    const result = computeChatUIState(inputs);
    expect(result.isInOnboardingUnsigned).toBe(false);
  });

  it('returns true when loading with no progress data (optimistic for invitees)', () => {
    const inputs = createInputs({
      isLoading: true,
      myProgress: undefined,
      compactMySigned: undefined,
    });

    const result = computeChatUIState(inputs);
    expect(result.isInOnboardingUnsigned).toBe(true);
  });
});

// ============================================================================
// Panel Priority Tests
// ============================================================================

describe('Above Input Panel Priority', () => {
  it('shows compact-agreement-bar during onboarding', () => {
    const inputs = createInputs({
      myStage: Stage.ONBOARDING,
      compactMySigned: false,
      myProgress: { stage: Stage.ONBOARDING },
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('compact-agreement-bar');
  });

  it('shows invitation panel for inviter with unconfirmed message', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      isInviter: true,
      hasInvitationMessage: true,
      invitationConfirmed: false,
      isConfirmingInvitation: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('invitation');
  });

  it('does not show invitation panel for invitee', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      isInviter: false,
      hasInvitationMessage: true,
      invitationConfirmed: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).not.toBe('invitation');
  });

  it('shows feel-heard panel in Stage 1 when confirmation offered', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      showFeelHeardConfirmation: true,
      feelHeardConfirmedAt: null,
      isConfirmingFeelHeard: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('feel-heard');
  });

  it('does not show feel-heard panel in Stage 2', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      showFeelHeardConfirmation: true,
      feelHeardConfirmedAt: null,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).not.toBe('feel-heard');
  });

  it('shows share-suggestion panel when Subject has suggestion', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasShareSuggestion: true,
      hasRespondedToShareOfferLocal: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('share-suggestion');
  });

  it('shows empathy-statement panel when user has content to review', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasEmpathyContent: true,
      empathyAlreadyConsented: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('empathy-statement');
  });

  it('shows waiting-banner when waiting for partner', () => {
    // witness-pending only shows after user has consented to share empathy
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      empathyDraft: { alreadyConsented: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('waiting-banner');
  });

  it('invitation panel takes priority over feel-heard panel', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      isInviter: true,
      hasInvitationMessage: true,
      invitationConfirmed: false,
      showFeelHeardConfirmation: true,
      feelHeardConfirmedAt: null,
    });

    const result = computeChatUIState(inputs);
    expect(result.aboveInputPanel).toBe('invitation');
  });
});

// ============================================================================
// Input Hiding Tests
// ============================================================================

describe('Input Hiding (shouldHideInput)', () => {
  it('hides input during onboarding', () => {
    const inputs = createInputs({
      myStage: Stage.ONBOARDING,
      compactMySigned: false,
      myProgress: { stage: Stage.ONBOARDING },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldHideInput).toBe(true);
  });

  it('hides input when waiting for partner in Stage 1', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldHideInput).toBe(true);
  });

  it('shows input when awaiting-context-share (user can still chat)', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      shareOffer: { hasSuggestion: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldHideInput).toBe(false);
  });

  it('shows input during normal conversation', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      partnerStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldHideInput).toBe(false);
  });
});

// ============================================================================
// Inner Thoughts Button Tests
// ============================================================================

describe('Inner Thoughts Button (shouldShowInnerThoughts)', () => {
  it('shows inner thoughts in Stage 3', () => {
    const inputs = createInputs({
      myStage: Stage.NEED_MAPPING,
      compactMySigned: true,
      myProgress: { stage: Stage.NEED_MAPPING },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldShowInnerThoughts).toBe(true);
  });

  it('shows inner thoughts in Stage 4', () => {
    const inputs = createInputs({
      myStage: Stage.STRATEGIC_REPAIR,
      compactMySigned: true,
      myProgress: { stage: Stage.STRATEGIC_REPAIR },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldShowInnerThoughts).toBe(true);
  });

  it('shows inner thoughts when waiting for partner in Stage 2 (witness-pending)', () => {
    // witness-pending only shows after user has consented to share empathy
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      empathyDraft: { alreadyConsented: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldShowInnerThoughts).toBe(true);
  });

  it('shows inner thoughts when partner-considering-perspective', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      empathyStatus: { myAttemptStatus: 'REVEALED' },
      hasPartnerEmpathy: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldShowInnerThoughts).toBe(true);
  });

  it('does not show inner thoughts in Stage 1', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldShowInnerThoughts).toBe(false);
  });
});

// ============================================================================
// Empathy Panel Logic Tests
// ============================================================================

describe('Empathy Panel Visibility', () => {
  it('does not show in Stage 1', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      hasEmpathyContent: true,
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(false);
  });

  it('shows in Stage 2 with content', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasEmpathyContent: true,
      empathyAlreadyConsented: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(true);
  });

  it('does not show after user has already consented', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasEmpathyContent: true,
      empathyAlreadyConsented: true,
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(false);
  });

  it('does not show when hasSharedEmpathyLocal is true (prevents flash)', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasEmpathyContent: true,
      hasSharedEmpathyLocal: true,
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(false);
  });

  it('does not show when hasSharedEmpathyLocal is true even in refining mode', () => {
    // After user shares revised empathy from refining mode, panel should hide
    // The latch is reset when entering refining mode, but once user shares, it stays hidden
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      hasEmpathyContent: true,
      hasSharedEmpathyLocal: true,
      isRefiningEmpathy: true,
      messageCountSinceSharedContext: 1,
      empathyStatus: { hasNewSharedContext: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(false);
  });

  it('shows in refining mode with at least 1 message sent', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      isRefiningEmpathy: true,
      messageCountSinceSharedContext: 1,
      myAttemptContent: true,
      empathyStatus: { hasNewSharedContext: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(true);
  });

  it('does not show in refining mode before user sends message', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      isRefiningEmpathy: true,
      messageCountSinceSharedContext: 0,
      myAttemptContent: true,
      empathyStatus: { hasNewSharedContext: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(false);
  });

  it('shows in refining mode when AI returns proposedEmpathyStatement even with stale messageCount', () => {
    // When AI returns a proposedEmpathyStatement, the panel should show immediately
    // even if empathyStatusData.messageCountSinceSharedContext hasn't refetched yet.
    // The AI response proves the user already sent a message.
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      isRefiningEmpathy: true,
      messageCountSinceSharedContext: 0, // Stale - hasn't refetched yet
      hasEmpathyContent: true, // AI just returned proposedEmpathyStatement
      empathyStatus: { hasNewSharedContext: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.panels.showEmpathyPanel).toBe(true);
  });
});

// ============================================================================
// Waiting Status Integration Tests
// ============================================================================

describe('Waiting Status Integration', () => {
  it('correctly computes waiting status from inputs', () => {
    // witness-pending only shows after user has consented to share empathy
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      partnerStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      empathyDraft: { alreadyConsented: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.waitingStatus).toBe('witness-pending');
  });

  it('includes spinner info in config for reconciler-analyzing', () => {
    const inputs = createInputs({
      myStage: Stage.PERSPECTIVE_STRETCH,
      compactMySigned: true,
      myProgress: { stage: Stage.PERSPECTIVE_STRETCH },
      empathyStatus: { analyzing: true },
    });

    const result = computeChatUIState(inputs);
    expect(result.waitingStatus).toBe('reconciler-analyzing');
    expect(result.waitingStatusConfig.showSpinner).toBe(true);
  });
});

// ============================================================================
// Typewriter Animation Integration
// ============================================================================

describe('Typewriter Animation Integration', () => {
  it('shouldAnimatePanel is false when typewriter is animating', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      isTypewriterAnimating: true,
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldAnimatePanel).toBe(false);
  });

  it('shouldAnimatePanel is true when typewriter is not animating', () => {
    const inputs = createInputs({
      myStage: Stage.WITNESS,
      compactMySigned: true,
      myProgress: { stage: Stage.WITNESS },
      isTypewriterAnimating: false,
    });

    const result = computeChatUIState(inputs);
    expect(result.shouldAnimatePanel).toBe(true);
  });
});
