import { View, Text } from 'react-native';
import { MessageRole } from '@be-heard/shared';
import { createStyles, shadows } from '../theme/styled';
import { theme } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
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

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View
      style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
      </View>
      {showTimestamp && <Text style={styles.time}>{formatTime(message.timestamp)}</Text>}
    </View>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.xl,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    aiContainer: {
      alignItems: 'flex-start',
    },
    bubble: {
      maxWidth: '80%',
      padding: t.spacing.md,
      borderRadius: 18,
      borderWidth: 1,
    },
    userBubble: {
      backgroundColor: t.colors.accent,
      borderColor: t.colors.accentHover,
      borderBottomRightRadius: 6,
      ...shadows.md,
    },
    aiBubble: {
      backgroundColor: t.colors.bgSecondary,
      borderColor: t.colors.border,
      borderBottomLeftRadius: 6,
      ...shadows.sm,
    },
    text: {
      fontSize: t.typography.fontSize.lg,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    userText: {
      color: t.colors.textPrimary,
    },
    time: {
      fontSize: t.typography.fontSize.sm,
      color: theme.colors.textMuted,
      marginTop: t.spacing.xs,
    },
  }));
