/**
 * EmpathyStatementRenderer
 *
 * Renders user's shared empathy statement ("What you shared").
 * Centered with accent border, includes delivery status.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { AnimationState, EmpathyStatementItem, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { colors } from '../../../theme';
import type { ChatItemRendererProps } from './types';

/** Duration of the fade-in animation (ms) */
const FADE_DURATION_MS = 400;

type EmpathyStatementRendererProps = ChatItemRendererProps<EmpathyStatementItem>;

export function EmpathyStatementRenderer({
  item,
  animationState,
  onAnimationComplete,
}: EmpathyStatementRendererProps) {
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
      <Text style={styles.header}>What you shared</Text>
      <Text style={styles.contentText}>{item.content}</Text>
      {item.deliveryStatus && (
        <Text
          style={[
            styles.deliveryStatus,
            item.deliveryStatus === 'sending' && styles.deliveryStatusSending,
            item.deliveryStatus === 'seen' && styles.deliveryStatusSeen,
            item.deliveryStatus === 'superseded' && styles.deliveryStatusSuperseded,
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
    <View style={styles.container} testID={`empathy-statement-${item.id}`}>
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
      backgroundColor: colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.brandBlue,
      padding: 20,
    },
    header: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '700',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    contentText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    deliveryStatus: {
      fontSize: 11,
      fontWeight: '500',
      color: '#f97316', // Orange-500 for pending/delivered states
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    deliveryStatusSending: {
      color: '#3b82f6', // Blue-500 - indicates active/in-progress
      fontStyle: 'italic',
    },
    deliveryStatusSeen: {
      color: '#22c55e', // Green-500
    },
    deliveryStatusSuperseded: {
      color: '#6b7280', // Gray-500 - muted to indicate outdated
      fontStyle: 'italic',
    },
  }));
