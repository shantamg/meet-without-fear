/**
 * CompactChatItem Component
 *
 * Displays a brief, warm AI opening message during onboarding.
 * Replaces the formal Curiosity Compact terms with a conversational welcome.
 *
 * First session: "You'll each chat with me privately first. Nothing gets shared without your say. Ready?"
 * Repeat session: "Welcome back. Same as before — your space is private, nothing shared without your say. Let's pick up where we left off."
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
  "You'll each chat with me privately first. Nothing gets shared without your say. Ready?";

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
