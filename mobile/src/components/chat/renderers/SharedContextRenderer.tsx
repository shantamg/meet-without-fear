/**
 * SharedContextRenderer
 *
 * Renders context shared from subject to guesser via reconciler.
 * Shows "New context from [partner]" with light background.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { AnimationState, SharedContextItem } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { designFonts, useAppAppearance } from '../../../theme';
import type { ChatItemRendererProps } from './types';

/** Duration of the fade-in animation (ms) */
const FADE_DURATION_MS = 400;

type SharedContextRendererProps = ChatItemRendererProps<SharedContextItem>;

export function SharedContextRenderer({
  item,
  animationState,
  onAnimationComplete,
}: SharedContextRendererProps) {
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

  const contextLabel = item.partnerName
    ? `New context from ${item.partnerName}`
    : 'New context from your partner';

  const content = (
    <View style={styles.frame}>
      <View style={styles.line} />
      <View style={styles.inner}>
        <View style={styles.labelRow}>
          <Text style={styles.arrow}>↓</Text>
          <Text style={styles.label}>{contextLabel}</Text>
        </View>
        <Text style={styles.contentText}>{item.content}</Text>
      </View>
      <View style={styles.line} />
    </View>
  );

  // Wrap in animated view if animating
  const isAnimating = animationState === AnimationState.ANIMATING && !hasAnimatedRef.current;

  return (
    <View style={styles.container} testID={`shared-context-${item.id}`}>
      {isAnimating ? (
        <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>
      ) : (
        content
      )}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      marginVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      alignItems: 'center',
    },
    frame: {
      width: '92%',
    },
    line: {
      width: '100%',
      height: 1,
      backgroundColor: palette.border,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    arrow: {
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 22,
      color: palette.accent,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.accent,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      fontFamily: designFonts.mono,
      flexShrink: 1,
    },
    inner: {
      paddingVertical: 18,
      paddingHorizontal: 18,
      backgroundColor: palette.accentSoft,
    },
    contentText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: palette.text,
      fontFamily: designFonts.sans,
    },
  }));
};
