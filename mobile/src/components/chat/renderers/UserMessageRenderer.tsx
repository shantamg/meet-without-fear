/**
 * UserMessageRenderer
 *
 * Renders user-sent messages with status indicator.
 * Right-aligned with bubble background.
 * Shows retry button when message fails to send.
 *
 * Wrapped in React.memo to prevent unnecessary re-renders when parent updates.
 */

import { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AnimationState, UserMessageItem, UserMessageStatus } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { colors } from '../../../theme';
import type { ChatItemRendererProps } from './types';

interface UserMessageRendererProps extends ChatItemRendererProps<UserMessageItem> {
  /** Callback to retry sending a failed message */
  onRetry?: (content: string, failedMessageId: string) => void;
}

function UserMessageRendererImpl({
  item,
  animationState,
  onRetry,
}: UserMessageRendererProps) {
  const styles = useStyles();

  // User messages don't typically animate (they appear instantly)
  // But if hidden, don't render
  if (animationState === AnimationState.HIDDEN) {
    return null;
  }

  const getStatusText = (status: UserMessageStatus): string => {
    switch (status) {
      case UserMessageStatus.SENDING:
        return 'Sending...';
      case UserMessageStatus.SENT:
        return 'Sent';
      case UserMessageStatus.DELIVERED:
        return 'Delivered';
      case UserMessageStatus.READ:
        return 'Read';
      case UserMessageStatus.ERROR:
        return 'Failed to send';
    }
  };

  const showRetryButton = item.status === UserMessageStatus.ERROR && item.canRetry && onRetry;

  return (
    <View style={styles.container} testID={`user-message-${item.id}`}>
      <View style={[styles.bubble, item.status === UserMessageStatus.ERROR && styles.bubbleError]}>
        <Text style={styles.text}>{item.content}</Text>
      </View>
      {item.status && (
        <View style={styles.metaContainer}>
          <Text
            style={[
              styles.statusText,
              item.status === UserMessageStatus.SENDING && styles.statusSending,
              item.status === UserMessageStatus.READ && styles.statusRead,
              item.status === UserMessageStatus.ERROR && styles.statusError,
            ]}
          >
            {getStatusText(item.status)}
          </Text>
          {showRetryButton && (
            <TouchableOpacity
              onPress={() => onRetry(item.content, item.id)}
              style={styles.retryButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`retry-button-${item.id}`}
            >
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Custom comparison for React.memo - only re-render if relevant props change.
 */
function arePropsEqual(
  prevProps: UserMessageRendererProps,
  nextProps: UserMessageRendererProps
): boolean {
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.content !== nextProps.item.content) return false;
  if (prevProps.item.status !== nextProps.item.status) return false;
  if (prevProps.item.canRetry !== nextProps.item.canRetry) return false;
  if (prevProps.animationState !== nextProps.animationState) return false;
  if (prevProps.onRetry !== nextProps.onRetry) return false;
  return true;
}

export const UserMessageRenderer = memo(UserMessageRendererImpl, arePropsEqual);

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
      alignItems: 'flex-end',
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: colors.bgSecondary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 16,
    },
    bubbleError: {
      borderWidth: 1,
      borderColor: colors.error,
      opacity: 0.8,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: t.typography.fontFamily.regular,
    },
    statusSending: {
      fontStyle: 'italic',
    },
    statusRead: {
      color: colors.accent,
    },
    statusError: {
      color: colors.error,
    },
    retryButton: {
      marginLeft: t.spacing.xs,
    },
    retryText: {
      fontSize: t.typography.fontSize.xs,
      color: colors.accent,
      fontFamily: t.typography.fontFamily.medium,
      textDecorationLine: 'underline',
    },
  }));
