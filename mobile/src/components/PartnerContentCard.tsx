/**
 * PartnerContentCard Component
 *
 * A card component for displaying shared content items in the Partner tab.
 * Supports different content types: empathy attempts, shared context, validation.
 * Shows status text at the bottom of each card.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Check, Clock, Eye, AlertCircle, MessageCircle, Send } from 'lucide-react-native';
import { colors } from '../theme';
import { EmpathyStatus } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export type PartnerContentType =
  | 'my_empathy'
  | 'partner_empathy'
  | 'shared_context_sent'
  | 'shared_context_received'
  | 'share_suggestion';

export interface PartnerContentCardProps {
  /** Type of content */
  type: PartnerContentType;
  /** Main content text */
  content: string;
  /** Partner's name for dynamic text */
  partnerName: string;
  /** Status for empathy attempts */
  status?: EmpathyStatus;
  /** Whether this is a pending action (e.g., needs validation) */
  isPending?: boolean;
  /** Timestamp of the content */
  timestamp?: string;
  /** Callback when card is pressed (for opening drawers, validation, etc.) */
  onPress?: () => void;
  /** Validation callback for partner's empathy */
  onValidateAccurate?: () => void;
  onValidatePartial?: () => void;
  onValidateInaccurate?: () => void;
  /** Share suggestion callbacks */
  onShare?: () => void;
  onDecline?: () => void;
  onEdit?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Status Helpers
// ============================================================================

interface StatusConfig {
  text: string;
  icon: React.ReactNode;
  color: string;
}

function getMyEmpathyStatus(status: EmpathyStatus | undefined, partnerName: string): StatusConfig {
  switch (status) {
    case 'HELD':
      return {
        text: `Your empathy draft is saved. It will be reviewed once ${partnerName} finishes reflecting.`,
        icon: <Clock color={colors.textMuted} size={14} />,
        color: colors.textMuted,
      };
    case 'ANALYZING':
      return {
        text: 'Reviewing your empathy draft...',
        icon: <Clock color={colors.brandBlue} size={14} />,
        color: colors.brandBlue,
      };
    case 'AWAITING_SHARING':
      return {
        text: `${partnerName} has been asked to share more context to help you understand.`,
        icon: <AlertCircle color={colors.warning} size={14} />,
        color: colors.warning,
      };
    case 'REFINING':
      return {
        text: `${partnerName} shared some context. You can refine your empathy draft in the AI chat.`,
        icon: <MessageCircle color={colors.brandBlue} size={14} />,
        color: colors.brandBlue,
      };
    case 'READY':
      return {
        text: `Your empathy draft is ready. Waiting for ${partnerName} to finish theirs.`,
        icon: <Check color={colors.success} size={14} />,
        color: colors.success,
      };
    case 'REVEALED':
      return {
        text: `Your empathy has been shared with ${partnerName}.`,
        icon: <Eye color={colors.success} size={14} />,
        color: colors.success,
      };
    case 'VALIDATED':
      return {
        text: `${partnerName} confirmed your empathy feels accurate.`,
        icon: <Check color={colors.success} size={14} />,
        color: colors.success,
      };
    default:
      return {
        text: '',
        icon: null,
        color: colors.textMuted,
      };
  }
}

function getPartnerEmpathyStatus(status: EmpathyStatus | undefined, partnerName: string, isPending: boolean): StatusConfig {
  if (isPending) {
    return {
      text: `Does this feel accurate? Let ${partnerName} know.`,
      icon: <AlertCircle color={colors.accent} size={14} />,
      color: colors.accent,
    };
  }

  switch (status) {
    case 'REVEALED':
      return {
        text: `${partnerName} shared how they understand your feelings.`,
        icon: <Eye color={colors.brandBlue} size={14} />,
        color: colors.brandBlue,
      };
    case 'VALIDATED':
      return {
        text: 'You confirmed this feels accurate.',
        icon: <Check color={colors.success} size={14} />,
        color: colors.success,
      };
    default:
      return {
        text: '',
        icon: null,
        color: colors.textMuted,
      };
  }
}

// ============================================================================
// Component
// ============================================================================

export function PartnerContentCard({
  type,
  content,
  partnerName,
  status,
  isPending = false,
  timestamp,
  onPress,
  onValidateAccurate,
  onValidatePartial,
  onValidateInaccurate,
  onShare,
  onDecline,
  onEdit,
  style,
  testID = 'partner-content-card',
}: PartnerContentCardProps) {
  // Determine if this is my content (right aligned) or partner's (left aligned)
  const isMine = type === 'my_empathy' || type === 'shared_context_sent' || type === 'share_suggestion';

  // Get status config based on type
  let statusConfig: StatusConfig | null = null;
  if (type === 'my_empathy') {
    statusConfig = getMyEmpathyStatus(status, partnerName);
  } else if (type === 'partner_empathy') {
    statusConfig = getPartnerEmpathyStatus(status, partnerName, isPending);
  } else if (type === 'shared_context_sent') {
    statusConfig = {
      text: `You shared this to help ${partnerName} understand.`,
      icon: <Send color={colors.success} size={14} />,
      color: colors.success,
    };
  } else if (type === 'shared_context_received') {
    statusConfig = {
      text: `${partnerName} shared this to help you understand.`,
      icon: <MessageCircle color={colors.brandBlue} size={14} />,
      color: colors.brandBlue,
    };
  } else if (type === 'share_suggestion') {
    statusConfig = {
      text: `${partnerName} is trying to understand your perspective. Would you like to share something to help?`,
      icon: <AlertCircle color={colors.accent} size={14} />,
      color: colors.accent,
    };
  }

  // Determine if validation buttons should show
  const showValidation = type === 'partner_empathy' && isPending && onValidateAccurate;

  // Determine if share suggestion buttons should show
  const showShareSuggestionActions = type === 'share_suggestion' && onShare;

  const CardWrapper = onPress && !showValidation && !showShareSuggestionActions ? TouchableOpacity : View;

  return (
    <View
      style={[
        styles.container,
        isMine ? styles.containerRight : styles.containerLeft,
        style,
      ]}
      testID={testID}
    >
      <CardWrapper
        style={[
          styles.card,
          isMine ? styles.cardMine : styles.cardPartner,
          isPending && styles.cardPending,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        testID={`${testID}-card`}
      >
        {/* Content */}
        <Text style={styles.content}>"{content}"</Text>

        {/* Status */}
        {statusConfig && statusConfig.text && (
          <View style={styles.statusContainer}>
            {statusConfig.icon}
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.text}
            </Text>
          </View>
        )}

        {/* Validation buttons for partner's empathy */}
        {showValidation && (
          <View style={styles.validationButtons}>
            <TouchableOpacity
              style={[styles.validationButton, styles.validationButtonAccurate]}
              onPress={onValidateAccurate}
              testID={`${testID}-validate-accurate`}
            >
              <Check color={colors.success} size={16} />
              <Text style={styles.validationButtonText}>Accurate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.validationButton}
              onPress={onValidatePartial}
              testID={`${testID}-validate-partial`}
            >
              <Text style={styles.validationButtonText}>Partially</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.validationButton, styles.validationButtonNegative]}
              onPress={onValidateInaccurate}
              testID={`${testID}-validate-inaccurate`}
            >
              <Text style={[styles.validationButtonText, styles.validationButtonTextNegative]}>
                Misses mark
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Share suggestion action buttons */}
        {showShareSuggestionActions && (
          <View style={styles.shareSuggestionButtons}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={onDecline}
              testID={`${testID}-decline`}
            >
              <Text style={styles.declineButtonText}>No thanks</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editButton}
              onPress={onEdit}
              testID={`${testID}-edit`}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={onShare}
              testID={`${testID}-share`}
            >
              <Send color="white" size={14} />
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        )}
      </CardWrapper>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    maxWidth: '85%',
  },
  containerRight: {
    alignSelf: 'flex-end',
  },
  containerLeft: {
    alignSelf: 'flex-start',
  },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  cardMine: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
  },
  cardPartner: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.brandBlue,
    borderWidth: 2,
  },
  cardPending: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  validationButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  validationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  validationButtonAccurate: {
    borderColor: colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  validationButtonNegative: {
    borderColor: colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  validationButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  validationButtonTextNegative: {
    color: colors.error,
  },
  shareSuggestionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  declineButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  editButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.brandBlue,
    borderRadius: 16,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
});

export default PartnerContentCard;
