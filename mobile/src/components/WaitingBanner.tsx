/**
 * WaitingBanner Component
 *
 * A compact banner that appears above the chat input to show waiting status.
 * Uses configuration from waitingStatusConfig.ts for consistent UI behavior.
 */

import { View, Text, ActivityIndicator, Animated, Pressable } from 'react-native';
import { createStyles } from '../theme/styled';
import type { WaitingStatusState } from '../utils/getWaitingStatus';
import { getWaitingStatusConfig } from '../config/waitingStatusConfig';

// ============================================================================
// Types
// ============================================================================

interface WaitingBannerProps {
  /** Current waiting status */
  status: WaitingStatusState;
  /** Partner's display name for text interpolation */
  partnerName: string;
  /** Animation value for slide-up effect (0 = hidden, 1 = visible) */
  animationValue?: Animated.Value;
  /** Callback when user taps the breathing exercise link */
  onExercisePress?: () => void;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function WaitingBanner({
  status,
  partnerName,
  animationValue,
  onExercisePress,
  testID = 'waiting-banner',
}: WaitingBannerProps) {
  const styles = useStyles();

  // Get config for this status
  const config = getWaitingStatusConfig(status);

  // Don't render if no banner should show
  if (!status || !config.showBanner || !config.bannerText) {
    return null;
  }

  const bannerText = config.bannerText(partnerName);

  // If animation value is provided, use it for height animation
  const containerStyle = animationValue
    ? [
        styles.container,
        {
          opacity: animationValue,
          maxHeight: animationValue.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 150],
          }),
          transform: [{
            translateY: animationValue.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          }],
          overflow: 'hidden' as const,
        },
      ]
    : styles.container;

  return (
    <Animated.View style={containerStyle} testID={testID}>
      <View style={styles.content}>
        {/* Spinner for analyzing state */}
        {config.showSpinner && (
          <ActivityIndicator
            size="small"
            color={styles.spinnerColor.color}
            style={styles.spinner}
            testID={`${testID}-spinner`}
          />
        )}

        {/* Main text */}
        <Text style={styles.text} testID={`${testID}-text`}>
          {bannerText}
        </Text>

        {/* Subtext if present */}
        {config.bannerSubtext && (
          <Text style={styles.subtext} testID={`${testID}-subtext`}>
            {config.bannerSubtext}
          </Text>
        )}

        {/* Breathing exercise link */}
        {onExercisePress && (
          <Pressable
            onPress={onExercisePress}
            style={styles.exerciseLink}
            testID={`${testID}-exercise-link`}
            accessibilityRole="button"
            accessibilityLabel="Take a breath while you wait"
            accessibilityHint="Opens breathing and grounding exercises"
          >
            <Text style={styles.exerciseLinkText}>
              Take a breath while you wait
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    content: {
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    spinner: {
      marginBottom: t.spacing.xs,
    },
    spinnerColor: {
      color: t.colors.brandBlue,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textSecondary,
      textAlign: 'center',
    },
    subtext: {
      fontSize: 12,
      lineHeight: 18,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginTop: 2,
    },
    exerciseLink: {
      marginTop: t.spacing.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    exerciseLinkText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.accent,
      textDecorationLine: 'underline',
    },
  }));

export default WaitingBanner;
