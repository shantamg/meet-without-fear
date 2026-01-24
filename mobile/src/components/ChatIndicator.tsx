/**
 * ChatIndicator Component
 *
 * Displays inline indicators/dividers in the chat.
 * Used for things like "Invitation Sent" markers.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

export type ChatIndicatorType =
  | 'invitation-sent'
  | 'invitation-accepted'
  | 'stage-transition'
  | 'session-start'
  | 'feel-heard'
  | 'compact-signed'
  | 'context-shared';

interface ChatIndicatorProps {
  type: ChatIndicatorType;
  timestamp?: string;
  testID?: string;
  /** If provided, makes the indicator tappable */
  onPress?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({ type, timestamp, testID, onPress }: ChatIndicatorProps) {
  const styles = useStyles();

  const getIndicatorText = (): string => {
    switch (type) {
      case 'invitation-sent':
        return 'Invitation Sent';
      case 'invitation-accepted':
        return 'Accepted Invitation';
      case 'stage-transition':
        return 'Moving Forward';
      case 'session-start':
        return 'Session Started';
      case 'feel-heard':
        return 'Felt Heard';
      case 'compact-signed':
        return 'Compact Signed';
      case 'context-shared':
        return 'Context shared ›';
      default:
        return '';
    }
  };

  const getLineStyle = () => {
    switch (type) {
      case 'invitation-sent':
      case 'invitation-accepted':
        return styles.invitationSentLine;
      case 'feel-heard':
        return styles.feelHeardLine;
      case 'compact-signed':
        return styles.compactSignedLine;
      case 'context-shared':
        return styles.contextSharedLine;
      default:
        return styles.defaultLine;
    }
  };

  const getTextStyle = () => {
    switch (type) {
      case 'invitation-sent':
      case 'invitation-accepted':
        return styles.invitationSentText;
      case 'feel-heard':
        return styles.feelHeardText;
      case 'compact-signed':
        return styles.compactSignedText;
      case 'context-shared':
        return styles.contextSharedText;
      default:
        return styles.defaultText;
    }
  };

  const content = (
    <View style={styles.lineContainer}>
      <View style={[styles.line, getLineStyle()]} />
      <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
      <View style={[styles.line, getLineStyle()]} />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.container}
        testID={testID || `chat-indicator-${type}`}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container} testID={testID || `chat-indicator-${type}`}>
      {content}
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
    // Invitation sent: yellow/amber tint - separate line and text styles
    invitationSentLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    invitationSentText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Feel heard: teal/green tint for completion feeling
    feelHeardLine: {
      backgroundColor: 'rgba(20, 184, 166, 0.3)',
    },
    feelHeardText: {
      color: 'rgba(20, 184, 166, 0.9)',
    },
    // Compact signed: dark blue tint for commitment
    compactSignedLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    compactSignedText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    // Context shared: purple/accent tint for shared content
    contextSharedLine: {
      backgroundColor: 'rgba(139, 92, 246, 0.3)',
    },
    contextSharedText: {
      color: 'rgba(139, 92, 246, 0.9)',
    },
    defaultLine: {
      backgroundColor: t.colors.border,
    },
    defaultText: {
      color: t.colors.textMuted,
    },
  }));
