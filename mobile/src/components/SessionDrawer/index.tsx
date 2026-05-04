/**
 * Session Drawer Component
 *
 * Native hamburger menu drawer for browsing conversations.
 *
 * Features:
 * - Native drawer with gesture support (swipe to close)
 * - Sessions organized into sections (Needs Attention / In Progress / Completed)
 * - Swipe-to-delete and long-press to delete on session cards
 * - New session button in header
 * - Closes on session selection
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import type { PointerEvent as RNPointerEvent } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { useSessionDrawer } from '../../hooks/useSessionDrawer';
import { useSessions, useDeleteSession } from '../../hooks/useSessions';
import { SessionCard } from '../SessionCard';
import { createStyles } from '../../theme/styled';
import { colors } from '../../theme';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus } from '@meet-without-fear/shared';

// On web the app is constrained to a centered mobile column (see mobile/app/_layout.tsx).
// The drawer must not exceed that column, or `react-native-drawer-layout`'s
// `left: calc(width * -1)` offset pushes it off-screen.
const WEB_COLUMN_MAX_WIDTH = 480;
const SWIPE_PRESS_BLOCK_MS = 650;
const SWIPE_CANCEL_DISTANCE = 8;

// ============================================================================
// Session Section Types
// ============================================================================

interface SessionSection {
  title: string;
  data: SessionSummaryDTO[];
}

// ============================================================================
// Conversations List (formerly PartnerSessionsList)
// ============================================================================

function ConversationsList({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const router = useRouter();
  const { isOpen } = useSessionDrawer();
  const { data, isLoading, refetch } = useSessions();

  // Auto-refresh sessions when the drawer opens
  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);
  const deleteSession = useDeleteSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const swipePressBlockUntilRef = useRef(0);
  const swipeStartRefs = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [openSwipeableId, setOpenSwipeableId] = useState<string | null>(null);

  // Animation refs for optimistic delete
  const animationRefs = useRef<Record<string, { opacity: Animated.Value; height: Animated.Value }>>({});
  const layoutHeightsRef = useRef<Record<string, number>>({});
  const [deletingSessions, setDeletingSessions] = useState<Set<string>>(new Set());

  const getAnimationValues = (sessionId: string) => {
    if (!animationRefs.current[sessionId]) {
      animationRefs.current[sessionId] = {
        opacity: new Animated.Value(1),
        height: new Animated.Value(0),
      };
    }
    return animationRefs.current[sessionId];
  };

  const sessions = (data?.items ?? []).filter(
    (s) => s.status !== SessionStatus.ARCHIVED
  );

  // Organize sessions into sections
  const sections: SessionSection[] = useMemo(() => {
    const needsAttention: SessionSummaryDTO[] = [];
    const inProgress: SessionSummaryDTO[] = [];
    const completed: SessionSummaryDTO[] = [];

    for (const s of sessions) {
      if (s.status === SessionStatus.RESOLVED) {
        completed.push(s);
      } else if (s.selfActionNeeded.length > 0 && s.status !== SessionStatus.PAUSED) {
        needsAttention.push(s);
      } else {
        inProgress.push(s);
      }
    }

    const result: SessionSection[] = [];
    if (needsAttention.length > 0) result.push({ title: 'Ready for you', data: needsAttention });
    if (inProgress.length > 0) result.push({ title: 'In Progress', data: inProgress });
    if (completed.length > 0) result.push({ title: 'Completed', data: completed });
    return result;
  }, [sessions]);

  const handleSessionPress = useCallback(
    (sessionId: string) => {
      if (openSwipeableId === sessionId || Date.now() < swipePressBlockUntilRef.current) {
        swipeableRefs.current.get(sessionId)?.close();
        setOpenSwipeableId((current) => current === sessionId ? null : current);
        return;
      }

      onClose();
      router.push(`/session/${sessionId}`);
    },
    [onClose, openSwipeableId, router]
  );

  const blockPressAfterSwipe = useCallback((sessionId?: string) => {
    swipePressBlockUntilRef.current = Date.now() + SWIPE_PRESS_BLOCK_MS;
    if (sessionId) {
      setOpenSwipeableId(sessionId);
    }
  }, []);

  const handleSwipePointerStart = useCallback((sessionId: string, x: number, y: number) => {
    swipeStartRefs.current.set(sessionId, { x, y });
  }, []);

  const handleSwipePointerMove = useCallback((sessionId: string, x: number, y: number) => {
    const start = swipeStartRefs.current.get(sessionId);
    if (!start) return;

    const dx = Math.abs(x - start.x);
    const dy = Math.abs(y - start.y);
    if (dx > SWIPE_CANCEL_DISTANCE && dx > dy) {
      blockPressAfterSwipe(sessionId);
    }
  }, [blockPressAfterSwipe]);

  const handleSwipePointerEnd = useCallback((sessionId: string) => {
    swipeStartRefs.current.delete(sessionId);
  }, []);

  const handleNewSession = useCallback(() => {
    onClose();
    router.push('/session/new');
  }, [onClose, router]);

  const handleDelete = useCallback(
    (session: SessionSummaryDTO) => {
      swipeableRefs.current.get(session.id)?.close();

      const partnerName = session.partner.name || 'this person';
      const isActive = ['ACTIVE', 'WAITING', 'PAUSED'].includes(session.status);
      const message = isActive
        ? `This will end your session with ${partnerName} and remove it from your list. They will be notified.`
        : `Remove this conversation with ${partnerName} from your list?`;

      const deleteAfterConfirm = () => {
        setDeletingSessions((prev) => new Set(prev).add(session.id));
        const animationValues = getAnimationValues(session.id);
        const measuredHeight = layoutHeightsRef.current[session.id] || 80;
        animationValues.height.setValue(measuredHeight);

        Animated.parallel([
          Animated.timing(animationValues.opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }),
          Animated.timing(animationValues.height, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ]).start(async () => {
          try {
            await deleteSession.mutateAsync({ sessionId: session.id });
            delete animationRefs.current[session.id];
            delete layoutHeightsRef.current[session.id];
          } catch {
            animationValues.opacity.setValue(1);
            animationValues.height.setValue(measuredHeight);
            Alert.alert('Error', 'Failed to delete conversation.');
          } finally {
            setDeletingSessions((prev) => {
              const newSet = new Set(prev);
              newSet.delete(session.id);
              return newSet;
            });
          }
        });
      };

      if (Platform.OS === 'web') {
        const confirmed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm(message)
          : true;
        if (confirmed) deleteAfterConfirm();
        return;
      }

      Alert.alert('Delete Conversation', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: deleteAfterConfirm,
        },
      ]);
    },
    [deleteSession]
  );

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
      session: SessionSummaryDTO
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => handleDelete(session)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 color="#FFFFFF" size={20} />
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [handleDelete, styles]
  );

  const renderItem = useCallback(
    ({ item }: { item: SessionSummaryDTO }) => {
      const isDeleting = deletingSessions.has(item.id);
      const isSwipeOpen = openSwipeableId === item.id;
      const animationValues = getAnimationValues(item.id);

      if (Platform.OS === 'web') {
        return (
          <Animated.View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0) layoutHeightsRef.current[item.id] = h;
            }}
            style={[
              styles.webSessionRow,
              {
                opacity: animationValues.opacity,
                ...(isDeleting ? { height: animationValues.height, overflow: 'hidden' as const } : {}),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.webSessionPressArea}
              onPress={() => handleSessionPress(item.id)}
              onLongPress={() => handleDelete(item)}
              delayLongPress={500}
              disabled={isDeleting}
            >
              <SessionCard session={item} noMargin />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.webDeleteButton}
              onPress={() => handleDelete(item)}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <Trash2 color="#FFFFFF" size={20} />
            </TouchableOpacity>
          </Animated.View>
        );
      }

      return (
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) layoutHeightsRef.current[item.id] = h;
          }}
          style={[
            {
              opacity: animationValues.opacity,
              ...(isDeleting ? { height: animationValues.height, overflow: 'hidden' } : {}),
            },
          ]}
          onPointerDownCapture={(e: RNPointerEvent) => {
            handleSwipePointerStart(item.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onPointerMoveCapture={(e: RNPointerEvent) => {
            handleSwipePointerMove(item.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onPointerUpCapture={() => handleSwipePointerEnd(item.id)}
          onPointerCancelCapture={() => handleSwipePointerEnd(item.id)}
        >
          <Swipeable
            ref={(ref) => {
              if (ref) swipeableRefs.current.set(item.id, ref);
              else swipeableRefs.current.delete(item.id);
            }}
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
            overshootRight={false}
            rightThreshold={40}
            onSwipeableOpenStartDrag={() => {
              blockPressAfterSwipe(item.id);
            }}
            onSwipeableWillOpen={() => {
              blockPressAfterSwipe(item.id);
              for (const [sessionId, ref] of swipeableRefs.current) {
                if (sessionId !== item.id) ref.close();
              }
              setOpenSwipeableId(item.id);
            }}
            onSwipeableOpen={() => {
              blockPressAfterSwipe(item.id);
              setOpenSwipeableId(item.id);
            }}
            onSwipeableWillClose={() => {
              blockPressAfterSwipe();
            }}
            onSwipeableClose={() => {
              setOpenSwipeableId((current) => current === item.id ? null : current);
            }}
          >
            <TouchableOpacity
              onPress={() => handleSessionPress(item.id)}
              onLongPress={() => handleDelete(item)}
              delayLongPress={500}
              disabled={isDeleting || isSwipeOpen}
            >
              <SessionCard session={item} noMargin />
            </TouchableOpacity>
          </Swipeable>
        </Animated.View>
      );
    },
    [
      deletingSessions,
      handleSessionPress,
      handleDelete,
      handleSwipePointerEnd,
      handleSwipePointerMove,
      handleSwipePointerStart,
      blockPressAfterSwipe,
      openSwipeableId,
      renderRightActions,
    ]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SessionSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    [styles]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No conversations yet</Text>
        <TouchableOpacity style={styles.newButton} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={18} />
          <Text style={styles.newButtonText}>Start a Session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      stickySectionHeadersEnabled={false}
    />
  );
}

// ============================================================================
// Main Drawer Component
// ============================================================================

interface SessionDrawerProps {
  children: React.ReactNode;
}

export function SessionDrawer({ children }: SessionDrawerProps) {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOpen, closeDrawer, openDrawer } = useSessionDrawer();
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(
    windowWidth * 0.9,
    Platform.OS === 'web' ? WEB_COLUMN_MAX_WIDTH : windowWidth
  );

  const handleNewSession = useCallback(() => {
    closeDrawer();
    router.push('/session/new');
  }, [closeDrawer, router]);

  const renderDrawerContent = () => (
    <View style={[styles.drawerContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleNewSession}
          >
            <Plus color={colors.textPrimary} size={24} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={closeDrawer}
          >
            <X color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Session List */}
      <View style={styles.listContainer}>
        <ConversationsList onClose={closeDrawer} />
      </View>
    </View>
  );

  return (
    <Drawer
      open={isOpen}
      onOpen={openDrawer}
      onClose={closeDrawer}
      drawerPosition="left"
      drawerType="front"
      drawerStyle={[styles.drawer, { width: drawerWidth }]}
      overlayStyle={styles.overlay}
      renderDrawerContent={renderDrawerContent}
    >
      {children}
    </Drawer>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    drawer: {
      backgroundColor: t.colors.bgPrimary,
    },
    drawerContent: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.colors.textPrimary,
    },
    headerActions: {
      flexDirection: 'row',
      gap: t.spacing.sm,
    },
    headerButton: {
      padding: t.spacing.sm,
    },
    sectionHeader: {
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.xs,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      padding: t.spacing.lg,
    },
    separator: {
      height: t.spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.spacing.xl,
    },
    emptyText: {
      fontSize: 16,
      color: t.colors.textSecondary,
      marginBottom: t.spacing.lg,
    },
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.accent,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: 8,
      gap: t.spacing.sm,
    },
    newButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    deleteAction: {
      backgroundColor: '#E53935',
      justifyContent: 'center',
      alignItems: 'center',
      width: 70,
      borderTopRightRadius: t.radius.lg,
      borderBottomRightRadius: t.radius.lg,
    },
    webSessionRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: t.spacing.xs,
    },
    webSessionPressArea: {
      flex: 1,
      minWidth: 0,
    },
    webDeleteButton: {
      width: 48,
      borderRadius: t.radius.lg,
      backgroundColor: '#E53935',
      alignItems: 'center',
      justifyContent: 'center',
    },
  }));
