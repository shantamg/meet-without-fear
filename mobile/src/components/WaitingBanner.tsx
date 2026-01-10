/**
 * WaitingBanner Component
 *
 * A compact banner that appears above the chat input to show waiting status.
 * Uses configuration from waitingStatusConfig.ts for consistent UI behavior.
 */

import { View, Text, ActivityIndicator, Animated, TouchableOpacity } from 'react-native';
import { Layers } from 'lucide-react-native';
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
  /** Callback when "Keep Chatting" button is pressed */
  onKeepChatting?: () => void;
  /** Callback when "Inner Thoughts" link is pressed */
  onInnerThoughts?: () => void;
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
  onKeepChatting,
  onInnerThoughts,
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
  const showKeepChatting = config.showKeepChattingAction && onKeepChatting;
  const showInnerThoughtsLink = status === 'reconciler-analyzing' && config.showInnerThoughts && onInnerThoughts;

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

        {/* Keep Chatting action button */}
        {showKeepChatting && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.keepChattingButton}
              onPress={onKeepChatting}
              activeOpacity={0.7}
              testID={`${testID}-keep-chatting`}
            >
              <Layers size={18} color="#FFFFFF" />
              <Text style={styles.keepChattingButtonText}>Keep Chatting →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Inner thoughts link for reconciler-analyzing */}
        {showInnerThoughtsLink && (
          <TouchableOpacity
            style={styles.innerThoughtsLink}
            onPress={onInnerThoughts}
            testID={`${testID}-inner-thoughts`}
          >
            <Text style={styles.innerThoughtsLinkText}>
              Continue with Inner Thoughts while you wait →
            </Text>
          </TouchableOpacity>
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
    iconColor: {
      color: t.colors.textSecondary,
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
    actionsContainer: {
      marginTop: t.spacing.sm,
    },
    keepChattingButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.brandBlue,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.md,
      gap: t.spacing.xs,
    },
    keepChattingButtonText: {
      color: '#FFFFFF',
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600',
    },
    innerThoughtsLink: {
      marginTop: t.spacing.sm,
      paddingVertical: t.spacing.xs,
    },
    innerThoughtsLinkText: {
      color: t.colors.brandBlue,
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600',
    },
  }));

export default WaitingBanner;
