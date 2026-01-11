import { useRef, useEffect, useCallback } from 'react';
import { View, Text, Animated } from 'react-native';
import { MessageRole, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';
import { TypewriterText } from './TypewriterText';
import { SpeakerButton } from './SpeakerButton';

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
  /** If true, skip animation (for messages loaded from history) */
  skipTypewriter?: boolean;
  /** Delivery status for shared content messages (EMPATHY_STATEMENT, SHARED_CONTEXT) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
  /** Enable typewriter effect for AI messages */
  enableTypewriter?: boolean;
  /** Callback when animation starts (to track animation state) */
  onTypewriterStart?: () => void;
  /** Callback when animation completes */
  onTypewriterComplete?: () => void;
  /** Callback during typewriter animation (for scrolling) */
  onTypewriterProgress?: () => void;
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

/** Delay between each word appearing (ms) */
const WORD_DELAY_MS = 70;

/** Duration of the fade-in animation for each word (ms) */
const FADE_DURATION_MS = 200;

/** Duration of the fade-in animation for non-typewriter messages (ms) */
const MESSAGE_FADE_DURATION_MS = 400;

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
  isSpeaking = false,
  onSpeakerPress,
  hideSpeaker = false,
  partnerName,
}: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isEmpathyStatement = message.role === MessageRole.EMPATHY_STATEMENT;
  const isSharedContext = (message.role as string) === 'SHARED_CONTEXT';
  const isShareSuggestion = (message.role as string) === 'SHARE_SUGGESTION';
  const isAI = !isUser && !isSystem && !isEmpathyStatement && !isSharedContext && !isShareSuggestion;
  const isIntervention = message.isIntervention ?? false;

  // Track if this specific message instance has completed animation
  const hasAnimatedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const messageIdRef = useRef(message.id);

  // Determine initial opacity: 0 if will animate, 1 otherwise
  const willAnimate = !isUser && !isAI && enableTypewriter && !message.skipTypewriter;

  // Animated value for fade-in (non-typewriter messages)
  // Start at 0 if this message will animate, 1 otherwise
  const fadeAnim = useRef(new Animated.Value(willAnimate && !hasAnimatedRef.current ? 0 : 1)).current;

  // Reset animation state if message ID changes
  if (messageIdRef.current !== message.id) {
    messageIdRef.current = message.id;
    hasAnimatedRef.current = false;
    hasStartedRef.current = false;
    // Start hidden if this message will animate
    fadeAnim.setValue(willAnimate ? 0 : 1);
  }

  // Store callbacks in refs to avoid re-triggering animation
  const onStartRef = useRef(onTypewriterStart);
  const onCompleteRef = useRef(onTypewriterComplete);
  const onProgressRef = useRef(onTypewriterProgress);
  onStartRef.current = onTypewriterStart;
  onCompleteRef.current = onTypewriterComplete;
  onProgressRef.current = onTypewriterProgress;

  // Determine if we should use typewriter effect (AI messages only)
  const shouldUseTypewriter = isAI && enableTypewriter && !message.skipTypewriter && !hasAnimatedRef.current;

  // Determine if we should use fade-in effect (non-AI, non-USER messages that should animate)
  const shouldUseFadeIn = !isUser && !isAI && enableTypewriter && !message.skipTypewriter && !hasAnimatedRef.current;

  // Track whether this message is next to animate (callback is provided)
  // This allows the effect to re-run when the message becomes "next"
  const isNextToAnimate = onTypewriterStart !== undefined;

  // Handle fade-in animation for non-typewriter messages
  // Only starts when this message is next in the animation queue (onTypewriterStart is provided)
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
  // Only starts when this message is next in the animation queue (onTypewriterStart is provided)
  useEffect(() => {
    if (shouldUseTypewriter && !hasStartedRef.current && isNextToAnimate && onStartRef.current) {
      hasStartedRef.current = true;
      onStartRef.current();
    }
  }, [shouldUseTypewriter, isNextToAnimate]);

  // Mark as animated when complete (for typewriter)
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
        return 'Pending review (not delivered yet)';
      case 'delivered':
        return 'Delivered';
      case 'seen':
        return '✓ Seen';
      case 'superseded':
        return 'Not Delivered (Updated Below)';
      default:
        return 'Pending review (not delivered yet)';
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
    if (isSharedContext) return styles.sharedContextContainer;
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

  // Check if this message is waiting to animate (not its turn yet)
  // For fade-in messages: willAnimate is true, hasn't started, not next in queue
  // For typewriter messages: shouldUseTypewriter is true, hasn't started, not next in queue
  const isWaitingToAnimate =
    ((willAnimate || shouldUseTypewriter) && !hasStartedRef.current && !isNextToAnimate);

  // Hide the entire bubble until it's this message's turn to animate
  // This prevents showing empty bubbles or bubble containers while waiting
  if (isWaitingToAnimate) {
    return null;
  }

  // Check if fade-in animation is in progress (for messages currently animating)
  const isFadeInAnimating = willAnimate && !hasAnimatedRef.current;

  const renderContent = () => {
    // Empathy statements - use fade-in for new messages
    if (isEmpathyStatement) {
      const deliveryStatus = message.sharedContentDeliveryStatus;
      const content = (
        <View>
          <Text style={styles.empathyStatementHeader}>What you shared</Text>
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
      const contextLabel = partnerName
        ? `New context from ${partnerName}`
        : 'New context from your partner';
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

    // Use typewriter for new AI messages
    // Note: We only reach here if !isWaitingToAnimate (checked at component level)
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
    // Shared content delivery status indicator (orange for pending/delivered)
    sharedContentDeliveryStatus: {
      fontSize: 11,
      fontWeight: '500',
      color: '#f97316', // Orange-500 for pending/delivered states
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    // Shared content delivery status for light backgrounds (orange for pending/delivered)
    sharedContentDeliveryStatusLight: {
      fontSize: 11,
      fontWeight: '500',
      color: '#ea580c', // Orange-600 for better contrast on light background
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    // Blue "Sending" status (optimistic UI - message being sent)
    sharedContentDeliveryStatusSending: {
      color: '#3b82f6', // Blue-500 - indicates active/in-progress
      fontStyle: 'italic',
    },
    // Green "Seen" status (dark background)
    sharedContentDeliveryStatusSeen: {
      color: '#22c55e', // Green-500
    },
    // Green "Seen" status (light background)
    sharedContentDeliveryStatusSeenLight: {
      color: '#16a34a', // Green-600 for better contrast on light
    },
    // Gray "Superseded" status (content was replaced by updated version)
    sharedContentDeliveryStatusSuperseded: {
      color: '#6b7280', // Gray-500 - muted to indicate outdated
      fontStyle: 'italic',
    },
    // Shared context: subtle container
    sharedContextContainer: {
      alignItems: 'flex-start',
      marginVertical: t.spacing.md,
    },
    sharedContextBubble: {
      backgroundColor: '#F0F4F8',
      borderRadius: 12,
      padding: 16,
      borderLeftWidth: 4,
      borderLeftColor: '#005AC1',
    },
    sharedContextLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: '#005AC1',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    sharedContextText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: '#1e293b', // Dark text for light background
      fontFamily: t.typography.fontFamily.regular,
    },
    // Share suggestion: what user will share (from reconciler)
    shareSuggestionContainer: {
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    shareSuggestionBubble: {
      backgroundColor: colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: '#005AC1',
      padding: 20,
    },
    shareSuggestionLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: '#005AC1',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    shareSuggestionText: {
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
