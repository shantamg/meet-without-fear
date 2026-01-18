/**
 * AIMessageRenderer
 *
 * Renders AI-generated messages with streaming text animation.
 * Full-width, no bubble background (clean, modern look).
 *
 * Wrapped in React.memo with custom comparison to prevent unnecessary re-renders
 * when parent components update (e.g., invitation confirmation).
 */

import { useRef, useCallback, memo } from 'react';
import { View, Text } from 'react-native';
import { AnimationState, AIMessageItem } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { StreamingText } from '../../StreamingText';
import { SpeakerButton } from '../../SpeakerButton';
import type { ChatItemRendererProps } from './types';

interface AIMessageRendererProps extends ChatItemRendererProps<AIMessageItem> {
  /** Whether speech is currently playing for this message */
  isSpeaking?: boolean;
  /** Callback when speaker button is pressed */
  onSpeakerPress?: () => void;
  /** Hide speaker button */
  hideSpeaker?: boolean;
}

/** Duration of the fade-in animation for streaming text (ms) */
const STREAMING_FADE_DURATION_MS = 200;

function AIMessageRendererImpl({
  item,
  animationState,
  onAnimationComplete,
  isSpeaking = false,
  onSpeakerPress,
  hideSpeaker = false,
}: AIMessageRendererProps) {
  const styles = useStyles();

  // Track if animation has completed for this instance
  const hasAnimatedRef = useRef(false);
  const itemIdRef = useRef(item.id);

  // Reset if item ID changes
  if (itemIdRef.current !== item.id) {
    itemIdRef.current = item.id;
    hasAnimatedRef.current = false;
  }

  // Store callback in ref to avoid triggering re-renders
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  // Handle streaming text completion
  const handleComplete = useCallback(() => {
    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      onCompleteRef.current?.();
    }
  }, []);

  // If hidden, render nothing
  if (animationState === AnimationState.HIDDEN) {
    return null;
  }

  // For already-complete animations or history items, render plain text
  if (animationState === AnimationState.COMPLETE || hasAnimatedRef.current) {
    return (
      <View style={styles.container} testID={`ai-message-${item.id}`}>
        <View style={styles.bubble}>
          <Text style={styles.text}>{item.content}</Text>
        </View>
        <View style={styles.metaContainer}>
          {!hideSpeaker && onSpeakerPress && (
            <SpeakerButton
              isSpeaking={isSpeaking}
              onPress={onSpeakerPress}
              testID={`speaker-${item.id}`}
            />
          )}
        </View>
      </View>
    );
  }

  // Animating: use StreamingText for fade-in effect
  return (
    <View style={styles.container} testID={`ai-message-${item.id}`}>
      <View style={styles.bubble}>
        <StreamingText
          text={item.content}
          style={styles.text}
          fadeDuration={STREAMING_FADE_DURATION_MS}
          onComplete={handleComplete}
        />
      </View>
      <View style={styles.metaContainer}>
        {!hideSpeaker && onSpeakerPress && (
          <SpeakerButton
            isSpeaking={isSpeaking}
            onPress={onSpeakerPress}
            testID={`speaker-${item.id}`}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Custom comparison for React.memo to prevent unnecessary re-renders.
 *
 * We only re-render if:
 * - item.id changes (different message)
 * - item.content changes (streaming update)
 * - animationState changes
 * - isSpeaking changes
 *
 * We ignore callback changes (onAnimationComplete, onSpeakerPress) as they're
 * stored in refs and don't affect rendering.
 */
function arePropsEqual(
  prevProps: AIMessageRendererProps,
  nextProps: AIMessageRendererProps
): boolean {
  // Must re-render if item ID changes (different message)
  if (prevProps.item.id !== nextProps.item.id) return false;

  // Must re-render if content changes (streaming)
  if (prevProps.item.content !== nextProps.item.content) return false;

  // Must re-render if animation state changes
  if (prevProps.animationState !== nextProps.animationState) return false;

  // Must re-render if speaking state changes
  if (prevProps.isSpeaking !== nextProps.isSpeaking) return false;

  // Must re-render if speaker visibility changes
  if (prevProps.hideSpeaker !== nextProps.hideSpeaker) return false;

  // All relevant props are equal, skip re-render
  return true;
}

/**
 * Memoized AIMessageRenderer to prevent unnecessary re-renders.
 */
export const AIMessageRenderer = memo(AIMessageRendererImpl, arePropsEqual);

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
      alignItems: 'flex-start',
    },
    bubble: {
      // AI messages are full-width, no bubble background
      maxWidth: '100%',
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
  }));
