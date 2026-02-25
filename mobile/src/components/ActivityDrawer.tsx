/**
 * ActivityDrawer Component
 *
 * Bottom-sheet drawer that replaces the full-screen ActivityMenuModal.
 * Shows timeline items (sent + received) in a unified view with
 * "Needs Your Attention" and "History" sections.
 */

import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Animated,
  PanResponder,
  Dimensions,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { colors } from '@/theme';
import { TimelineItemCard, TimelineItem } from './TimelineItemCard';
import { useSharingStatus } from '../hooks/useSharingStatus';
import { usePendingActions, PendingAction } from '../hooks/usePendingActions';
import { useMarkShareTabViewed } from '../hooks/useSessions';

// NOTE: When new chat items (validation cards, indicators) arrive while the drawer
// is open, we intentionally do NOT show an in-drawer notification. The user discovers
// new items via the floating pill when they close the drawer. See OPEN_QUESTIONS_DECISIONS.md Q2.

// V1 CONSTRAINT: This drawer has no text inputs. Do NOT add TextInput components
// to the drawer body until KeyboardAvoidingView integration is implemented.
// See OPEN_QUESTIONS_DECISIONS.md Q3.

// ============================================================================
// Types
// ============================================================================

export interface ActivityDrawerProps {
  visible: boolean;
  sessionId: string;
  partnerName: string;
  onClose: () => void;
  onOpenRefinement?: (offerId: string, suggestion: string) => void;
  onShareAsIs?: (offerId: string) => void;
  onOpenEmpathyDetail?: (attemptId: string, content: string) => void;
  onOpenInvitationRefine?: () => void;
  invitationMessage?: string;
  invitationTimestamp?: string;
  sessionStatus?: string;
  partnerEmpathyValidated?: boolean;
  testID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.65;
const DEFAULT_POSITION = SCREEN_HEIGHT - DRAWER_HEIGHT;

// ============================================================================
// Data Mapping Helpers
// ============================================================================

/**
 * Map sent items from sharing status to TimelineItem[].
 */
function buildSentItems(
  sharingStatus: ReturnType<typeof useSharingStatus>,
  invitationMessage?: string,
  invitationTimestamp?: string,
  partnerName?: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Invitation
  if (invitationMessage) {
    items.push({
      id: 'invitation',
      type: 'invitation',
      direction: 'sent',
      content: invitationMessage,
      timestamp: invitationTimestamp || new Date().toISOString(),
    });
  }

  // My empathy attempt
  if (sharingStatus.myAttempt) {
    items.push({
      id: sharingStatus.myAttempt.id,
      type: 'empathy',
      direction: 'sent',
      content: sharingStatus.myAttempt.content,
      timestamp: sharingStatus.myAttempt.sharedAt || new Date().toISOString(),
      revisionCount: sharingStatus.myAttempt.revisionCount,
      deliveryStatus: sharingStatus.myAttempt.deliveryStatus as TimelineItem['deliveryStatus'],
      empathyStatus: sharingStatus.myAttempt.status,
      partnerName,
      attemptId: sharingStatus.myAttempt.id,
    });
  }

  // Sent shared context from history
  for (const item of sharingStatus.sharedContextHistory) {
    if (item.direction === 'sent' && item.type !== 'empathy_attempt') {
      items.push({
        id: item.id,
        type: 'context',
        direction: 'sent',
        content: item.content,
        timestamp: item.timestamp,
      });
    }
  }

  return items;
}

/**
 * Map received items from pending actions + sharing status to TimelineItem[].
 */
function buildReceivedItems(
  sharingStatus: ReturnType<typeof useSharingStatus>,
  pendingActions: PendingAction[],
  partnerName: string,
  isSessionActive: boolean,
  partnerEmpathyValidated?: boolean,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Pending actions → items with actionRequired
  for (const action of pendingActions) {
    if (action.type === 'share_offer') {
      items.push({
        id: action.id,
        type: 'share_offer',
        direction: 'received',
        content: (action.data.suggestedContent as string) || '',
        timestamp: (action.data.createdAt as string) || new Date().toISOString(),
        actionRequired: isSessionActive,
        actionType: 'refine',
        offerId: action.id,
        suggestionText: (action.data.suggestedContent as string) || '',
        partnerName,
      });
    } else if (action.type === 'context_received') {
      items.push({
        id: action.id,
        type: 'context',
        direction: 'received',
        content: (action.data.content as string) || '',
        timestamp: (action.data.sharedAt as string) || new Date().toISOString(),
        actionRequired: isSessionActive,
        actionType: 'view',
        partnerName,
      });
    }
    // validate_empathy actions are handled below via partnerAttempt
  }

  // Partner's empathy attempt (if revealed/validated)
  if (
    sharingStatus.partnerAttempt &&
    (sharingStatus.partnerAttempt.status === 'REVEALED' ||
      sharingStatus.partnerAttempt.status === 'VALIDATED')
  ) {
    const alreadyInItems = items.some(
      (i) => i.type === 'empathy' && i.id === sharingStatus.partnerAttempt?.id,
    );
    if (!alreadyInItems) {
      const isValidated =
        sharingStatus.partnerAttempt.status === 'VALIDATED' || partnerEmpathyValidated;
      items.push({
        id: sharingStatus.partnerAttempt.id,
        type: 'empathy',
        direction: 'received',
        content: sharingStatus.partnerAttempt.content,
        timestamp:
          sharingStatus.partnerAttempt.revealedAt ||
          sharingStatus.partnerAttempt.sharedAt,
        partnerName,
        attemptId: sharingStatus.partnerAttempt.id,
        // Mark as needing validation if revealed but not validated and session active
        actionRequired: !isValidated && isSessionActive,
        actionType: !isValidated ? 'validate' : undefined,
      });
    }
  }

  // Historical received context from sharing status
  for (const histItem of sharingStatus.sharedContextHistory) {
    if (histItem.direction === 'received' && histItem.type === 'shared_context') {
      const alreadyInItems = items.some((i) => i.id === histItem.id);
      if (!alreadyInItems) {
        items.push({
          id: histItem.id,
          type: 'context',
          direction: 'received',
          content: histItem.content,
          timestamp: histItem.timestamp,
          partnerName,
        });
      }
    }
  }

  return items;
}

// ============================================================================
// Component
// ============================================================================

export function ActivityDrawer({
  visible,
  sessionId,
  partnerName,
  onClose,
  onOpenRefinement,
  onShareAsIs,
  onOpenEmpathyDetail,
  onOpenInvitationRefine,
  invitationMessage,
  invitationTimestamp,
  sessionStatus,
  partnerEmpathyValidated,
  testID = 'activity-drawer',
}: ActivityDrawerProps) {
  const isSessionActive =
    !sessionStatus ||
    (sessionStatus !== 'RESOLVED' &&
      sessionStatus !== 'ABANDONED' &&
      sessionStatus !== 'ARCHIVED');

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  const sharingStatus = useSharingStatus(sessionId);
  const pendingActionsQuery = usePendingActions(sessionId);
  const pendingActions = pendingActionsQuery.data?.actions ?? [];
  const { mutate: markShareTabViewed } = useMarkShareTabViewed(sessionId);

  // Mark as viewed when drawer opens
  useEffect(() => {
    if (visible) {
      markShareTabViewed();
    }
  }, [visible, markShareTabViewed]);

  // -------------------------------------------------------------------------
  // Build timeline items
  // -------------------------------------------------------------------------
  const allItems = useMemo<TimelineItem[]>(() => {
    const sent = buildSentItems(
      sharingStatus,
      invitationMessage,
      invitationTimestamp,
      partnerName,
    );
    const received = buildReceivedItems(
      sharingStatus,
      pendingActions,
      partnerName,
      isSessionActive,
      partnerEmpathyValidated,
    );

    // Merge and sort newest first
    return [...sent, ...received].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [
    sharingStatus,
    pendingActions,
    invitationMessage,
    invitationTimestamp,
    partnerName,
    isSessionActive,
    partnerEmpathyValidated,
  ]);

  // Split into attention items (actionRequired) and history items
  const attentionItems = useMemo(
    () => allItems.filter((item) => item.actionRequired),
    [allItems],
  );
  const historyItems = useMemo(
    () => allItems.filter((item) => !item.actionRequired),
    [allItems],
  );

  // -------------------------------------------------------------------------
  // Animation refs
  // -------------------------------------------------------------------------
  const drawerTranslate = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);

  // -------------------------------------------------------------------------
  // Open / Close animations
  // -------------------------------------------------------------------------
  const openDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(drawerTranslate, {
        toValue: DEFAULT_POSITION,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.4,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerTranslate, backdropOpacity]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerTranslate, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [drawerTranslate, backdropOpacity, onClose]);

  // Trigger open animation when visible changes
  useEffect(() => {
    if (visible) {
      openDrawer();
    }
  }, [visible, openDrawer]);

  // -------------------------------------------------------------------------
  // Android back button
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, closeDrawer]);

  // -------------------------------------------------------------------------
  // PanResponder for drag-to-dismiss
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging downward
        if (gestureState.dy > 0) {
          drawerTranslate.setValue(DEFAULT_POSITION + gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isDragging.current = false;
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeDrawer();
        } else {
          Animated.spring(drawerTranslate, {
            toValue: DEFAULT_POSITION,
            damping: 20,
            stiffness: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const renderTimelineItem = useCallback(
    ({ item }: { item: TimelineItem }) => (
      <TimelineItemCard
        item={item}
        onOpenRefinement={onOpenRefinement}
        onShareAsIs={onShareAsIs}
        onOpenEmpathyDetail={onOpenEmpathyDetail}
        onOpenInvitationRefine={onOpenInvitationRefine}
        testID={`${testID}-item-${item.id}`}
      />
    ),
    [onOpenRefinement, onShareAsIs, onOpenEmpathyDetail, onOpenInvitationRefine, testID],
  );

  const keyExtractor = useCallback((item: TimelineItem) => item.id, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'auto' : 'none'}
      testID={testID}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdropPressable}
        onPress={() => {
          if (!isDragging.current) onClose();
        }}
        accessibilityRole="button"
        accessibilityLabel="Close exchange history"
      >
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            height: DRAWER_HEIGHT,
            transform: [{ translateY: drawerTranslate }],
          },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
          <View style={styles.dragHandle} />
        </View>

        {/* Header */}
        <Text
          style={styles.header}
          numberOfLines={1}
          ellipsizeMode="tail"
          accessibilityLabel={`Between you and ${partnerName}`}
          testID="activity-drawer-header"
        >
          Between you and {partnerName}
        </Text>

        {/* Scrollable content */}
        <FlatList
          data={historyItems}
          renderItem={renderTimelineItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            attentionItems.length > 0 ? (
              <View style={styles.attentionSection}>
                <Text
                  style={styles.sectionHeader}
                  accessibilityRole="header"
                >
                  Needs Your Attention
                </Text>
                {attentionItems.map((item) => (
                  <TimelineItemCard
                    key={item.id}
                    item={item}
                    onOpenRefinement={onOpenRefinement}
                    onShareAsIs={onShareAsIs}
                    onOpenEmpathyDetail={onOpenEmpathyDetail}
                    onOpenInvitationRefine={onOpenInvitationRefine}
                    testID={`${testID}-attention-${item.id}`}
                  />
                ))}
                <Text
                  style={styles.sectionHeader}
                  accessibilityRole="header"
                >
                  History
                </Text>
              </View>
            ) : (
              <Text
                style={styles.sectionHeader}
                accessibilityRole="header"
              >
                History
              </Text>
            )
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nothing here yet. Items will appear as you and {partnerName} exchange.
            </Text>
          }
        />
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  dragHandleArea: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgTertiary,
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingBottom: 10,
  },
  attentionSection: {
    marginBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    fontStyle: 'italic',
  },
});

export default ActivityDrawer;
