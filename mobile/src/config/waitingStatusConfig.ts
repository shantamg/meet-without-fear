/**
 * waitingStatusConfig.ts
 *
 * UI behavior configuration for waiting status states.
 * Maps each waiting status to its UI presentation (banner text, input visibility, etc.)
 */

import { WaitingStatusState } from '../utils/getWaitingStatus';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for how a waiting status affects the UI.
 */
export interface WaitingStatusConfig {
  /** Whether to show the waiting banner above input */
  showBanner: boolean;
  /** Whether to hide the chat input while in this state */
  hideInput: boolean;
  /** Whether to show inner thoughts button in this state */
  showInnerThoughts: boolean;
  /** Whether this is an action-required state (user must do something) */
  isActionRequired: boolean;
  /** Whether to show a loading spinner in the banner */
  showSpinner: boolean;
  /** Banner text generator (if showBanner is true) */
  bannerText?: (partnerName: string) => string;
  /** Optional secondary text below the main banner text */
  bannerSubtext?: string;
  /** Whether to show "Keep Chatting" action button */
  showKeepChattingAction: boolean;
}

// ============================================================================
// Configuration Map
// ============================================================================

/**
 * Complete configuration for all waiting status states.
 * Each state maps to its UI behavior.
 */
export const WAITING_STATUS_CONFIG: Record<NonNullable<WaitingStatusState>, WaitingStatusConfig> = {
  // Stage 0: Compact pending (not currently used in UI)
  'compact-pending': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Stage 1: Partner is still in their witness session
  'witness-pending': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: true,
    bannerText: (p) => `Waiting for ${p} to feel heard.`,
  },

  // Stage 2: Waiting for partner to share their empathy perspective
  'empathy-pending': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: true,
    bannerText: (p) => `Waiting for ${p} to feel heard.`,
  },

  // Stage 2: Partner is now considering user's perspective (good alignment)
  'partner-considering-perspective': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: true,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: true,
    bannerText: (p) => `${p} is now considering how you might feel.`,
    bannerSubtext: "Once they share, you'll both be able to reflect on what each other shared.",
  },

  // Stage 2: Reconciler is analyzing empathy match (brief transient state)
  // Uses "Keep Chatting" style - no spinner, input enabled
  'reconciler-analyzing': {
    showBanner: true,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: true,
    bannerText: () => `Checking how well you captured their perspective...`,
  },

  // Stage 2: Reconciler is re-analyzing revised empathy (same style as first time)
  'revision-analyzing': {
    showBanner: true,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: true,
    bannerText: () => `Checking your updated understanding...`,
  },

  // Stage 2: User (Subject) needs to respond to share suggestion (OFFER_SHARING - significant gaps)
  'awaiting-context-share': {
    showBanner: true,
    hideInput: false, // User can still chat
    showInnerThoughts: false,
    isActionRequired: true, // User must respond to the share suggestion
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `${p}'s understanding has some gaps.`,
    bannerSubtext: 'Review the suggestion below to help them understand you better.',
  },

  // Stage 2: User (Subject) may optionally share context (OFFER_OPTIONAL - moderate gaps)
  'awaiting-context-share-optional': {
    showBanner: true,
    hideInput: false, // User can still chat
    showInnerThoughts: false,
    isActionRequired: false, // Optional - user can skip
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `You might help ${p} understand a little more.`,
    bannerSubtext: 'This is optional - see the suggestion below.',
  },

  // Stage 2: Guesser waiting for subject to decide whether to share (Guesser side)
  'awaiting-subject-decision': {
    showBanner: true,
    hideInput: true, // Guesser must wait for subject's decision
    showInnerThoughts: true,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `${p} is deciding whether to share more context.`,
  },

  // Stage 2: Subject declined sharing (transient - positive message)
  'subject-skipped-sharing': {
    showBanner: false, // Handled via chat message instead
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Stage 2: Empathy match is good, no sharing needed (PROCEED - positive feedback)
  'empathy-proceed': {
    showBanner: true,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `Your understanding of ${p} looks good!`,
    bannerSubtext: 'Continue exploring when ready.',
  },

  // Stage 2: Guesser is refining empathy after receiving shared context
  'refining-empathy': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Stage 3: Waiting for partner to confirm their needs
  'needs-pending': {
    showBanner: true,
    hideInput: false,  // Users can chat while waiting for partner
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `Waiting for ${p} to confirm their needs.`,
  },

  // Stage 4: Waiting for partner to submit strategy rankings
  'ranking-pending': {
    showBanner: true,
    hideInput: true,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
    bannerText: (p) => `Waiting for ${p} to submit their rankings.`,
  },

  // Transient: Partner has signed compact
  'partner-signed': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Transient: Partner completed witness stage
  'partner-completed-witness': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Transient: Partner shared their empathy attempt
  'partner-shared-empathy': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },

  // Transient: Partner confirmed their needs
  'partner-confirmed-needs': {
    showBanner: false,
    hideInput: false,
    showInnerThoughts: false,
    isActionRequired: false,
    showSpinner: false,
    showKeepChattingAction: false,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Default config for null/undefined status states.
 */
const DEFAULT_CONFIG: WaitingStatusConfig = {
  showBanner: false,
  hideInput: false,
  showInnerThoughts: false,
  isActionRequired: false,
  showSpinner: false,
  showKeepChattingAction: false,
};

/**
 * Get the UI configuration for a waiting status.
 * Returns default (no-op) config for null status.
 *
 * @param status - The current waiting status
 * @returns UI configuration for the status
 */
export function getWaitingStatusConfig(status: WaitingStatusState): WaitingStatusConfig {
  if (!status) {
    return DEFAULT_CONFIG;
  }
  return WAITING_STATUS_CONFIG[status];
}

/**
 * Get the banner text for a waiting status.
 * Returns undefined if the status doesn't show a banner.
 *
 * @param status - The current waiting status
 * @param partnerName - Partner's display name
 * @returns Banner text, or undefined if no banner
 */
export function getWaitingBannerText(
  status: WaitingStatusState,
  partnerName: string
): string | undefined {
  if (!status) {
    return undefined;
  }
  const config = WAITING_STATUS_CONFIG[status];
  return config.bannerText?.(partnerName);
}
