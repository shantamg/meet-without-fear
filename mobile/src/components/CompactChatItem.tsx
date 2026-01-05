/**
 * CompactChatItem Component
 *
 * An inline chat item that displays the Curiosity Compact terms.
 * This replaces the full-screen overlay approach, allowing the compact
 * to be the first item in the chat, with a container around it.
 */

import { View, Text } from 'react-native';
import { CompactTerms } from './CompactTerms';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CompactChatItemProps {
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CompactChatItem({ testID }: CompactChatItemProps) {
  const styles = useStyles();

  return (
    <View style={styles.container} testID={testID || 'compact-chat-item'}>
      <View style={styles.header}>
        <Text style={styles.title}>The Curiosity Compact</Text>
        <Text style={styles.subtitle}>
          Before we begin, please review these commitments
        </Text>
      </View>

      <View style={styles.termsContainer}>
        <CompactTerms />
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
      marginHorizontal: t.spacing.md,
      marginVertical: t.spacing.lg,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.xl,
      overflow: 'hidden',
    },
    header: {
      padding: t.spacing.lg,
      backgroundColor: t.colors.bgTertiary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: t.colors.textPrimary,
      textAlign: 'center',
      marginBottom: t.spacing.xs,
    },
    subtitle: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    termsContainer: {
      padding: t.spacing.lg,
      maxHeight: 300, // Limit height so it doesn't dominate the chat
    },
  }));

export default CompactChatItem;
