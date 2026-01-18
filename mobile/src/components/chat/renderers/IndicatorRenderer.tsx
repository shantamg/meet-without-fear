/**
 * IndicatorRenderer
 *
 * Renders timeline indicators that mark significant events/milestones.
 * Examples: invitation sent, compact signed, feel-heard confirmed.
 *
 * Wrapped in React.memo to prevent unnecessary re-renders when parent updates.
 */

import { memo } from 'react';
import { View, Text } from 'react-native';
import { AnimationState, IndicatorItem, IndicatorType } from '@meet-without-fear/shared';
import { createStyles } from '../../../theme/styled';
import type { ChatItemRendererProps } from './types';

type IndicatorRendererProps = ChatItemRendererProps<IndicatorItem>;

function IndicatorRendererImpl({
  item,
  animationState,
}: IndicatorRendererProps) {
  const styles = useStyles();

  // Indicators typically don't animate but if hidden, don't render
  if (animationState === AnimationState.HIDDEN) {
    return null;
  }

  const getIndicatorText = (): string => {
    switch (item.indicatorType) {
      case IndicatorType.INVITATION_SENT:
        return 'Invitation Sent';
      case IndicatorType.INVITATION_ACCEPTED:
        return 'Accepted Invitation';
      case IndicatorType.STAGE_TRANSITION:
        return 'Moving Forward';
      case IndicatorType.SESSION_START:
        return 'Session Started';
      case IndicatorType.FEEL_HEARD:
        return 'Felt Heard';
      case IndicatorType.COMPACT_SIGNED:
        return 'Compact Signed';
      default:
        return '';
    }
  };

  const getLineStyle = () => {
    switch (item.indicatorType) {
      case IndicatorType.INVITATION_SENT:
      case IndicatorType.INVITATION_ACCEPTED:
        return styles.invitationSentLine;
      case IndicatorType.FEEL_HEARD:
        return styles.feelHeardLine;
      case IndicatorType.COMPACT_SIGNED:
        return styles.compactSignedLine;
      default:
        return styles.defaultLine;
    }
  };

  const getTextStyle = () => {
    switch (item.indicatorType) {
      case IndicatorType.INVITATION_SENT:
      case IndicatorType.INVITATION_ACCEPTED:
        return styles.invitationSentText;
      case IndicatorType.FEEL_HEARD:
        return styles.feelHeardText;
      case IndicatorType.COMPACT_SIGNED:
        return styles.compactSignedText;
      default:
        return styles.defaultText;
    }
  };

  return (
    <View style={styles.container} testID={`indicator-${item.id}`}>
      <View style={styles.lineContainer}>
        <View style={[styles.line, getLineStyle()]} />
        <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
        <View style={[styles.line, getLineStyle()]} />
      </View>
    </View>
  );
}

/**
 * Custom comparison for React.memo - only re-render if relevant props change.
 */
function arePropsEqual(
  prevProps: IndicatorRendererProps,
  nextProps: IndicatorRendererProps
): boolean {
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.indicatorType !== nextProps.item.indicatorType) return false;
  if (prevProps.animationState !== nextProps.animationState) return false;
  return true;
}

export const IndicatorRenderer = memo(IndicatorRendererImpl, arePropsEqual);

const useStyles = () =>
  createStyles((t) => ({
    container: {
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    lineContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: t.colors.border,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    // Invitation sent: yellow/amber tint
    invitationSentLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    invitationSentText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Feel heard: teal/green tint for completion feeling
    feelHeardLine: {
      backgroundColor: 'rgba(20, 184, 166, 0.3)',
    },
    feelHeardText: {
      color: 'rgba(20, 184, 166, 0.9)',
    },
    // Compact signed: dark blue tint for commitment
    compactSignedLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    compactSignedText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    defaultLine: {
      backgroundColor: t.colors.border,
    },
    defaultText: {
      color: t.colors.textMuted,
    },
  }));
