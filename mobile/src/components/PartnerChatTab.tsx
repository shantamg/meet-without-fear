/**
 * PartnerChatTab Component
 *
 * The Partner tab content showing shared content between users.
 * Displays empathy attempts, shared context, and validation cards.
 * Shows empty state when no content has been shared yet.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  LayoutChangeEvent,
  TouchableOpacity,
} from 'react-native';
import { Send, ChevronRight } from 'lucide-react-native';
import { colors } from '../theme';
import { PartnerContentCard, PartnerContentType } from './PartnerContentCard';
import { ShareSuggestionCard } from './sharing/ShareSuggestionCard';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { EmpathyStatus, EmpathyAttemptDTO, ShareSuggestionDTO, EmpathyExchangeStatusResponse, SharedContentDeliveryStatus, ReconcilerResultSummary } from '@meet-without-fear/shared';

// Shared context types from the exchange status response
type SharedContextReceivedType = EmpathyExchangeStatusResponse['sharedContext'];
type SharedContextSentType = EmpathyExchangeStatusResponse['mySharedContext'];

// ============================================================================
// Types
// ============================================================================

/**
 * Extended empathy attempt that includes superseded status for revision history.
 * When a user revises their empathy, older attempts are marked as superseded.
 */
export interface EmpathyAttemptWithHistory extends EmpathyAttemptDTO {
  /** True if this attempt was superseded by a newer revision */
  isSuperseded?: boolean;
}

export interface PartnerChatTabProps {
  /** Session ID */
  sessionId: string;
  /** Partner's display name */
  partnerName: string;
  /**
   * My empathy attempts with revision history.
   * Pass an array sorted by timestamp (oldest first).
   * Older attempts should have isSuperseded=true.
   * Falls back to myEmpathyAttempt for backwards compatibility.
   */
  myEmpathyAttempts?: EmpathyAttemptWithHistory[];
  /** @deprecated Use myEmpathyAttempts instead. Single attempt for backwards compatibility. */
  myEmpathyAttempt?: EmpathyAttemptDTO | null;
  /** Partner's empathy attempt (if any) */
  partnerEmpathyAttempt?: EmpathyAttemptDTO | null;
  /** Shared context I sent */
  sharedContextSent?: SharedContextSentType[];
  /** Shared context I received */
  sharedContextReceived?: SharedContextReceivedType | null;
  /** Pending share suggestion */
  shareSuggestion?: ShareSuggestionDTO | null;
  /** Whether partner's empathy needs validation */
  partnerEmpathyNeedsValidation?: boolean;
  /** Whether my empathy was validated by partner */
  myEmpathyValidated?: boolean;
  /** Whether reconciler is currently analyzing */
  isAnalyzing?: boolean;
  /** Whether awaiting partner to share context (gaps detected) */
  awaitingSharing?: boolean;
  /** Reconciler result for my empathy attempt (if reconciler has run) */
  myReconcilerResult?: ReconcilerResultSummary | null;
  /** Whether partner has submitted an empathy attempt (even if not revealed to me yet) */
  partnerHasSubmittedEmpathy?: boolean;
  /** Partner's empathy attempt status (even if not revealed) - allows showing "held by reconciler" */
  partnerEmpathyHeldStatus?: EmpathyStatus | null;
  /** When partner submitted their empathy attempt (for chronological ordering) */
  partnerEmpathySubmittedAt?: string | null;
  /** Callbacks for validation */
  onValidateAccurate?: () => void;
  onValidatePartial?: () => void;
  onValidateInaccurate?: () => void;
  /** Callbacks for share suggestion */
  onShareSuggestionAccept?: () => void;
  onShareSuggestionDecline?: () => void;
  onShareSuggestionRefine?: (message: string) => void;
  /** Whether refinement is in progress */
  isRefiningShareSuggestion?: boolean;
  /** Callback to refine empathy draft */
  onRefineEmpathy?: () => void;
  /** Refresh control */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Timestamp of item to scroll to and highlight (from "Context shared" indicator tap) */
  highlightTimestamp?: string | null;
  /** Callback when highlight animation completes */
  onHighlightComplete?: () => void;
  /** Whether the session has an active invitation (status = INVITED) */
  hasActiveInvitation?: boolean;
  /** Callback when invitation status is tapped (opens refine/resend drawer) */
  onInvitationPress?: () => void;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Content Item Type for Sorting
// ============================================================================

type ReconcilerIndicatorType = 'reconciler-analyzing' | 'reconciler-gaps-found' | 'reconciler-ready' | 'partner-empathy-held';

interface ContentItem {
  id: string;
  type: PartnerContentType | 'reconciler_status';
  content: string;
  status?: EmpathyStatus;
  deliveryStatus?: SharedContentDeliveryStatus | null;
  timestamp: string;
  isPending?: boolean;
  suggestion?: ShareSuggestionDTO;
  /** Reconciler indicator type (only for reconciler_status items) */
  reconcilerIndicator?: ReconcilerIndicatorType;
}

// ============================================================================
// Component
// ============================================================================

export function PartnerChatTab({
  partnerName,
  myEmpathyAttempts = [],
  myEmpathyAttempt, // Deprecated, for backwards compatibility
  partnerEmpathyAttempt,
  sharedContextSent = [],
  sharedContextReceived,
  shareSuggestion,
  partnerEmpathyNeedsValidation = false,
  isAnalyzing = false,
  awaitingSharing = false,
  myReconcilerResult = null,
  partnerHasSubmittedEmpathy = false,
  partnerEmpathyHeldStatus = null,
  partnerEmpathySubmittedAt = null,
  onValidateAccurate,
  onValidatePartial,
  onValidateInaccurate,
  onShareSuggestionAccept,
  onShareSuggestionDecline,
  onShareSuggestionRefine,
  isRefiningShareSuggestion = false,
  onRefineEmpathy,
  refreshing = false,
  onRefresh,
  highlightTimestamp,
  onHighlightComplete,
  hasActiveInvitation = false,
  onInvitationPress,
  testID = 'partner-chat-tab',
}: PartnerChatTabProps) {
  // Refs for scrolling and highlighting
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayoutsRef = useRef<Map<string, { y: number; height: number }>>(new Map());

  // Build content items array for chronological display
  const contentItems = useMemo((): ContentItem[] => {
    const items: ContentItem[] = [];

    // Determine which empathy attempts to use
    // Priority: myEmpathyAttempts array > legacy myEmpathyAttempt single object
    const empathyAttempts: EmpathyAttemptWithHistory[] = myEmpathyAttempts.length > 0
      ? myEmpathyAttempts
      : (myEmpathyAttempt ? [myEmpathyAttempt] : []);

    // Add all my empathy attempts (supports revision history)
    empathyAttempts.forEach((attempt, index) => {
      if (!attempt.content) return;

      const isSuperseded = (attempt as EmpathyAttemptWithHistory).isSuperseded ||
        attempt.deliveryStatus === 'superseded';
      const isLatest = index === empathyAttempts.length - 1;

      items.push({
        id: `my-empathy-${attempt.id}`,
        type: 'my_empathy',
        content: attempt.content,
        status: attempt.status,
        // For superseded attempts, use 'superseded' delivery status
        deliveryStatus: isSuperseded ? 'superseded' : attempt.deliveryStatus,
        timestamp: attempt.sharedAt || new Date().toISOString(),
      });

      // Only add reconciler status indicator after the LATEST empathy attempt
      if (isLatest && !isSuperseded) {
        // Use actual reconciler result data when available, fall back to status-based logic
        const empathyTimestamp = new Date(attempt.sharedAt || Date.now()).getTime();

        if (isAnalyzing || attempt.status === 'ANALYZING') {
          // Currently analyzing
          items.push({
            id: 'reconciler-status-analyzing',
            type: 'reconciler_status',
            content: '',
            timestamp: new Date(empathyTimestamp + 1).toISOString(),
            reconcilerIndicator: 'reconciler-analyzing',
          });
        } else if (myReconcilerResult) {
          // Use actual reconciler result
          const indicatorTimestamp = myReconcilerResult.analyzedAt || new Date(empathyTimestamp + 1).toISOString();
          if (myReconcilerResult.action === 'OFFER_SHARING' || myReconcilerResult.gapSeverity === 'significant') {
            // Significant gaps were found
            items.push({
              id: 'reconciler-status-gaps',
              type: 'reconciler_status',
              content: '',
              timestamp: indicatorTimestamp,
              reconcilerIndicator: 'reconciler-gaps-found',
            });
          } else {
            // No significant gaps - understanding verified
            items.push({
              id: 'reconciler-status-ready',
              type: 'reconciler_status',
              content: '',
              timestamp: indicatorTimestamp,
              reconcilerIndicator: 'reconciler-ready',
            });
          }
        } else if (awaitingSharing || attempt.status === 'AWAITING_SHARING') {
          // Status-based fallback for gaps detected
          items.push({
            id: 'reconciler-status-gaps',
            type: 'reconciler_status',
            content: '',
            timestamp: new Date(empathyTimestamp + 1).toISOString(),
            reconcilerIndicator: 'reconciler-gaps-found',
          });
        } else if (attempt.status === 'READY' || attempt.status === 'REVEALED' || attempt.status === 'VALIDATED') {
          // Status-based fallback for verified
          items.push({
            id: 'reconciler-status-ready',
            type: 'reconciler_status',
            content: '',
            timestamp: new Date(empathyTimestamp + 1).toISOString(),
            reconcilerIndicator: 'reconciler-ready',
          });
        }
      }
    });

    // Add partner's empathy attempt (only if revealed or validated)
    if (
      partnerEmpathyAttempt &&
      partnerEmpathyAttempt.content &&
      (partnerEmpathyAttempt.status === 'REVEALED' || partnerEmpathyAttempt.status === 'VALIDATED')
    ) {
      items.push({
        id: `partner-empathy-${partnerEmpathyAttempt.id}`,
        type: 'partner_empathy',
        content: partnerEmpathyAttempt.content,
        status: partnerEmpathyAttempt.status,
        timestamp: partnerEmpathyAttempt.revealedAt || partnerEmpathyAttempt.sharedAt || new Date().toISOString(),
        isPending: partnerEmpathyNeedsValidation,
      });
    } else if (partnerHasSubmittedEmpathy && partnerEmpathyHeldStatus) {
      // Partner has submitted empathy but it's not revealed yet (held by reconciler)
      // Show an indicator so the subject knows partner has shared
      const isHeld = partnerEmpathyHeldStatus !== 'REVEALED' && partnerEmpathyHeldStatus !== 'VALIDATED';
      if (isHeld) {
        items.push({
          id: 'partner-empathy-held',
          type: 'reconciler_status',
          content: '',
          // Use actual submission timestamp for correct chronological ordering
          timestamp: partnerEmpathySubmittedAt || new Date().toISOString(),
          reconcilerIndicator: 'partner-empathy-held',
        });
      }
    }

    // Add shared context I sent
    sharedContextSent.forEach((ctx, index) => {
      if (ctx) {
        items.push({
          id: `sent-context-${ctx.sharedAt}-${index}`,
          type: 'shared_context_sent',
          content: ctx.content,
          deliveryStatus: ctx.deliveryStatus,
          timestamp: ctx.sharedAt,
        });
      }
    });

    // Add shared context I received
    if (sharedContextReceived) {
      items.push({
        id: `received-context-${sharedContextReceived.sharedAt}`,
        type: 'shared_context_received',
        content: sharedContextReceived.content,
        timestamp: sharedContextReceived.sharedAt,
      });
    }

    // Add share suggestion (if any) - show at the end as a pending action
    if (shareSuggestion) {
      items.push({
        id: `share-suggestion-${Date.now()}`,
        type: 'share_suggestion',
        content: shareSuggestion.suggestedContent,
        timestamp: new Date().toISOString(), // Show at the end
        isPending: true,
        suggestion: shareSuggestion,
      });
    }

    // Sort by timestamp (oldest first for chat-like ordering)
    return items.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [
    myEmpathyAttempts,
    myEmpathyAttempt, // Legacy support
    partnerEmpathyAttempt,
    sharedContextSent,
    sharedContextReceived,
    shareSuggestion,
    partnerEmpathyNeedsValidation,
    isAnalyzing,
    awaitingSharing,
    myReconcilerResult,
    partnerHasSubmittedEmpathy,
    partnerEmpathyHeldStatus,
    partnerEmpathySubmittedAt,
  ]);

  // Handle highlight timestamp - scroll to and highlight the matching item
  useEffect(() => {
    if (!highlightTimestamp) return;

    // Find the item with matching timestamp
    const matchingItem = contentItems.find((item) => {
      // Match by timestamp (within 1 second tolerance for potential time differences)
      const itemTime = new Date(item.timestamp).getTime();
      const targetTime = new Date(highlightTimestamp).getTime();
      return Math.abs(itemTime - targetTime) < 1000;
    });

    if (matchingItem) {
      // Wait for page transition to complete, then scroll to the item
      setTimeout(() => {
        const layout = itemLayoutsRef.current.get(matchingItem.id);
        if (layout && scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: layout.y - 50, animated: true });
        }
        onHighlightComplete?.();
      }, 400); // Wait for page transition
    } else {
      // No matching item found, just clear the timestamp
      onHighlightComplete?.();
    }
  }, [highlightTimestamp, contentItems, onHighlightComplete]);

  // Track item layouts for scrolling
  const handleItemLayout = (itemId: string, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    itemLayoutsRef.current.set(itemId, { y, height });
  };

  // Check if there's any content to show
  const hasContent = contentItems.length > 0;

  // Invitation status banner component
  const invitationBanner = hasActiveInvitation ? (
    <TouchableOpacity
      style={styles.invitationBanner}
      onPress={onInvitationPress}
      activeOpacity={0.7}
      testID={`${testID}-invitation-banner`}
    >
      <View style={styles.invitationIconContainer}>
        <Send size={18} color={colors.accent} />
      </View>
      <View style={styles.invitationTextContainer}>
        <Text style={styles.invitationTitle}>Invitation Sent</Text>
        <Text style={styles.invitationSubtitle}>
          Tap to resend or edit your invitation to {partnerName}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </TouchableOpacity>
  ) : null;

  if (!hasContent && !hasActiveInvitation) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        testID={testID}
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Messages between you and {partnerName} will show up here
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Show banner only (no shared content yet)
  if (!hasContent && hasActiveInvitation) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.bannerOnlyContainer}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        testID={testID}
      >
        {invitationBanner}
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Messages between you and {partnerName} will show up here once they join
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      testID={testID}
    >
      {invitationBanner}
      {contentItems.map((item) => (
        <View
          key={item.id}
          onLayout={(event) => handleItemLayout(item.id, event)}
        >
          {item.type === 'reconciler_status' && item.reconcilerIndicator ? (
            <ChatIndicator
              type={item.reconcilerIndicator as ChatIndicatorType}
              testID={`${testID}-indicator-${item.reconcilerIndicator}`}
              metadata={item.reconcilerIndicator === 'partner-empathy-held' ? { partnerName } : undefined}
            />
          ) : item.type === 'share_suggestion' && item.suggestion ? (
            // Use ShareSuggestionCard for share suggestions (supports inline refinement)
            <View style={styles.shareSuggestionContainer}>
              <ShareSuggestionCard
                suggestion={item.suggestion}
                partnerName={partnerName}
                onShare={onShareSuggestionAccept ?? (() => {})}
                onDecline={onShareSuggestionDecline ?? (() => {})}
                onRefine={onShareSuggestionRefine ?? (() => {})}
                isRefining={isRefiningShareSuggestion}
                testID="share-suggestion-card"
              />
            </View>
          ) : (
            <PartnerContentCard
              type={item.type as PartnerContentType}
              content={item.content}
              partnerName={partnerName}
              status={item.status}
              deliveryStatus={item.deliveryStatus}
              isPending={item.isPending}
              timestamp={item.timestamp}
              onValidateAccurate={
                item.type === 'partner_empathy' && item.isPending
                  ? onValidateAccurate
                  : undefined
              }
              onValidatePartial={
                item.type === 'partner_empathy' && item.isPending
                  ? onValidatePartial
                  : undefined
              }
              onValidateInaccurate={
                item.type === 'partner_empathy' && item.isPending
                  ? onValidateInaccurate
                  : undefined
              }
              onRefine={
                item.type === 'my_empathy' ? onRefineEmpathy : undefined
              }
              testID={`${testID}-item-${item.id}`}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  contentContainer: {
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  bannerOnlyContainer: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Share suggestion card container
  shareSuggestionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Invitation banner styles
  invitationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invitationIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  invitationTextContainer: {
    flex: 1,
  },
  invitationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  invitationSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

export default PartnerChatTab;
