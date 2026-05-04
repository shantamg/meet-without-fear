/**
 * CompactAgreementBar Component
 *
 * A simple "Ready" button that appears above the chat input during onboarding.
 * Replaces the previous checkbox + "Sign and Begin" flow with a single tap to proceed.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { createStyles } from '../theme/styled';

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
  const styles = useStyles();

  const label = buttonLabel ?? (isFirstSession ? 'Ready' : "Let's go");

  return (
    <View style={styles.container} testID={testID || 'compact-agreement-bar'}>
      <TouchableOpacity
        style={[styles.readyButton, isPending && styles.readyButtonDisabled]}
        onPress={onSign}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: isPending }}
        testID="compact-sign-button"
      >
        <Text style={styles.readyButtonText}>
          {isPending ? '...' : label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      alignItems: 'center',
    },
    readyButton: {
      backgroundColor: 'rgb(59, 130, 246)',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.xl,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 120,
    },
    readyButtonDisabled: {
      backgroundColor: t.colors.textMuted,
    },
    readyButtonText: {
      color: 'white',
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
    },
  }));

export default CompactAgreementBar;
