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
  | 'context-shared'
  | 'empathy-shared'
  | 'reconciler-analyzing'
  | 'reconciler-gaps-found'
  | 'reconciler-ready'
  | 'partner-empathy-held';

interface ChatIndicatorProps {
  type: ChatIndicatorType;
  timestamp?: string;
  testID?: string;
  /** If provided, makes the indicator tappable */
  onPress?: () => void;
  /** Optional metadata for dynamic indicator text */
  metadata?: {
    /** Whether this content is from the current user (vs partner) */
    isFromMe?: boolean;
    /** Partner's display name (for "Context from {name}" text) */
    partnerName?: string;
  };
}

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({ type, timestamp, testID, onPress, metadata }: ChatIndicatorProps) {
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
        // Show "Context from {name}" when it's from partner, otherwise "Context shared"
        if (metadata?.isFromMe === false && metadata?.partnerName) {
          return `Context from ${metadata.partnerName}`;
        }
        return 'Context shared';
      case 'empathy-shared':
        // Show "Empathy from {name}" when it's from partner, otherwise "Empathy shared"
        if (metadata?.isFromMe === false && metadata?.partnerName) {
          return `Empathy from ${metadata.partnerName}`;
        }
        return 'Empathy shared';
      case 'reconciler-analyzing':
        return 'Analyzing understanding...';
      case 'reconciler-gaps-found':
        return 'Gaps detected - awaiting context';
      case 'reconciler-ready':
        return 'Understanding verified ✓';
      case 'partner-empathy-held':
        const name = metadata?.partnerName || 'Partner';
        return `${name} shared empathy • Awaiting review`;
      default:
        return '';
    }
  };

  // Whether this indicator links to another page (shows arrow)
  const hasArrow = type === 'context-shared' || type === 'empathy-shared';

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
      case 'empathy-shared':
        return styles.contextSharedLine;
      case 'reconciler-analyzing':
        return styles.reconcilerAnalyzingLine;
      case 'reconciler-gaps-found':
        return styles.reconcilerGapsLine;
      case 'reconciler-ready':
        return styles.reconcilerReadyLine;
      case 'partner-empathy-held':
        return styles.partnerEmpathyHeldLine;
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
      case 'empathy-shared':
        return styles.contextSharedText;
      case 'reconciler-analyzing':
        return styles.reconcilerAnalyzingText;
      case 'reconciler-gaps-found':
        return styles.reconcilerGapsText;
      case 'reconciler-ready':
        return styles.reconcilerReadyText;
      case 'partner-empathy-held':
        return styles.partnerEmpathyHeldText;
      default:
        return styles.defaultText;
    }
  };

  const content = (
    <View style={styles.lineContainer}>
      <View style={[styles.line, getLineStyle()]} />
      <View style={styles.textContainer}>
        <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
        {hasArrow && (
          <Text style={[styles.arrow, getTextStyle()]}>→</Text>
        )}
      </View>
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
    textContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    arrow: {
      fontSize: 16,
      fontWeight: '600',
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
    // Reconciler analyzing: blue tint for in-progress
    reconcilerAnalyzingLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    reconcilerAnalyzingText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    // Reconciler gaps found: orange/warning tint
    reconcilerGapsLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    reconcilerGapsText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Reconciler ready: green/success tint
    reconcilerReadyLine: {
      backgroundColor: 'rgba(34, 197, 94, 0.3)',
    },
    reconcilerReadyText: {
      color: 'rgba(34, 197, 94, 0.9)',
    },
    // Partner empathy held: blue/info tint
    partnerEmpathyHeldLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    partnerEmpathyHeldText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
  }));
