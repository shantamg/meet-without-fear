/**
 * UserMessageRenderer
 *
 * Renders user-sent messages with status indicator.
 * Right-aligned with bubble background.
 *
 * Wrapped in React.memo to prevent unnecessary re-renders when parent updates.
 */

import { memo } from 'react';
import { View, Text } from 'react-native';
import { AnimationState, UserMessageItem, UserMessageStatus } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import { colors } from '../../../theme';
import type { ChatItemRendererProps } from './types';

type UserMessageRendererProps = ChatItemRendererProps<UserMessageItem>;

function UserMessageRendererImpl({
  item,
  animationState,
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

  return (
    <View style={styles.container} testID={`user-message-${item.id}`}>
      <View style={styles.bubble}>
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
  if (prevProps.animationState !== nextProps.animationState) return false;
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
  }));
