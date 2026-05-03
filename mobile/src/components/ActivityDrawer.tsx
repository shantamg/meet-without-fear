/**
 * ActivityDrawer Component
 *
 * Bottom-sheet drawer that replaces the full-screen ActivityMenuModal.
 * Shows timeline items (sent + received) in a unified view with
 * "Needs Your Attention" and "History" sections.
 */

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  onShareInvitation?: () => void;
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
const POSITION_3Q = SCREEN_HEIGHT * 0.25; // 3/4 visible = top 25% hidden
const SNAP_UP_THRESHOLD = 80; // px dragged up to snap to full
const SNAP_DOWN_THRESHOLD = 100; // px dragged down to dismiss

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

  // Invitation — only show after user confirms it was sent (has timestamp)
  if (invitationMessage && invitationTimestamp) {
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
  onShareInvitation,
  invitationMessage,
  invitationTimestamp,
  sessionStatus,
  partnerEmpathyValidated,
  testID = 'activity-drawer',
}: ActivityDrawerProps) {
  const insets = useSafeAreaInsets();
  const positionFullRef = useRef(insets.top);
  positionFullRef.current = insets.top; // Keep in sync (rotation, etc.)

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

    // Merge and sort oldest first (newest at bottom, like a chat)
    return [...sent, ...received].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
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
  const currentSnap = useRef<'3q' | 'full'>('3q');

  // Track the height above the FlatList (drag handle + header) so the
  // FlatList can be constrained to the visible area of the drawer.
  const [headerAreaHeight, setHeaderAreaHeight] = useState(0);
  const [snapPosition, setSnapPosition] = useState<'3q' | 'full'>('3q');

  // The visible height for the FlatList: screen minus snap offset minus header area
  const listHeight = useMemo(() => {
    const snapOffset = snapPosition === 'full' ? insets.top : POSITION_3Q;
    return SCREEN_HEIGHT - snapOffset - headerAreaHeight;
  }, [snapPosition, headerAreaHeight, insets.top]);

  // -------------------------------------------------------------------------
  // Open / Close / Snap animations
  // -------------------------------------------------------------------------
  const snapTo = useCallback((position: number, backdrop: number) => {
    Animated.parallel([
      Animated.spring(drawerTranslate, {
        toValue: position,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: backdrop,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerTranslate, backdropOpacity]);

  const openDrawer = useCallback(() => {
    currentSnap.current = '3q';
    setSnapPosition('3q');
    snapTo(POSITION_3Q, 0.4);
  }, [snapTo]);

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
    ]).start(() => {
      currentSnap.current = '3q';
      onClose();
    });
  }, [drawerTranslate, backdropOpacity, onClose]);

  // Trigger open animation when visible changes.
  // The else branch is unnecessary since the component returns null when !visible.
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
  // PanResponder for drag handle: up to expand, down to dismiss
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 5,
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        const pFull = positionFullRef.current;
        const base = currentSnap.current === 'full' ? pFull : POSITION_3Q;
        const newPos = base + gestureState.dy;
        const clamped = Math.max(pFull, Math.min(newPos, SCREEN_HEIGHT));
        drawerTranslate.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDragging.current = false;
        const pFull = positionFullRef.current;
        const { dy, vy } = gestureState;

        if (currentSnap.current === '3q') {
          if (dy < -SNAP_UP_THRESHOLD || vy < -0.5) {
            currentSnap.current = 'full';
            setSnapPosition('full');
            snapTo(pFull, 0.6);
          } else if (dy > SNAP_DOWN_THRESHOLD || vy > 0.5) {
            closeDrawer();
          } else {
            snapTo(POSITION_3Q, 0.4);
          }
        } else {
          if (dy > SNAP_DOWN_THRESHOLD || vy > 0.5) {
            currentSnap.current = '3q';
            setSnapPosition('3q');
            snapTo(POSITION_3Q, 0.4);
          } else {
            snapTo(pFull, 0.6);
          }
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
        onShareInvitation={onShareInvitation}
        testID={`${testID}-item-${item.id}`}
      />
    ),
    [onOpenRefinement, onShareAsIs, onOpenEmpathyDetail, onShareInvitation, testID],
  );

  const keyExtractor = useCallback((item: TimelineItem) => item.id, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Don't render anything when not visible. This ensures no DOM nodes remain
  // to intercept pointer events. On React Native Web, child Pressable components
  // can override a parent's pointer-events:none with their own pointer-events:auto,
  // so the only reliable way to prevent the invisible backdrop from blocking clicks
  // is to remove it from the DOM entirely.
  if (!visible) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
      pointerEvents="auto"
      testID={testID}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdropPressable}
        onPress={() => {
          if (!isDragging.current) closeDrawer();
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
            height: SCREEN_HEIGHT,
            transform: [{ translateY: drawerTranslate }],
          },
        ]}
      >
        {/* Drag handle + header — measured so FlatList height is accurate */}
        <View onLayout={(e) => setHeaderAreaHeight(e.nativeEvent.layout.height)}>
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
        </View>

        {/* Wrapper constrains FlatList frame to the visible drawer area */}
        <View style={listHeight > 0 ? { height: listHeight, overflow: 'hidden' } : { flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={historyItems}
            renderItem={renderTimelineItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[styles.listContent, { paddingBottom: 32 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              attentionItems.length > 0 ? (
                <>
                  <Text style={styles.sectionHeader} accessibilityRole="header">
                    Ready for you
                  </Text>
                  <View style={styles.attentionSection}>
                    {attentionItems.map((item) => (
                      <TimelineItemCard
                        key={item.id}
                        item={item}
                        centered
                        onOpenRefinement={onOpenRefinement}
                        onShareAsIs={onShareAsIs}
                        onOpenEmpathyDetail={onOpenEmpathyDetail}
                        onShareInvitation={onShareInvitation}
                        testID={`${testID}-attention-${item.id}`}
                      />
                    ))}
                  </View>
                  <Text style={styles.sectionHeader} accessibilityRole="header">
                    History
                  </Text>
                </>
              ) : (
                <Text style={styles.sectionHeader} accessibilityRole="header">
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
        </View>
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
    elevation: 10,
  },
  dragHandleArea: {
    paddingTop: 12,
    paddingBottom: 12,
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
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingTop: 12,
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
