/**
 * FeelHeardConfirmation Component
 *
 * Low-profile panel above chat input for Stage 1 gate confirmation.
 * Single button to confirm feeling heard.
 */

import { GuidedActionPanel } from './GuidedActionPanel';

// ============================================================================
// Types
// ============================================================================

interface FeelHeardConfirmationProps {
  onConfirm: () => void;
  onContinue?: () => void;
  isPending?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function FeelHeardConfirmation({
  onConfirm,
  onContinue,
  isPending = false,
}: FeelHeardConfirmationProps) {
  return (
    <GuidedActionPanel
      tone="success"
      eyebrow="Ready check"
      title="Do you feel heard enough to continue?"
      subtitle="You can keep talking, or move into the next part when this feels complete."
      secondaryAction={onContinue ? {
        label: 'Not yet',
        onPress: onContinue,
        disabled: isPending,
        testID: 'feel-heard-not-yet',
      } : undefined}
      primaryAction={{
        label: 'I feel heard',
        onPress: onConfirm,
        disabled: isPending,
        loading: isPending,
        testID: 'feel-heard-yes',
      }}
      testID="feel-heard-panel"
    />
  );
}

export default FeelHeardConfirmation;
