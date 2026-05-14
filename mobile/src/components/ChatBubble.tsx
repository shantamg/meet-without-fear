import { useRef, useEffect, useCallback } from 'react';
import { View, Text, Animated } from 'react-native';
import { MessageRole, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { designFonts, useAppAppearance } from '../theme';
import { TypewriterText } from './TypewriterText';
import { SpeakerButton } from './SpeakerButton';

// ============================================================================
// Types
// ============================================================================

export type MessageDeliveryStatus = 'sending' | 'streaming' | 'sent' | 'delivered' | 'read' | 'error';

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  senderId?: string | null;
  isIntervention?: boolean;
  status?: MessageDeliveryStatus;
  /** If true, skip animation (for messages loaded from history) */
  skipTypewriter?: boolean;
  /** Delivery status for shared content messages (EMPATHY_STATEMENT, SHARED_CONTEXT) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
  sharedContentDirection?: 'sent' | 'received';
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
  /** Enable typewriter effect for AI messages */
  enableTypewriter?: boolean;
  /** Callback when animation starts (to track animation state) */
  onAnimationStart?: () => void;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Callback as typewriter/fade progress changes layout */
  onAnimationProgress?: () => void;
  /** Stable identity for animation state when a temporary message id is reconciled. */
  animationIdentity?: string;
  /** Whether speech is currently playing for this message */
  isSpeaking?: boolean;
  /** Callback when speaker button is pressed */
  onSpeakerPress?: () => void;
  /** Hide speaker button (default: false for AI messages) */
  hideSpeaker?: boolean;
  /** Partner's name for personalized messages (e.g., SHARED_CONTEXT) */
  partnerName?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Duration of the fade-in animation for non-typewriter messages (ms) */
const MESSAGE_FADE_DURATION_MS = 400;

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({
  message,
  showTimestamp = false,
  enableTypewriter = true,
  onAnimationStart,
  onAnimationComplete,
  onAnimationProgress,
  animationIdentity,
  isSpeaking = false,
  onSpeakerPress,
  hideSpeaker = false,
  partnerName,
}: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isEmpathyStatement = message.role === MessageRole.EMPATHY_STATEMENT;
  const isSharedContext =
    (message.role as string) === 'SHARED_CONTEXT' ||
    (message.role as string) === 'VALIDATION_FEEDBACK';
  const isValidationFeedback = (message.role as string) === 'VALIDATION_FEEDBACK';
  const isShareSuggestion = (message.role as string) === 'SHARE_SUGGESTION';
  const isAI = !isUser && !isSystem && !isEmpathyStatement && !isSharedContext && !isShareSuggestion;
  const isIntervention = message.isIntervention ?? false;

  // Track if this specific message instance has completed animation
  const hasAnimatedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const animationIdentityRef = useRef(animationIdentity ?? message.id);

  // Determine if this message type uses fade-in animation (non-AI, non-USER animated messages)
  const willAnimate = !isUser && !isAI && enableTypewriter && !message.skipTypewriter;

  // Animated value for fade-in (non-typewriter messages)
  // Always start at 1 (visible) — the fade-in effect sets to 0 and animates when triggered
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Reset animation state if the animation identity changes. The display id
  // can change when a streaming placeholder is reconciled to its persisted id.
  const currentAnimationIdentity = animationIdentity ?? message.id;
  if (animationIdentityRef.current !== currentAnimationIdentity) {
    animationIdentityRef.current = currentAnimationIdentity;
    hasAnimatedRef.current = false;
    hasStartedRef.current = false;
    fadeAnim.setValue(1);
  }

  // Store callbacks in refs to avoid re-triggering animation
  const onStartRef = useRef(onAnimationStart);
  const onCompleteRef = useRef(onAnimationComplete);
  const onProgressRef = useRef(onAnimationProgress);
  onStartRef.current = onAnimationStart;
  onCompleteRef.current = onAnimationComplete;
  onProgressRef.current = onAnimationProgress;

  // Determine if we should use typewriter effect (AI messages only)
  const shouldUseTypewriter = isAI && enableTypewriter && !message.skipTypewriter && !hasAnimatedRef.current;

  // Determine if we should use fade-in effect (non-AI, non-USER messages that should animate)
  const shouldUseFadeIn = !isUser && !isAI && enableTypewriter && !message.skipTypewriter && !hasAnimatedRef.current;

  // Track whether this message is next to animate (callback is provided).
  // Animatable live messages that are not next stay hidden so they do not pop
  // in fully rendered before their queued animation turn.
  const isNextToAnimate = onAnimationStart !== undefined;
  const isWaitingForAnimationTurn =
    !isUser &&
    enableTypewriter &&
    !message.skipTypewriter &&
    !hasAnimatedRef.current &&
    !isNextToAnimate &&
    !hasStartedRef.current;

  // Handle fade-in animation for non-typewriter messages
  // Only starts when this message is next in the animation queue (onAnimationStart is provided)
  useEffect(() => {
    if (shouldUseFadeIn && !hasStartedRef.current && isNextToAnimate) {
      hasStartedRef.current = true;
      fadeAnim.setValue(0);

      // Notify animation started
      onStartRef.current?.();

      // Run fade-in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: MESSAGE_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        // Animation complete
        hasAnimatedRef.current = true;
        onCompleteRef.current?.();
      });
    }
  }, [shouldUseFadeIn, isNextToAnimate, fadeAnim]);

  // Call onStart when typewriter begins - use effect to avoid setState during render
  // Only starts when this message is next in the animation queue (onAnimationStart is provided)
  useEffect(() => {
    if (shouldUseTypewriter && !hasStartedRef.current && isNextToAnimate && onStartRef.current) {
      hasStartedRef.current = true;
      onStartRef.current();
    }
  }, [shouldUseTypewriter, isNextToAnimate]);

  // Mark as animated when typewriter completes
  const handleComplete = useCallback(() => {
    hasAnimatedRef.current = true;
    onCompleteRef.current?.();
  }, []);

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusText = (status: MessageDeliveryStatus): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'streaming':
        return 'Responding...';
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

  const getSharedContentStatusText = (status: SharedContentDeliveryStatus | undefined): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'pending':
        return 'Submitted for review';
      case 'delivered':
        return 'Delivered';
      case 'seen':
        return '✓ Seen';
      case 'superseded':
        return 'Updated version below';
      default:
        return 'Submitted for review';
    }
  };

  const isSendingStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'sending';
  };

  const isSeenStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'seen';
  };

  const isSupersededStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'superseded';
  };

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    if (isEmpathyStatement) return styles.empathyStatementContainer;
    if (isSharedContext) {
      return message.sharedContentDirection === 'sent'
        ? styles.sharedContextSentContainer
        : styles.sharedContextContainer;
    }
    if (isShareSuggestion) return styles.shareSuggestionContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    if (isEmpathyStatement) return styles.empathyStatementBubble;
    if (isSharedContext) return styles.sharedContextBubble;
    if (isShareSuggestion) return styles.shareSuggestionBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    if (isEmpathyStatement) return styles.empathyStatementText;
    return styles.text;
  };

  // Check if fade-in animation should be active
  // Only animate when it's this message's turn (isNextToAnimate)
  // Messages waiting their turn render with full opacity (never hidden)
  const isFadeInAnimating = willAnimate && !hasAnimatedRef.current && isNextToAnimate;

  const renderContent = () => {
    if (isWaitingForAnimationTurn) {
      return null;
    }

    // Empathy statements - use fade-in for new messages
    if (isEmpathyStatement) {
      const deliveryStatus = message.sharedContentDeliveryStatus;
      const header =
        message.sharedContentDirection === 'received'
          ? (partnerName ? `Empathy from ${partnerName}` : 'Empathy from your partner')
          : 'What you shared';
      const content = (
        <View>
          <Text style={styles.empathyStatementHeader}>{header}</Text>
          <Text style={styles.empathyStatementText}>{message.content}</Text>
          {/* Delivery status indicator - only show when we have a status */}
          {deliveryStatus && (
            <Text style={[
              styles.sharedContentDeliveryStatus,
              isSendingStatus(deliveryStatus) && styles.sharedContentDeliveryStatusSending,
              isSeenStatus(deliveryStatus) && styles.sharedContentDeliveryStatusSeen,
              isSupersededStatus(deliveryStatus) && styles.sharedContentDeliveryStatusSuperseded,
            ]}>
              {getSharedContentStatusText(deliveryStatus)}
            </Text>
          )}
        </View>
      );
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // Shared context (from reconciler) - use fade-in for new messages
    if (isSharedContext) {
      const contextLabel = isValidationFeedback
        ? (partnerName ? `Feedback from ${partnerName}` : 'Feedback from your partner')
        : message.sharedContentDirection === 'sent'
          ? (partnerName ? `Context shared with ${partnerName}` : 'Context shared')
        : (partnerName ? `New context from ${partnerName}` : 'New context from your partner');
      const deliveryStatus = message.sharedContentDeliveryStatus;
      const content = (
        <View>
          <Text style={styles.sharedContextLabel}>{contextLabel}</Text>
          <Text style={styles.sharedContextText}>{message.content}</Text>
          {/* Delivery status indicator */}
          {deliveryStatus && (
            <Text style={[
              styles.sharedContentDeliveryStatusLight,
              isSeenStatus(deliveryStatus) && styles.sharedContentDeliveryStatusSeenLight,
            ]}>
              {getSharedContentStatusText(deliveryStatus)}
            </Text>
          )}
        </View>
      );
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // Share suggestion (what user will share) - use fade-in for new messages
    if (isShareSuggestion) {
      const content = (
        <View>
          <Text style={styles.shareSuggestionLabel}>SUGGESTED TO SHARE</Text>
          <Text style={styles.shareSuggestionText}>"{message.content}"</Text>
        </View>
      );
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // System messages - use fade-in for new messages
    if (isSystem) {
      const content = <Text style={getTextStyle()}>{message.content}</Text>;
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // Use typewriter effect for new AI messages - animates word-by-word at consistent pace
    // This normalizes display speed regardless of how fast streaming arrives
    if (shouldUseTypewriter) {
      return (
        <TypewriterText
          text={message.content}
          style={getTextStyle()}
          wordDelay={40}
          fadeDuration={120}
          completeWhenCaughtUp={message.status !== 'streaming'}
          onComplete={handleComplete}
          onProgress={() => onProgressRef.current?.()}
        />
      );
    }

    // Regular text for all other cases (user messages, already animated messages)
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
        {/* Speaker button for AI messages */}
        {isAI && !hideSpeaker && onSpeakerPress && (
          <SpeakerButton
            isSpeaking={isSpeaking}
            onPress={onSpeakerPress}
            testID={`speaker-${message.id}`}
          />
        )}
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

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      width: '100%',
      marginVertical: 6,
      paddingHorizontal: 18,
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
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
    // AI messages: full-width, no bubble background (like demo)
    aiBubble: {
      backgroundColor: 'transparent',
      paddingVertical: 6,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: palette.bgElev,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
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
      color: palette.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    // Empathy statement: matches drawer styling (bgSecondary, left border accent)
    empathyStatementBubble: {
      backgroundColor: palette.bgElev,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      padding: 20,
    },
    // Empathy statement text: italic, matches drawer
    empathyStatementText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: palette.text,
      fontFamily: designFonts.serifItalic,
    },
    // Shared content delivery status indicator (orange for pending/delivered)
    sharedContentDeliveryStatus: {
      fontSize: 11,
      fontWeight: '500',
      color: palette.warning,
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    // Shared content delivery status for light backgrounds (orange for pending/delivered)
    sharedContentDeliveryStatusLight: {
      fontSize: 11,
      fontWeight: '500',
      color: palette.warning,
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    // Blue "Sending" status (optimistic UI - message being sent)
    sharedContentDeliveryStatusSending: {
      color: palette.info,
      fontStyle: 'italic',
    },
    // Green "Seen" status (dark background)
    sharedContentDeliveryStatusSeen: {
      color: palette.success,
    },
    // Green "Seen" status (light background)
    sharedContentDeliveryStatusSeenLight: {
      color: palette.success,
    },
    // Gray "Superseded" status (content was replaced by updated version)
    sharedContentDeliveryStatusSuperseded: {
      color: palette.textFaint,
      fontStyle: 'italic',
    },
    // Shared context: subtle container
    sharedContextContainer: {
      alignItems: 'flex-start',
      marginVertical: t.spacing.md,
    },
    sharedContextSentContainer: {
      alignItems: 'flex-end',
      marginVertical: t.spacing.md,
    },
    sharedContextBubble: {
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      padding: 16,
    },
    sharedContextLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: palette.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      fontFamily: designFonts.mono,
    },
    sharedContextText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: palette.text,
      fontFamily: designFonts.sans,
    },
    // Share suggestion: what user will share (from reconciler)
    shareSuggestionContainer: {
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    shareSuggestionBubble: {
      backgroundColor: palette.bgElev,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      padding: 20,
    },
    shareSuggestionLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: palette.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      fontFamily: designFonts.mono,
    },
    shareSuggestionText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: palette.text,
      fontFamily: designFonts.serifItalic,
    },
    text: {
      fontSize: 15,
      lineHeight: 23,
      color: palette.text,
      fontFamily: designFonts.sans,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
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
      color: palette.textMuted,
      fontFamily: designFonts.mono,
    },
    systemTime: {
      textAlign: 'center',
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: palette.textFaint,
      fontFamily: designFonts.sans,
    },
    statusSending: {
      fontStyle: 'italic',
    },
    statusRead: {
      color: palette.accent,
    },
    statusError: {
      color: palette.danger,
    },
  }));
};
