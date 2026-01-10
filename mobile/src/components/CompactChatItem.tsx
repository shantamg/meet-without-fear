/**
 * CompactChatItem Component
 *
 * Displays the Curiosity Compact with typewriter effects.
 * Shows intro text with typewriter effect, then a button to reveal the compact terms.
 * The compact terms are rendered as structured elements with proper indentation.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TypewriterText } from './TypewriterText';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CompactChatItemProps {
  testID?: string;
  /** Whether this is shown after accepting an invitation (adapts intro text) */
  isAfterInvitationAcceptance?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const INTRO_TEXT_NEW_SESSION = "Before we begin, I'd like you to review The Curiosity Compact. These are the commitments you'll both make to ensure a safe and productive conversation.";

const INTRO_TEXT_AFTER_ACCEPTANCE = "Thanks for accepting the invitation! Before we begin, I'd like you to review The Curiosity Compact. These are the commitments you'll both make to ensure a safe and productive conversation.";

const COMMITMENTS = [
  'Approach this process with curiosity rather than certainty',
  'Allow the AI to guide the pace of our work',
  'Share honestly within my private space',
  "Consider the other's perspective when presented",
  'Focus on understanding needs rather than winning arguments',
  'Take breaks when emotions run high',
];

const UNDERSTANDINGS = [
  'The AI will not judge who is right or wrong',
  'My raw thoughts remain private unless I consent to share',
  'Progress requires both parties to complete each stage',
  'I can pause at any time but cannot skip ahead',
];

// ============================================================================
// Subcomponents
// ============================================================================

interface CompactSectionProps {
  title: string;
  items: string[];
  startIndex: number;
  visibleCount: number;
  currentAnimatingIndex: number;
  onItemComplete: () => void;
}

function CompactSection({
  title,
  items,
  startIndex,
  visibleCount,
  currentAnimatingIndex,
  onItemComplete
}: CompactSectionProps) {
  const styles = useStyles();

  // Calculate which items in this section should be visible
  // startIndex is the global index where this section starts
  // Title counts as 1, then each item counts as 1
  const titleIndex = startIndex;
  const titleVisible = visibleCount > startIndex;
  const visibleItems = Math.max(0, visibleCount - startIndex - 1); // -1 for title

  if (!titleVisible) return null;

  return (
    <View style={styles.section}>
      <TypewriterText
        text={title}
        style={styles.messageText}
        skipAnimation={currentAnimatingIndex > titleIndex}
        onComplete={currentAnimatingIndex === titleIndex ? onItemComplete : undefined}
      />
      {items.slice(0, visibleItems).map((item, index) => {
        const itemIndex = startIndex + 1 + index; // +1 for title
        return (
          <View key={index} style={styles.bulletItem}>
            <Text style={styles.bullet}>-</Text>
            <View style={styles.bulletTextContainer}>
              <TypewriterText
                text={item}
                style={styles.bulletText}
                skipAnimation={currentAnimatingIndex > itemIndex}
                onComplete={currentAnimatingIndex === itemIndex ? onItemComplete : undefined}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// Component
// ============================================================================

export function CompactChatItem({ testID, isAfterInvitationAcceptance = false }: CompactChatItemProps) {
  const styles = useStyles();
  const [introComplete, setIntroComplete] = useState(false);
  const [showCompact, setShowCompact] = useState(false);
  const [compactProgress, setCompactProgress] = useState(0);
  const [currentAnimatingIndex, setCurrentAnimatingIndex] = useState(0);

  const introText = isAfterInvitationAcceptance ? INTRO_TEXT_AFTER_ACCEPTANCE : INTRO_TEXT_NEW_SESSION;

  // Total items: title(1) + commitments title(1) + commitments(6) + understandings title(1) + understandings(4) = 13
  const totalItems = 1 + 1 + COMMITMENTS.length + 1 + UNDERSTANDINGS.length;

  // Start the compact typewriter sequence
  const startCompactSequence = () => {
    setShowCompact(true);
    setCompactProgress(1); // Show first item (main title)
    setCurrentAnimatingIndex(0); // Start animating first item
  };

  // Called when current item finishes its typewriter animation
  const handleItemComplete = () => {
    const nextIndex = currentAnimatingIndex + 1;
    if (nextIndex < totalItems) {
      setCompactProgress(nextIndex + 1); // Show next item
      setCurrentAnimatingIndex(nextIndex); // Start animating it
    }
  };

  return (
    <View style={styles.container} testID={testID || 'compact-chat-item'}>
      {/* AI-style intro with typewriter effect */}
      <View style={styles.messageContainer}>
        <TypewriterText
          text={introText}
          style={styles.messageText}
          onComplete={() => setIntroComplete(true)}
        />
      </View>

      {/* Show button after intro completes, hide when compact is shown */}
      {introComplete && !showCompact && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.viewButton}
            onPress={startCompactSequence}
            testID="view-compact-button"
          >
            <Text style={styles.viewButtonText}>View the Compact</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Compact terms with structured layout and typewriter-like reveal */}
      {showCompact && (
        <View style={styles.compactContainer}>
          {/* Title - index 0 */}
          {compactProgress >= 1 && (
            <TypewriterText
              text="The Curiosity Compact"
              style={styles.compactTitle}
              skipAnimation={currentAnimatingIndex > 0}
              onComplete={currentAnimatingIndex === 0 ? handleItemComplete : undefined}
            />
          )}

          {/* I commit to section - starts at index 1 */}
          <CompactSection
            title="I commit to:"
            items={COMMITMENTS}
            startIndex={1}
            visibleCount={compactProgress}
            currentAnimatingIndex={currentAnimatingIndex}
            onItemComplete={handleItemComplete}
          />

          {/* I understand that section - starts at index 1 + 1 + COMMITMENTS.length */}
          <CompactSection
            title="I understand that:"
            items={UNDERSTANDINGS}
            startIndex={2 + COMMITMENTS.length}
            visibleCount={compactProgress}
            currentAnimatingIndex={currentAnimatingIndex}
            onItemComplete={handleItemComplete}
          />
        </View>
      )}
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
    buttonContainer: {
      alignItems: 'center',
      marginTop: t.spacing.lg,
      marginBottom: t.spacing.md,
    },
    viewButton: {
      backgroundColor: 'rgb(59, 130, 246)', // Blue to match "Compact Signed" indicator
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.xl,
      borderRadius: t.radius.lg,
    },
    viewButtonText: {
      color: 'white',
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
    },
    compactContainer: {
      paddingHorizontal: t.spacing.lg,
      marginTop: t.spacing.lg,
    },
    compactTitle: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: t.spacing.md,
    },
    section: {
      marginTop: t.spacing.md,
    },
    bulletItem: {
      flexDirection: 'row',
      paddingLeft: t.spacing.md,
      marginTop: t.spacing.xs,
    },
    bullet: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      marginRight: t.spacing.sm,
    },
    bulletTextContainer: {
      flex: 1,
    },
    bulletText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
  }));

export default CompactChatItem;
