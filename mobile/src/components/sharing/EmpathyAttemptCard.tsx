/**
 * EmpathyAttemptCard Component for Sharing Status Screen
 *
 * Displays an empathy attempt with status badge and optional validation buttons.
 * Used in the Sharing Status screen to show both user's and partner's attempts.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Check, Clock, Loader, Eye, AlertCircle } from 'lucide-react-native';
import { colors } from '@/theme';
import { EmpathyStatus, EmpathyAttemptDTO } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface EmpathyAttemptCardProps {
  /** The empathy attempt to display */
  attempt: EmpathyAttemptDTO;
  /** Whether this is the user's own attempt (vs partner's) */
  isMine: boolean;
  /** Whether validation buttons should be shown (only for partner's revealed attempt) */
  showValidation?: boolean;
  /** Whether the attempt has been validated by the user */
  isValidated?: boolean;
  /** Callback when "This feels accurate" is tapped */
  onValidateAccurate?: () => void;
  /** Callback when "Partially accurate" is tapped */
  onValidatePartial?: () => void;
  /** Callback when "This misses the mark" is tapped */
  onValidateInaccurate?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

function getStatusConfig(status: EmpathyStatus, isMine: boolean): StatusConfig {
  switch (status) {
    case 'HELD':
      return {
        label: 'Waiting',
        description: isMine ? 'Waiting for them to share their understanding' : 'They haven\'t shared yet',
        color: colors.textMuted,
        icon: <Clock color={colors.textMuted} size={14} />,
      };
    case 'ANALYZING':
      return {
        label: 'Processing',
        description: 'Finding common ground between perspectives',
        color: colors.brandBlue,
        icon: <Loader color={colors.brandBlue} size={14} />,
      };
    case 'AWAITING_SHARING':
      return {
        label: 'Context Needed',
        description: isMine
          ? 'They were asked to share more context with you'
          : 'You were asked to share more context (check below)',
        color: colors.warning,
        icon: <AlertCircle color={colors.warning} size={14} />,
      };
    case 'NEEDS_WORK':
      return {
        label: 'Needs Refinement',
        description: 'Go back to chat to refine your understanding',
        color: colors.warning,
        icon: <AlertCircle color={colors.warning} size={14} />,
      };
    case 'REFINING':
      return {
        label: 'Updating',
        description: 'Your refined understanding is being processed',
        color: colors.brandBlue,
        icon: <Loader color={colors.brandBlue} size={14} />,
      };
    case 'READY':
      return {
        label: 'Ready',
        description: isMine
          ? 'Ready to be revealed once they catch up'
          : 'Ready but waiting to reveal',
        color: colors.success,
        icon: <Check color={colors.success} size={14} />,
      };
    case 'REVEALED':
      return {
        label: 'Revealed',
        description: 'Shared between you',
        color: colors.success,
        icon: <Eye color={colors.success} size={14} />,
      };
    case 'VALIDATED':
      return {
        label: 'Validated',
        description: 'Both of you confirmed this captures your perspectives',
        color: colors.success,
        icon: <Check color={colors.success} size={14} />,
      };
    default:
      return {
        label: status,
        description: '',
        color: colors.textMuted,
        icon: null,
      };
  }
}

// ============================================================================
// Component
// ============================================================================

export function EmpathyAttemptCard({
  attempt,
  isMine,
  showValidation = false,
  isValidated = false,
  onValidateAccurate,
  onValidatePartial,
  onValidateInaccurate,
  style,
  testID = 'empathy-attempt-card',
}: EmpathyAttemptCardProps) {
  const statusConfig = getStatusConfig(attempt.status, isMine);

  const title = isMine
    ? 'Your understanding of them'
    : "Their understanding of you";

  return (
    <View style={[styles.card, !isMine && styles.partnerCard, style]} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.statusBadge, { borderColor: statusConfig.color }]}>
          {statusConfig.icon}
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      {/* Status Description */}
      {statusConfig.description && (
        <Text style={styles.statusDescription}>{statusConfig.description}</Text>
      )}

      {/* Content */}
      <Text style={styles.content}>"{attempt.content}"</Text>

      {/* Revision count if applicable */}
      {attempt.revisionCount > 0 && (
        <Text style={styles.revisionNote}>
          Revised {attempt.revisionCount} time{attempt.revisionCount > 1 ? 's' : ''}
        </Text>
      )}

      {/* Validation buttons (only for partner's revealed attempt) */}
      {showValidation && !isValidated && (
        <View style={styles.validationSection}>
          <Text style={styles.validationPrompt}>
            How well does this capture your perspective?
          </Text>
          <View style={styles.validationButtons}>
            <TouchableOpacity
              style={styles.validateButton}
              onPress={onValidateAccurate}
              testID={`${testID}-validate-accurate`}
              activeOpacity={0.7}
            >
              <Check color={colors.success} size={18} />
              <Text style={styles.validateButtonText}>This feels accurate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.validateButton}
              onPress={onValidatePartial}
              testID={`${testID}-validate-partial`}
              activeOpacity={0.7}
            >
              <Text style={styles.validateButtonText}>Partially accurate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.validateButton, styles.validateButtonNegative]}
              onPress={onValidateInaccurate}
              testID={`${testID}-validate-inaccurate`}
              activeOpacity={0.7}
            >
              <Text style={[styles.validateButtonText, styles.validateButtonTextNegative]}>
                This misses the mark
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Validated state */}
      {isValidated && (
        <View style={styles.validatedBadge}>
          <Check color={colors.success} size={16} />
          <Text style={styles.validatedText}>You've provided feedback</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerCard: {
    borderColor: colors.brandBlue,
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.bgTertiary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  revisionNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  validationSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  validationPrompt: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  validationButtons: {
    gap: 8,
  },
  validateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  validateButtonNegative: {
    borderColor: colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  validateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  validateButtonTextNegative: {
    color: colors.error,
  },
  validatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    backgroundColor: colors.successBg,
    borderRadius: 8,
  },
  validatedText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '500',
  },
});

export default EmpathyAttemptCard;
