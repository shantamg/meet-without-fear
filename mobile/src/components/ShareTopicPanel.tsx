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

import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { colors } from '@/theme';

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

  // Use orange for OFFER_SHARING (significant gaps), blue for OFFER_OPTIONAL (moderate gaps)
  const iconColor = action === 'OFFER_SHARING' ? colors.warning : colors.brandBlue;
  const textColor = action === 'OFFER_SHARING' ? colors.warning : colors.brandBlue;

  return (
    <TouchableOpacity
      style={styles.panel}
      onPress={onPress}
      activeOpacity={0.7}
      testID="share-topic-panel"
    >
      <Lightbulb color={iconColor} size={18} />
      <Text style={[styles.panelText, { color: textColor }]}>
        Help {partnerName} understand you better
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.bgSecondary,
  },
  panelText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ShareTopicPanel;
