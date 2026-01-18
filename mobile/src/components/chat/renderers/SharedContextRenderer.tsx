/**
 * SharedContextRenderer
 *
 * Renders context shared from subject to guesser via reconciler.
 * Shows "New context from [partner]" with light background.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { AnimationState, SharedContextItem, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
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

  const getDeliveryStatusText = (status: SharedContentDeliveryStatus): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'pending':
        return 'Pending review (not delivered yet)';
      case 'delivered':
        return 'Delivered';
      case 'seen':
        return '\u2713 Seen';
      case 'superseded':
        return 'Not Delivered (Updated Below)';
    }
  };

  const content = (
    <View>
      <Text style={styles.label}>{contextLabel}</Text>
      <Text style={styles.contentText}>{item.content}</Text>
      {item.deliveryStatus && (
        <Text
          style={[
            styles.deliveryStatus,
            item.deliveryStatus === 'seen' && styles.deliveryStatusSeen,
          ]}
        >
          {getDeliveryStatusText(item.deliveryStatus)}
        </Text>
      )}
    </View>
  );

  // Wrap in animated view if animating
  const isAnimating = animationState === AnimationState.ANIMATING && !hasAnimatedRef.current;

  return (
    <View style={styles.container} testID={`shared-context-${item.id}`}>
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
      alignItems: 'flex-start',
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: '#F0F4F8',
      borderRadius: 12,
      padding: 16,
      borderLeftWidth: 4,
      borderLeftColor: '#005AC1',
    },
    label: {
      fontSize: 10,
      fontWeight: '700',
      color: '#005AC1',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    contentText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: '#1e293b', // Dark text for light background
      fontFamily: t.typography.fontFamily.regular,
    },
    deliveryStatus: {
      fontSize: 11,
      fontWeight: '500',
      color: '#ea580c', // Orange-600 for better contrast on light background
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    deliveryStatusSeen: {
      color: '#16a34a', // Green-600 for better contrast on light
    },
  }));
