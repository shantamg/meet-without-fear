/**
 * CompactChatItem Component
 *
 * Displays a brief, warm AI opening message during onboarding.
 * Replaces the formal Curiosity Compact terms with a conversational welcome.
 */

import { View } from 'react-native';
import { TypewriterText } from './TypewriterText';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CompactChatItemProps {
  testID?: string;
  /** Whether this is the first session for this relationship */
  isFirstSession?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const FIRST_SESSION_TEXT =
  "I am here to help you work through conflict\u2014step by step.\n\nYou'll start by sharing what you believe is happening, privately.\n\nI don't share anything unless you approve it, ever.";

const REPEAT_SESSION_TEXT =
  "Welcome back. Same as before \u2014 your space is private, nothing shared without your say. Let's pick up where we left off.";

// ============================================================================
// Component
// ============================================================================

export function CompactChatItem({ testID, isFirstSession = true }: CompactChatItemProps) {
  const styles = useStyles();

  const messageText = isFirstSession ? FIRST_SESSION_TEXT : REPEAT_SESSION_TEXT;

  return (
    <View style={styles.container} testID={testID || 'compact-chat-item'}>
      <View style={styles.messageContainer}>
        <TypewriterText
          text={messageText}
          style={styles.messageText}
        />
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.md,
    },
    messageContainer: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
    },
    messageText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
  }));

export default CompactChatItem;
