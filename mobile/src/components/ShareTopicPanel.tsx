/**
 * ShareTopicPanel Component
 *
 * A low-profile, full-width panel that appears when the reconciler suggests
 * sharing additional context. Tapping it opens the ShareTopicDrawer.
 *
 * This is Phase 1 of the two-phase share flow:
 * 1. ShareTopicPanel shows topic → User taps → Opens ShareTopicDrawer
 * 2. If user accepts → AI generates draft via chat → Opens ShareSuggestionDrawer
 */

import { GuidedActionPanel } from './GuidedActionPanel';

// ============================================================================
// Types
// ============================================================================

export interface ShareTopicPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Callback when user taps the panel */
  onPress: () => void;
  /** Reconciler action type - affects styling */
  action: 'OFFER_SHARING' | 'OFFER_OPTIONAL';
  /** Partner's name to display in the panel text */
  partnerName: string;
}

// ============================================================================
// Component
// ============================================================================

export function ShareTopicPanel({
  visible,
  onPress,
  action,
  partnerName,
}: ShareTopicPanelProps) {
  if (!visible) return null;

  return (
    <GuidedActionPanel
      tone={action === 'OFFER_SHARING' ? 'share' : 'review'}
      title={`Opportunity to share with ${partnerName}`}
      compact
      pressable
      primaryAction={{ label: 'Review', onPress }}
      testID="share-topic-panel"
    />
  );
}

export default ShareTopicPanel;
