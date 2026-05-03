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
   * If provided, the user is the invitee opening a session their partner
   * created. The compact bar shows the partner-confirmed topic instead of
   * the inviter welcome copy.
   */
  inviteeTopic?: string | null;
  /** Partner's display name for invitee welcome */
  partnerName?: string;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CompactAgreementBar({
  onSign,
  isPending = false,
  isFirstSession = true,
  inviteeTopic,
  partnerName,
  testID,
}: CompactAgreementBarProps) {
  const styles = useStyles();

  return (
    <View style={styles.container} testID={testID || 'compact-agreement-bar'}>
      {inviteeTopic ? (
        <>
          <Text style={styles.welcomeText}>
            {`Before we begin, this is what ${partnerName || 'your partner'} would like to work through with you:`}
          </Text>
          <Text style={styles.inviteeTopicText} testID="invitee-topic-text">{inviteeTopic}</Text>
          <Text style={styles.welcomeText}>
            {"This is how things look from their side right now. You don't need to agree with it, respond to it, or do anything with it yet. Instead, I'd like to know what's happening from your point of view. Ready?"}
          </Text>
        </>
      ) : null}
      <TouchableOpacity
        style={[styles.readyButton, isPending && styles.readyButtonDisabled]}
        onPress={onSign}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: isPending }}
        testID="compact-sign-button"
      >
        <Text style={styles.readyButtonText}>
          {isPending ? '...' : isFirstSession ? 'Ready' : "Let's go"}
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
    welcomeText: {
      color: t.colors.textPrimary,
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    inviteeTopicText: {
      color: t.colors.textPrimary,
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      lineHeight: 26,
      textAlign: 'center',
      marginBottom: t.spacing.md,
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
