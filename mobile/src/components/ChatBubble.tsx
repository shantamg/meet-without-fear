import { View, Text } from 'react-native';
import { MessageRole } from '@be-heard/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  isIntervention?: boolean;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({ message, showTimestamp = true }: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isIntervention = message.isIntervention ?? false;

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    return styles.text;
  };

  return (
    <View
      style={[styles.container, getContainerStyle()]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, getBubbleStyle()]}>
        <Text style={getTextStyle()}>{message.content}</Text>
      </View>
      {showTimestamp && (
        <Text style={[styles.time, isSystem && styles.systemTime]}>
          {formatTime(message.timestamp)}
        </Text>
      )}
    </View>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    aiContainer: {
      alignItems: 'flex-start',
    },
    systemContainer: {
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
    },
    // User messages: bgSecondary background, 16px border-radius
    userBubble: {
      backgroundColor: colors.bgSecondary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 16,
    },
    // AI messages: no background, just text
    aiBubble: {
      padding: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: colors.bgTertiary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: colors.textSecondary,
      fontFamily: t.typography.fontFamily.regular,
      textAlign: 'center',
    },
    time: {
      fontSize: t.typography.fontSize.sm,
      color: colors.textSecondary,
      marginTop: t.spacing.xs,
    },
    systemTime: {
      textAlign: 'center',
    },
  }));
