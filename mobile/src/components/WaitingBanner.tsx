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
import { designFonts, useAppAppearance } from '../theme';

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
  /** Optional action button (e.g. "Review"). Label comes from the status config; host wires the handler. */
  onActionPress?: () => void;
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
  onActionPress,
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

        {/* Inline action button (e.g. Review). Driven by config.actionLabel. */}
        {config.actionLabel && onActionPress && (
          <Pressable
            onPress={onActionPress}
            style={styles.actionButton}
            testID={`${testID}-action`}
            accessibilityRole="button"
            accessibilityLabel={config.actionLabel}
          >
            <Text style={styles.actionButtonText}>{config.actionLabel}</Text>
          </Pressable>
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
  {
    const { palette } = useAppAppearance();
    return createStyles((t) => ({
    container: {
      backgroundColor: palette.bg,
      borderTopWidth: 1,
      borderTopColor: palette.border,
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
      color: palette.info,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: palette.textMuted,
      textAlign: 'center',
      fontFamily: designFonts.sans,
    },
    subtext: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.textFaint,
      textAlign: 'center',
      marginTop: 2,
      fontFamily: designFonts.sans,
    },
    exerciseLink: {
      marginTop: t.spacing.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    exerciseLinkText: {
      fontSize: t.typography.fontSize.sm,
      color: palette.accent,
      textDecorationLine: 'underline',
      fontFamily: designFonts.sans,
    },
    actionButton: {
      marginTop: t.spacing.sm,
      minHeight: 44,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      fontSize: t.typography.fontSize.md,
      color: palette.bg,
      fontWeight: '700',
      fontFamily: designFonts.sans,
    },
  }));
  };

export default WaitingBanner;
