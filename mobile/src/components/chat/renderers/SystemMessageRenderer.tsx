/**
 * SystemMessageRenderer
 *
 * Renders system-generated messages (transitions, notifications).
 * Centered with muted styling.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { AnimationState, SystemMessageItem } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { colors } from '../../../theme';
import type { ChatItemRendererProps } from './types';

/** Duration of the fade-in animation (ms) */
const FADE_DURATION_MS = 400;

type SystemMessageRendererProps = ChatItemRendererProps<SystemMessageItem>;

export function SystemMessageRenderer({
  item,
  animationState,
  onAnimationComplete,
}: SystemMessageRendererProps) {
  const styles = useStyles();

  // Track animation state
  const hasAnimatedRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const itemIdRef = useRef(item.id);

  // Store callback in ref
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  // Reset if item ID changes
  if (itemIdRef.current !== item.id) {
    itemIdRef.current = item.id;
    hasAnimatedRef.current = false;
    fadeAnim.setValue(0);
  }

  // Run fade-in animation when state is ANIMATING
  useEffect(() => {
    if (animationState === AnimationState.ANIMATING && !hasAnimatedRef.current) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        hasAnimatedRef.current = true;
        onCompleteRef.current?.();
      });
    } else if (animationState === AnimationState.COMPLETE) {
      fadeAnim.setValue(1);
    }
  }, [animationState, fadeAnim]);

  // If hidden, render nothing
  if (animationState === AnimationState.HIDDEN) {
    return null;
  }

  const content = <Text style={styles.text}>{item.content}</Text>;

  // Wrap in animated view if animating
  const isAnimating = animationState === AnimationState.ANIMATING && !hasAnimatedRef.current;

  return (
    <View style={styles.container} testID={`system-message-${item.id}`}>
      <View style={styles.bubble}>
        {isAnimating ? (
          <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>
        ) : (
          content
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
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: colors.bgTertiary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: colors.textSecondary,
      fontFamily: t.typography.fontFamily.regular,
      textAlign: 'center',
    },
  }));
