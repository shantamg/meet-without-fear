/**
 * ReadyToShareConfirmation Component
 *
 * Low-profile button that indicates the user can tap to view their
 * empathy statement/understanding. Opens a drawer with full details.
 */

import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface ReadyToShareConfirmationProps {
  /** Callback when user taps to view full statement */
  onViewFull: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ReadyToShareConfirmation({
  onViewFull,
}: ReadyToShareConfirmationProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onViewFull}
      activeOpacity={0.7}
      testID="ready-to-share-button"
    >
      <MessageCircle color={colors.brandBlue} size={18} />
      <Text style={styles.buttonText}>Review what you'll share</Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.brandBlue,
  },
});

export default ReadyToShareConfirmation;
