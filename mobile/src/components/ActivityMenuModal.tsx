/**
 * ActivityMenuModal Component
 *
 * Full-screen modal with "Sent" / "Received" tabs for the activity menu.
 * Replaces the old Share screen navigation with an in-session modal.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors } from '@/theme';
import { useSharingStatus } from '../hooks/useSharingStatus';
import { usePendingActions } from '../hooks/usePendingActions';
import { SentItemsList } from './sharing/SentItemsList';
import { ReceivedItemsList } from './sharing/ReceivedItemsList';
import { SentItem } from './sharing/SentItemCard';
import { ReceivedItem } from './sharing/ReceivedItemCard';

// ============================================================================
// Types
// ============================================================================

type Tab = 'sent' | 'received';

export interface ActivityMenuModalProps {
  visible: boolean;
  sessionId: string;
  partnerName: string;
  onClose: () => void;
  onOpenRefinement?: (offerId: string, suggestion: string) => void;
  onShareAsIs?: (offerId: string) => void;
  onValidate?: (attemptId: string, rating: 'accurate' | 'partial' | 'inaccurate') => void;
  onRefresh?: () => void;
  invitationMessage?: string;
  invitationTimestamp?: string;
  onOpenInvitationRefine?: () => void;
  initialTab?: 'sent' | 'received';
  onOpenEmpathyDetail?: (attemptId: string, content: string) => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ActivityMenuModal({
  visible,
  sessionId,
  partnerName,
  onClose,
  onOpenRefinement,
  onShareAsIs,
  onValidate,
  onRefresh,
  invitationMessage,
  invitationTimestamp,
  onOpenInvitationRefine,
  initialTab,
  onOpenEmpathyDetail,
  testID = 'activity-menu-modal',
}: ActivityMenuModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('received');

  // Sync tab when modal opens with an initialTab
  useEffect(() => {
    if (visible && initialTab) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const sharingStatus = useSharingStatus(sessionId);
  const pendingActionsQuery = usePendingActions(sessionId);
  const pendingActions = pendingActionsQuery.data?.actions ?? [];

  // Build sent items from sharing status
  const sentItems = useMemo<SentItem[]>(() => {
    const items: SentItem[] = [];

    // Prepend invitation if available
    if (invitationMessage) {
      items.push({
        id: 'invitation',
        type: 'invitation',
        content: invitationMessage,
        timestamp: invitationTimestamp || new Date().toISOString(),
      });
    }

    if (sharingStatus.myAttempt) {
      items.push({
        id: sharingStatus.myAttempt.id,
        type: 'empathy',
        content: sharingStatus.myAttempt.content,
        timestamp: sharingStatus.myAttempt.sharedAt || new Date().toISOString(),
        revisionCount: sharingStatus.myAttempt.revisionCount,
        deliveryStatus: sharingStatus.myAttempt.deliveryStatus,
        empathyStatus: sharingStatus.myAttempt.status,
        partnerName,
      });
    }

    // Add shared context items from history
    for (const item of sharingStatus.sharedContextHistory) {
      if (item.direction === 'sent' && item.type !== 'empathy_attempt') {
        items.push({
          id: item.id,
          type: 'context',
          content: item.content,
          timestamp: item.timestamp,
        });
      }
    }

    return items.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [sharingStatus.myAttempt, sharingStatus.sharedContextHistory, invitationMessage, invitationTimestamp]);

  // Build received items from pending actions + sharing status
  const receivedItems = useMemo<ReceivedItem[]>(() => {
    const items: ReceivedItem[] = [];

    for (const action of pendingActions) {
      items.push({
        id: action.id,
        type: action.type,
        content: (action.data.suggestedContent as string) ||
          (action.data.content as string) || '',
        partnerName,
        isPending: true,
        metadata: action.data,
      });
    }

    // Add partner's empathy attempt (if revealed and not already in pending actions)
    if (
      sharingStatus.partnerAttempt &&
      (sharingStatus.partnerAttempt.status === 'REVEALED' ||
        sharingStatus.partnerAttempt.status === 'VALIDATED')
    ) {
      const alreadyInActions = items.some(
        (i) => i.type === 'validate_empathy' && i.id === sharingStatus.partnerAttempt?.id
      );
      if (!alreadyInActions) {
        items.push({
          id: sharingStatus.partnerAttempt.id,
          type: 'validate_empathy',
          content: sharingStatus.partnerAttempt.content,
          partnerName,
          isPending: sharingStatus.partnerAttempt.status === 'REVEALED',
          timestamp: sharingStatus.partnerAttempt.revealedAt || sharingStatus.partnerAttempt.sharedAt,
        });
      }
    }

    return items;
  }, [pendingActions, sharingStatus.partnerAttempt, partnerName]);

  // Badge counts per tab
  const sentBadge = 0; // Sent items don't have badges
  const receivedBadge = pendingActions.length;

  const handleRefresh = useCallback(() => {
    pendingActionsQuery.refetch();
    onRefresh?.();
  }, [pendingActionsQuery, onRefresh]);

  const handleSentItemPress = useCallback((item: SentItem) => {
    if (item.type === 'invitation' && onOpenInvitationRefine) {
      onOpenInvitationRefine();
    } else if (item.type === 'empathy' && onOpenEmpathyDetail) {
      onOpenEmpathyDetail(item.id, item.content);
    }
  }, [onOpenInvitationRefine, onOpenEmpathyDetail]);

  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Activity</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID={`${testID}-close`}
          >
            <X color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
            onPress={() => setActiveTab('sent')}
            testID={`${testID}-tab-sent`}
          >
            <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
              Sent
            </Text>
            {sentBadge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{sentBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'received' && styles.tabActive]}
            onPress={() => setActiveTab('received')}
            testID={`${testID}-tab-received`}
          >
            <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
              Received
            </Text>
            {receivedBadge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{receivedBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeTab === 'sent' ? (
          <SentItemsList
            items={sentItems}
            isRefreshing={false}
            onRefresh={handleRefresh}
            onItemPress={handleSentItemPress}
            testID={`${testID}-sent-list`}
          />
        ) : (
          <ReceivedItemsList
            items={receivedItems}
            partnerName={partnerName}
            isRefreshing={pendingActionsQuery.isRefetching}
            onRefresh={handleRefresh}
            onRefine={(offerId) => {
              const item = receivedItems.find((i) => i.id === offerId);
              onOpenRefinement?.(offerId, item?.content || '');
            }}
            onShareAsIs={onShareAsIs}
            onValidate={onValidate}
            testID={`${testID}-received-list`}
          />
        )}
      </View>
    </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ActivityMenuModal;
