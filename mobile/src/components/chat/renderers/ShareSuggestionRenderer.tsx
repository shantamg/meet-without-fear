/**
 * ShareSuggestionRenderer
 *
 * Renders AI-suggested content for subject to share with guesser.
 * Shows "SUGGESTED TO SHARE" with the proposed content.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { AnimationState, ShareSuggestionItem } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { colors } from '../../../theme';
import type { ChatItemRendererProps } from './types';

/** Duration of the fade-in animation (ms) */
const FADE_DURATION_MS = 400;

type ShareSuggestionRendererProps = ChatItemRendererProps<ShareSuggestionItem>;

export function ShareSuggestionRenderer({
  item,
  animationState,
  onAnimationComplete,
}: ShareSuggestionRendererProps) {
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

  const content = (
    <View>
      <Text style={styles.label}>SUGGESTED TO SHARE</Text>
      <Text style={styles.contentText}>"{item.content}"</Text>
    </View>
  );

  // Wrap in animated view if animating
  const isAnimating = animationState === AnimationState.ANIMATING && !hasAnimatedRef.current;

  return (
    <View style={styles.container} testID={`share-suggestion-${item.id}`}>
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
      marginVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: '#005AC1',
      padding: 20,
    },
    label: {
      fontSize: 10,
      fontWeight: '700',
      color: '#005AC1',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    contentText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
  }));
