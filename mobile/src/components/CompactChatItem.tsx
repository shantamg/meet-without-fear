/**
 * CompactChatItem Component
 *
 * An inline chat item that displays the Curiosity Compact terms.
 * The intro text appears like a regular AI message, followed by the compact card.
 * Used during onboarding when the compact has not been signed.
 */

import { View, Text, ScrollView } from 'react-native';
import { CompactTerms } from './CompactTerms';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CompactChatItemProps {
  testID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const INTRO_TEXT = "Before we begin, I'd like you to review The Curiosity Compact. These are the commitments we'll both make to ensure a safe and productive conversation.";

// ============================================================================
// Component
// ============================================================================

export function CompactChatItem({ testID }: CompactChatItemProps) {
  const styles = useStyles();

  return (
    <View style={styles.container} testID={testID || 'compact-chat-item'}>
      {/* AI-style intro - matches ChatBubble AI message styling */}
      <View style={styles.messageContainer}>
        <View style={styles.messageBubble}>
          <Text style={styles.messageText}>{INTRO_TEXT}</Text>
        </View>
      </View>

      {/* Compact card */}
      <View style={styles.compactCard}>
        <View style={styles.header}>
          <Text style={styles.title}>The Curiosity Compact</Text>
        </View>

        <ScrollView
          style={styles.termsScrollView}
          contentContainerStyle={styles.termsContainer}
          showsVerticalScrollIndicator={true}
        >
          <CompactTerms />
        </ScrollView>
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
      flex: 1,
      paddingTop: t.spacing.md,
    },
    // Matches ChatBubble container style for AI messages
    messageContainer: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
      alignItems: 'flex-start',
    },
    // Matches ChatBubble aiBubble style - transparent, full width
    messageBubble: {
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: 0,
      maxWidth: '100%',
    },
    // Matches ChatBubble text style for AI messages
    messageText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    compactCard: {
      marginTop: t.spacing.md,
      marginHorizontal: t.spacing.lg,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.xl,
      overflow: 'hidden',
      maxHeight: 350,
    },
    header: {
      padding: t.spacing.md,
      backgroundColor: t.colors.bgTertiary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: t.colors.textPrimary,
      textAlign: 'center',
    },
    termsScrollView: {
      maxHeight: 280,
    },
    termsContainer: {
      padding: t.spacing.md,
    },
  }));

export default CompactChatItem;
