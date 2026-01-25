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
import { Check, Clock, Eye, AlertCircle, MessageCircle, Send, CheckCheck } from 'lucide-react-native';
import { colors } from '../theme';
import { EmpathyStatus, SharedContentDeliveryStatus } from '@meet-without-fear/shared';

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
  /** Delivery status for shared content */
  deliveryStatus?: SharedContentDeliveryStatus | null;
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
  /** Refine callback for empathy drafts that need refinement */
  onRefine?: () => void;
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
        text: `Not delivered yet. Saved and waiting to be reviewed once ${partnerName} finishes reflecting.`,
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
        text: `Not delivered yet. The system found gaps in your understanding, so ${partnerName} has been asked to share more context first.`,
        icon: <AlertCircle color={colors.warning} size={14} />,
        color: colors.warning,
      };
    case 'REFINING':
      return {
        text: 'New context available. You can refine your understanding.',
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
// Delivery Status Helpers
// ============================================================================

function getDeliveryStatusIcon(status: SharedContentDeliveryStatus): React.ReactNode {
  switch (status) {
    case 'sending':
      return <Clock color={colors.textMuted} size={12} />;
    case 'pending':
      return <Clock color={colors.warning} size={12} />;
    case 'delivered':
      return <CheckCheck color={colors.textMuted} size={12} />;
    case 'seen':
      return <CheckCheck color={colors.success} size={12} />;
    case 'superseded':
      return <AlertCircle color={colors.textMuted} size={12} />;
    default:
      return null;
  }
}

function getDeliveryStatusText(status: SharedContentDeliveryStatus): string {
  switch (status) {
    case 'sending':
      return 'Sending...';
    case 'pending':
      return 'Not delivered yet';
    case 'delivered':
      return 'Delivered';
    case 'seen':
      return 'Seen';
    case 'superseded':
      return 'Updated below';
    default:
      return '';
  }
}

// ============================================================================
// Helper: Check if empathy is undelivered
// ============================================================================

function isUndelivered(status?: EmpathyStatus, deliveryStatus?: SharedContentDeliveryStatus | null): boolean {
  // Undelivered if status is HELD, ANALYZING, AWAITING_SHARING, or REFINING
  if (status === 'HELD' || status === 'ANALYZING' || status === 'AWAITING_SHARING' || status === 'REFINING') {
    return true;
  }
  // Also undelivered if delivery status is pending, sending, or superseded
  if (deliveryStatus === 'pending' || deliveryStatus === 'sending' || deliveryStatus === 'superseded') {
    return true;
  }
  return false;
}

// ============================================================================
// Component
// ============================================================================

export function PartnerContentCard({
  type,
  content,
  partnerName,
  status,
  deliveryStatus,
  isPending = false,
  timestamp,
  onPress,
  onValidateAccurate,
  onValidatePartial,
  onValidateInaccurate,
  onShare,
  onDecline,
  onEdit,
  onRefine,
  style,
  testID = 'partner-content-card',
}: PartnerContentCardProps) {
  // Determine if this is my content (right aligned) or partner's (left aligned)
  const isMine = type === 'my_empathy' || type === 'shared_context_sent' || type === 'share_suggestion';

  // Check if the content is undelivered (should be dimmed and italic)
  const showAsUndelivered = type === 'my_empathy' && isUndelivered(status, deliveryStatus);

  // Check if this attempt is superseded (replaced by a newer revision)
  const isSuperseded = deliveryStatus === 'superseded';

  // Get status config based on type
  // For superseded attempts, don't show detailed status - "Updated below" is sufficient
  let statusConfig: StatusConfig | null = null;
  if (type === 'my_empathy' && !isSuperseded) {
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

  // Determine if refine button should show (for my empathy drafts that can be refined)
  // Don't show refine for superseded attempts (they've been replaced)
  const showRefineAction = type === 'my_empathy' &&
    (status === 'REFINING' || status === 'AWAITING_SHARING') &&
    !isSuperseded &&
    onRefine;

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
          showAsUndelivered && styles.cardUndelivered,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        testID={`${testID}-card`}
      >
        {/* Content */}
        <Text style={[styles.content, showAsUndelivered && styles.contentUndelivered]}>
          {content}
        </Text>

        {/* Delivery status for my content */}
        {isMine && deliveryStatus && (
          <View style={styles.deliveryStatusRow}>
            {getDeliveryStatusIcon(deliveryStatus)}
            <Text style={styles.deliveryStatusText}>
              {getDeliveryStatusText(deliveryStatus)}
            </Text>
          </View>
        )}

        {/* Status */}
        {statusConfig && statusConfig.text && (
          <View style={styles.statusContainer}>
            {statusConfig.icon}
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.text}
            </Text>
          </View>
        )}

        {/* Refine button for empathy drafts that can be refined */}
        {showRefineAction && (
          <View style={styles.refineButtonContainer}>
            <TouchableOpacity
              style={styles.refineButton}
              onPress={onRefine}
              activeOpacity={0.7}
              testID={`${testID}-refine`}
            >
              <MessageCircle color={colors.brandBlue} size={16} />
              <Text style={styles.refineButtonText}>Refine</Text>
            </TouchableOpacity>
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
  cardUndelivered: {
    borderStyle: 'dashed',
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  contentUndelivered: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  deliveryStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  deliveryStatusText: {
    fontSize: 11,
    color: colors.textMuted,
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
  refineButtonContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  refineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandBlue,
  },
  refineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brandBlue,
  },
});

export default PartnerContentCard;
