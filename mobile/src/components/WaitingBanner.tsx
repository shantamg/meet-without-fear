/**
 * WaitingBanner Component
 *
 * A compact banner that appears above the chat input to show waiting status.
 * Uses configuration from waitingStatusConfig.ts for consistent UI behavior.
 */

import { View, Text, ActivityIndicator, Animated, Pressable } from 'react-native';
import { Clock3 } from 'lucide-react-native';
import { createStyles } from '../theme/styled';
import type { WaitingStatusState } from '../utils/getWaitingStatus';
import { getWaitingStatusConfig } from '../config/waitingStatusConfig';
import { designFonts, radius, spacing, useAppAppearance } from '../theme';

const WAITING_BANNER_EXPANDED_MAX_HEIGHT = 150;
const WAITING_BANNER_ENTER_OFFSET = 20;
const WAITING_BANNER_TEXT_LINE_HEIGHT = 20;
const WAITING_BANNER_SUBTEXT_LINE_HEIGHT = 18;
const WAITING_BANNER_ACTION_MIN_HEIGHT = 36;
const WAITING_BANNER_BORDER_ACCENT_WIDTH = 3;

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
            outputRange: [0, WAITING_BANNER_EXPANDED_MAX_HEIGHT],
          }),
          transform: [{
            translateY: animationValue.interpolate({
              inputRange: [0, 1],
              outputRange: [WAITING_BANNER_ENTER_OFFSET, 0],
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
        <View style={styles.iconWrap}>
          {config.showSpinner ? (
            <ActivityIndicator
              size="small"
              color={styles.spinnerColor.color}
              testID={`${testID}-spinner`}
            />
          ) : (
            <Clock3 color={styles.spinnerColor.color} size={16} strokeWidth={2.4} />
          )}
        </View>

        <View style={styles.textBlock}>
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
              accessibilityLabel="Breathe"
              accessibilityHint="Opens breathing and grounding exercises"
            >
              <Text style={styles.exerciseLinkText}>
                Breathe
              </Text>
            </Pressable>
          )}
        </View>
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
      borderLeftWidth: WAITING_BANNER_BORDER_ACCENT_WIDTH,
      borderLeftColor: palette.info,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.spacing.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
    },
    iconWrap: {
      width: spacing['2xl'],
      height: spacing['2xl'],
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    spinnerColor: {
      color: palette.info,
    },
    textBlock: {
      flex: 1,
      minWidth: 0,
    },
    text: {
      fontSize: t.typography.fontSize.base,
      lineHeight: WAITING_BANNER_TEXT_LINE_HEIGHT,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
    },
    subtext: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: WAITING_BANNER_SUBTEXT_LINE_HEIGHT,
      color: palette.textFaint,
      marginTop: t.spacing.xs,
      fontFamily: designFonts.sans,
    },
    exerciseLink: {
      marginTop: t.spacing.xs,
      minHeight: WAITING_BANNER_ACTION_MIN_HEIGHT,
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    exerciseLinkText: {
      fontSize: t.typography.fontSize.sm,
      color: palette.accent,
      textDecorationLine: 'underline',
      fontFamily: designFonts.sans,
    },
    actionButton: {
      marginTop: t.spacing.sm,
      minHeight: WAITING_BANNER_ACTION_MIN_HEIGHT,
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.md,
      backgroundColor: palette.accent,
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      fontSize: t.typography.fontSize.sm,
      color: palette.bg,
      fontWeight: '700',
      fontFamily: designFonts.sans,
    },
  }));
  };

export default WaitingBanner;
