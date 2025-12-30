/**
 * ChatIndicator Component
 *
 * Displays inline indicators/dividers in the chat.
 * Used for things like "Invitation Sent" markers.
 */

import { View, Text } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

export type ChatIndicatorType = 'invitation-sent' | 'stage-transition' | 'session-start';

interface ChatIndicatorProps {
  type: ChatIndicatorType;
  timestamp?: string;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({ type, timestamp, testID }: ChatIndicatorProps) {
  const styles = useStyles();

  const getIndicatorText = (): string => {
    switch (type) {
      case 'invitation-sent':
        return 'Invitation Sent';
      case 'stage-transition':
        return 'Moving Forward';
      case 'session-start':
        return 'Session Started';
      default:
        return '';
    }
  };

  const getIndicatorStyle = () => {
    switch (type) {
      case 'invitation-sent':
        return styles.invitationSent;
      default:
        return styles.default;
    }
  };

  return (
    <View style={styles.container} testID={testID || `chat-indicator-${type}`}>
      <View style={styles.lineContainer}>
        <View style={[styles.line, getIndicatorStyle()]} />
        <Text style={[styles.text, getIndicatorStyle()]}>{getIndicatorText()}</Text>
        <View style={[styles.line, getIndicatorStyle()]} />
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    lineContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: t.colors.border,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    // Invitation sent: yellow/amber tint
    invitationSent: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
      color: 'rgba(245, 158, 11, 0.9)',
    },
    default: {
      backgroundColor: t.colors.border,
      color: t.colors.textMuted,
    },
  }));
