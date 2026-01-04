/**
 * ReadyToShareConfirmation Component
 *
 * Compact inline banner for Stage 2 empathy sharing confirmation.
 * Asks if user is ready to share their empathy attempt with partner.
 * Displays the AI-proposed empathy statement (truncated if long).
 * Tap the statement to view full text in a drawer.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Constants
// ============================================================================

const MAX_STATEMENT_LENGTH = 150; // Characters before truncation

// ============================================================================
// Types
// ============================================================================

interface ReadyToShareConfirmationProps {
  onConfirm: () => void;
  onContinue: () => void;
  partnerName?: string;
  /** AI-proposed empathy statement to display for user review */
  proposedStatement?: string | null;
  /** Callback when user taps to view full statement */
  onViewFull?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ReadyToShareConfirmation({
  onConfirm,
  onContinue,
  partnerName = 'your partner',
  proposedStatement,
  onViewFull,
}: ReadyToShareConfirmationProps) {
  const isTruncated = proposedStatement && proposedStatement.length > MAX_STATEMENT_LENGTH;
  const displayText = isTruncated
    ? proposedStatement.slice(0, MAX_STATEMENT_LENGTH) + '...'
    : proposedStatement;

  return (
    <View style={styles.container}>
      <Text style={styles.question}>Ready to share your understanding?</Text>

      {proposedStatement && (
        <TouchableOpacity
          style={styles.proposedContainer}
          onPress={onViewFull}
          activeOpacity={onViewFull ? 0.7 : 1}
          disabled={!onViewFull}
        >
          <View style={styles.proposedHeader}>
            <Text style={styles.proposedLabel}>Your understanding so far:</Text>
            {isTruncated && onViewFull && (
              <View style={styles.viewFullHint}>
                <Text style={styles.viewFullText}>Tap to view</Text>
                <ChevronRight color="#BFA200" size={14} />
              </View>
            )}
          </View>
          <Text style={styles.proposedText}>{displayText}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueText}>Not yet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>Yes, I'm ready</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  question: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  proposedContainer: {
    backgroundColor: '#3D3500', // Dark yellow/amber background
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB800', // Bright amber accent
  },
  proposedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  proposedLabel: {
    fontSize: 11,
    color: '#BFA200', // Muted amber for label
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  viewFullHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewFullText: {
    fontSize: 11,
    color: '#BFA200',
  },
  proposedText: {
    fontSize: 14,
    color: '#FFE082', // Light amber for text
    fontStyle: 'italic',
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  continueButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  continueText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  confirmButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.accent,
    borderRadius: 6,
  },
  confirmText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ReadyToShareConfirmation;
