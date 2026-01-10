/**
 * CompactAgreementBar Component
 *
 * A UI element that appears above the chat input row during onboarding.
 * Contains the checkbox "I agree to proceed with curiosity" and "Sign and Begin" button.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CompactAgreementBarProps {
  onSign: () => void;
  isPending?: boolean;
  onAskQuestion?: () => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CompactAgreementBar({
  onSign,
  isPending = false,
  onAskQuestion,
  testID,
}: CompactAgreementBarProps) {
  const styles = useStyles();
  const [agreed, setAgreed] = useState(false);

  const handleSign = () => {
    if (agreed && !isPending) {
      onSign();
    }
  };

  return (
    <View style={styles.container} testID={testID || 'compact-agreement-bar'}>
      <View style={styles.agreementRow}>
        <TouchableOpacity
          testID="compact-agree-checkbox"
          style={styles.checkbox}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View style={[styles.checkboxBox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>&#10003;</Text>}
          </View>
          <Text style={styles.checkboxLabel}>I agree to proceed with curiosity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signButton, !agreed && styles.signButtonDisabled]}
          onPress={handleSign}
          disabled={!agreed || isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !agreed || isPending }}
          testID="compact-sign-button"
        >
          <Text style={styles.signButtonText}>
            {isPending ? '...' : 'Begin'}
          </Text>
        </TouchableOpacity>
      </View>

      {onAskQuestion && (
        <TouchableOpacity
          style={styles.questionsButton}
          onPress={onAskQuestion}
          testID="compact-questions-button"
        >
          <Text style={styles.questionsText}>I have questions</Text>
        </TouchableOpacity>
      )}
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
    },
    agreementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    checkbox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkboxBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: 'rgb(59, 130, 246)', // Blue to match "Compact Signed" indicator
      borderColor: 'rgb(59, 130, 246)',
    },
    checkmark: {
      color: 'white',
      fontSize: 12,
      fontWeight: 'bold',
    },
    checkboxLabel: {
      marginLeft: t.spacing.sm,
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textPrimary,
      flex: 1,
    },
    signButton: {
      backgroundColor: 'rgb(59, 130, 246)', // Blue to match "Compact Signed" indicator
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signButtonDisabled: {
      backgroundColor: t.colors.textMuted,
    },
    signButtonText: {
      color: 'white',
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
    },
    questionsButton: {
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      alignItems: 'center',
      marginTop: t.spacing.xs,
    },
    questionsText: {
      color: t.colors.accent,
      fontSize: t.typography.fontSize.sm,
    },
  }));

export default CompactAgreementBar;
