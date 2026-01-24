/**
 * PartnerChatTab Component
 *
 * The Partner tab content showing shared content between users.
 * Displays empathy attempts, shared context, and validation cards.
 * Shows empty state when no content has been shared yet.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { colors } from '../theme';
import { PartnerContentCard, PartnerContentType } from './PartnerContentCard';
import { EmpathyStatus, EmpathyAttemptDTO, ShareSuggestionDTO, EmpathyExchangeStatusResponse } from '@meet-without-fear/shared';

// Shared context type from the exchange status response
type SharedContextType = EmpathyExchangeStatusResponse['sharedContext'];

// ============================================================================
// Types
// ============================================================================

export interface PartnerChatTabProps {
  /** Session ID */
  sessionId: string;
  /** Partner's display name */
  partnerName: string;
  /** My empathy attempt (if any) */
  myEmpathyAttempt?: EmpathyAttemptDTO | null;
  /** Partner's empathy attempt (if any) */
  partnerEmpathyAttempt?: EmpathyAttemptDTO | null;
  /** Shared context I sent */
  sharedContextSent?: SharedContextType[];
  /** Shared context I received */
  sharedContextReceived?: SharedContextType | null;
  /** Pending share suggestion */
  shareSuggestion?: ShareSuggestionDTO | null;
  /** Whether partner's empathy needs validation */
  partnerEmpathyNeedsValidation?: boolean;
  /** Whether my empathy was validated by partner */
  myEmpathyValidated?: boolean;
  /** Callbacks for validation */
  onValidateAccurate?: () => void;
  onValidatePartial?: () => void;
  onValidateInaccurate?: () => void;
  /** Callbacks for share suggestion */
  onShareSuggestionAccept?: () => void;
  onShareSuggestionDecline?: () => void;
  onShareSuggestionEdit?: () => void;
  /** Refresh control */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Content Item Type for Sorting
// ============================================================================

interface ContentItem {
  id: string;
  type: PartnerContentType;
  content: string;
  status?: EmpathyStatus;
  timestamp: string;
  isPending?: boolean;
  suggestion?: ShareSuggestionDTO;
}

// ============================================================================
// Component
// ============================================================================

export function PartnerChatTab({
  sessionId,
  partnerName,
  myEmpathyAttempt,
  partnerEmpathyAttempt,
  sharedContextSent = [],
  sharedContextReceived,
  shareSuggestion,
  partnerEmpathyNeedsValidation = false,
  myEmpathyValidated = false,
  onValidateAccurate,
  onValidatePartial,
  onValidateInaccurate,
  onShareSuggestionAccept,
  onShareSuggestionDecline,
  onShareSuggestionEdit,
  refreshing = false,
  onRefresh,
  testID = 'partner-chat-tab',
}: PartnerChatTabProps) {
  // Build content items array for chronological display
  const contentItems = useMemo((): ContentItem[] => {
    const items: ContentItem[] = [];

    // Add my empathy attempt
    if (myEmpathyAttempt && myEmpathyAttempt.content) {
      items.push({
        id: `my-empathy-${myEmpathyAttempt.id}`,
        type: 'my_empathy',
        content: myEmpathyAttempt.content,
        status: myEmpathyAttempt.status,
        timestamp: myEmpathyAttempt.sharedAt || new Date().toISOString(),
      });
    }

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
    }

    // Add shared context I sent
    sharedContextSent.forEach((ctx, index) => {
      if (ctx) {
        items.push({
          id: `sent-context-${ctx.sharedAt}-${index}`,
          type: 'shared_context_sent',
          content: ctx.content,
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
    myEmpathyAttempt,
    partnerEmpathyAttempt,
    sharedContextSent,
    sharedContextReceived,
    shareSuggestion,
    partnerEmpathyNeedsValidation,
  ]);

  // Check if there's any content to show
  const hasContent = contentItems.length > 0;

  if (!hasContent) {
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      testID={testID}
    >
      {contentItems.map((item) => (
        <PartnerContentCard
          key={item.id}
          type={item.type}
          content={item.content}
          partnerName={partnerName}
          status={item.status}
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
          onShare={
            item.type === 'share_suggestion' ? onShareSuggestionAccept : undefined
          }
          onDecline={
            item.type === 'share_suggestion' ? onShareSuggestionDecline : undefined
          }
          onEdit={
            item.type === 'share_suggestion' ? onShareSuggestionEdit : undefined
          }
          testID={`${testID}-item-${item.id}`}
        />
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
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default PartnerChatTab;
