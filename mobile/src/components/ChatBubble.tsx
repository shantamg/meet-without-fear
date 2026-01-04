import { useRef } from 'react';
import { View, Text } from 'react-native';
import { MessageRole } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';
import { TypewriterText } from './TypewriterText';

// ============================================================================
// Types
// ============================================================================

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  isIntervention?: boolean;
  status?: MessageDeliveryStatus;
  /** If true, skip typewriter effect (for messages loaded from history) */
  skipTypewriter?: boolean;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
  /** Enable typewriter effect for AI messages */
  enableTypewriter?: boolean;
  /** Callback when typewriter effect starts (to track animation state) */
  onTypewriterStart?: () => void;
  /** Callback when typewriter effect completes */
  onTypewriterComplete?: () => void;
  /** Callback during typewriter animation (for scrolling) */
  onTypewriterProgress?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Delay between each word appearing (ms) */
const WORD_DELAY_MS = 70;

/** Duration of the fade-in animation for each word (ms) */
const FADE_DURATION_MS = 200;

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({
  message,
  showTimestamp = false,
  enableTypewriter = true,
  onTypewriterStart,
  onTypewriterComplete,
  onTypewriterProgress,
}: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isEmpathyStatement = message.role === MessageRole.EMPATHY_STATEMENT;
  const isAI = !isUser && !isSystem && !isEmpathyStatement;
  const isIntervention = message.isIntervention ?? false;

  // Track if this specific message instance has completed animation
  const hasAnimatedRef = useRef(false);
  const messageIdRef = useRef(message.id);

  // Reset animation state if message ID changes
  if (messageIdRef.current !== message.id) {
    messageIdRef.current = message.id;
    hasAnimatedRef.current = false;
  }

  // Store callbacks in refs to avoid re-triggering animation
  const onStartRef = useRef(onTypewriterStart);
  const onCompleteRef = useRef(onTypewriterComplete);
  const onProgressRef = useRef(onTypewriterProgress);
  onStartRef.current = onTypewriterStart;
  onCompleteRef.current = onTypewriterComplete;
  onProgressRef.current = onTypewriterProgress;

  // Determine if we should use typewriter effect
  const shouldUseTypewriter = isAI && enableTypewriter && !message.skipTypewriter && !hasAnimatedRef.current;

  // Mark as animated when complete
  const handleComplete = () => {
    hasAnimatedRef.current = true;
    onCompleteRef.current?.();
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusText = (status: MessageDeliveryStatus): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
      case 'error':
        return 'Failed to send';
    }
  };

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    if (isEmpathyStatement) return styles.empathyStatementContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    if (isEmpathyStatement) return styles.empathyStatementBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    if (isEmpathyStatement) return styles.empathyStatementText;
    return styles.text;
  };

  const renderContent = () => {
    // Empathy statements don't use typewriter
    if (isEmpathyStatement) {
      return (
        <View>
          <Text style={styles.empathyStatementHeader}>What you shared</Text>
          <Text style={styles.empathyStatementText}>{message.content}</Text>
        </View>
      );
    }

    // Use typewriter for new AI messages
    if (shouldUseTypewriter) {
      return (
        <TypewriterText
          text={message.content}
          style={getTextStyle()}
          wordDelay={WORD_DELAY_MS}
          fadeDuration={FADE_DURATION_MS}
          onComplete={handleComplete}
          onProgress={onProgressRef.current}
        />
      );
    }

    // Regular text for all other cases
    return <Text style={getTextStyle()}>{message.content}</Text>;
  };

  return (
    <View
      style={[styles.container, getContainerStyle()]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, isAI && styles.aiBubbleContainer, getBubbleStyle()]}>
        {renderContent()}
      </View>
      <View style={styles.metaContainer}>
        {showTimestamp && (
          <Text style={[styles.time, isSystem && styles.systemTime]}>
            {formatTime(message.timestamp)}
          </Text>
        )}
        {isUser && message.status && (
          <Text
            style={[
              styles.statusText,
              message.status === 'sending' && styles.statusSending,
              message.status === 'read' && styles.statusRead,
              message.status === 'error' && styles.statusError,
            ]}
          >
            {getStatusText(message.status)}
          </Text>
        )}
      </View>
    </View>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    aiContainer: {
      alignItems: 'flex-start',
    },
    systemContainer: {
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
    },
    // AI messages should be full width
    aiBubbleContainer: {
      maxWidth: '100%',
    },
    // User messages: bgSecondary background, 16px border-radius
    userBubble: {
      backgroundColor: colors.bgSecondary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 16,
    },
    // AI messages: full-width, no bubble background (like demo)
    aiBubble: {
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: colors.bgTertiary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
    // Empathy statement container: centered
    empathyStatementContainer: {
      alignItems: 'center',
    },
    // Empathy statement header: centered
    empathyStatementHeader: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '700',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    // Empathy statement: matches drawer styling (bgSecondary, left border accent)
    empathyStatementBubble: {
      backgroundColor: colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.brandBlue,
      padding: 20,
    },
    // Empathy statement text: italic, matches drawer
    empathyStatementText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: colors.textSecondary,
      fontFamily: t.typography.fontFamily.regular,
      textAlign: 'center',
    },
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    time: {
      fontSize: t.typography.fontSize.sm,
      color: colors.textSecondary,
    },
    systemTime: {
      textAlign: 'center',
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: t.typography.fontFamily.regular,
    },
    statusSending: {
      fontStyle: 'italic',
    },
    statusRead: {
      color: colors.accent,
    },
    statusError: {
      color: colors.error,
    },
  }));
