/**
 * CompactAgreementBar Component
 *
 * A simple "Ready" button that appears above the chat input during onboarding.
 * Replaces the previous checkbox + "Sign and Begin" flow with a single tap to proceed.
 */

import { GuidedActionPanel } from './GuidedActionPanel';

// ============================================================================
// Types
// ============================================================================

interface CompactAgreementBarProps {
  onSign: () => void;
  isPending?: boolean;
  /** Whether this is the first session (affects button label) */
  isFirstSession?: boolean;
  /**
   * Optional override for the button label. Used by callers that want a plain
   * single-button bar (e.g. invitee topic acknowledgement Ready button).
   */
  buttonLabel?: string;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CompactAgreementBar({
  onSign,
  isPending = false,
  isFirstSession = true,
  buttonLabel,
  testID,
}: CompactAgreementBarProps) {
  const label = buttonLabel ?? (isFirstSession ? 'Ready' : "Let's go");

  return (
    <GuidedActionPanel
      tone="topic"
      eyebrow="Curiosity compact"
      title="Ready to begin?"
      subtitle={isFirstSession ? 'Start with the compact, then name the conversation topic.' : undefined}
      primaryAction={{
        label,
        onPress: onSign,
        disabled: isPending,
        loading: isPending,
        testID: 'compact-sign-button',
      }}
      testID={testID || 'compact-agreement-bar'}
    />
  );
}

export default CompactAgreementBar;
