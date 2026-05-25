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
  isPending?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function FeelHeardConfirmation({
  onConfirm,
  isPending = false,
}: FeelHeardConfirmationProps) {
  return (
    <GuidedActionPanel
      tone="success"
      title="Feel heard enough to continue?"
      compactActionLayout="stacked"
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
