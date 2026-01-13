/**
 * Session Drawer Component
 *
 * Native hamburger menu drawer that provides access to:
 * - Inner Thoughts sessions
 * - Partner Sessions
 *
 * Features:
 * - Native drawer with gesture support (swipe to close)
 * - Segmented control for tab switching
 * - Session list with swipe-to-delete
 * - New session button in header
 * - Closes on session selection
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { useSessionDrawer, DrawerTab } from '../../hooks/useSessionDrawer';
import { useSessions, useDeleteSession } from '../../hooks/useSessions';
import { useInnerThoughtsSessions, useArchiveInnerThoughtsSession } from '../../hooks/useInnerThoughts';
import { SessionCard } from '../SessionCard';
import { createStyles } from '../../theme/styled';
import { colors } from '../../theme';
import type { SessionSummaryDTO, InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus, InnerWorkStatus } from '@meet-without-fear/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.9;

// ============================================================================
// Segmented Control
// ============================================================================

interface SegmentedControlProps {
  selectedTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
}

function SegmentedControl({ selectedTab, onTabChange }: SegmentedControlProps) {
  const styles = useStyles();

  return (
    <View style={styles.segmentedControl}>
      <TouchableOpacity
        style={[
          styles.segment,
          selectedTab === 'inner-thoughts' && styles.segmentSelected,
        ]}
        onPress={() => onTabChange('inner-thoughts')}
      >
        <Text
          style={[
            styles.segmentText,
            selectedTab === 'inner-thoughts' && styles.segmentTextSelected,
          ]}
        >
          Inner Thoughts
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.segment,
          selectedTab === 'partner-sessions' && styles.segmentSelected,
        ]}
        onPress={() => onTabChange('partner-sessions')}
      >
        <Text
          style={[
            styles.segmentText,
            selectedTab === 'partner-sessions' && styles.segmentTextSelected,
          ]}
        >
          Partner Sessions
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Inner Thoughts List
// ============================================================================

function InnerThoughtsList({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useInnerThoughtsSessions({
    status: InnerWorkStatus.ACTIVE,
  });
  const archiveSession = useArchiveInnerThoughtsSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

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

  const sessions = data?.sessions ?? [];

  const handleSessionPress = useCallback(
    (sessionId: string) => {
      onClose();
      router.push(`/inner-work/self-reflection/${sessionId}`);
    },
    [onClose, router]
  );

  const handleNewSession = useCallback(() => {
    onClose();
    router.push('/inner-work/self-reflection/new');
  }, [onClose, router]);

  const handleDelete = useCallback(
    (session: InnerWorkSessionSummaryDTO) => {
      swipeableRefs.current.get(session.id)?.close();

      Alert.alert('Archive Session', 'Archive this Inner Thoughts session?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
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
                await archiveSession.mutateAsync({ sessionId: session.id });
                delete animationRefs.current[session.id];
                delete layoutHeightsRef.current[session.id];
              } catch {
                animationValues.opacity.setValue(1);
                animationValues.height.setValue(measuredHeight);
                Alert.alert('Error', 'Failed to archive session.');
              } finally {
                setDeletingSessions((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(session.id);
                  return newSet;
                });
              }
            });
          },
        },
      ]);
    },
    [archiveSession]
  );

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
      session: InnerWorkSessionSummaryDTO
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
    ({ item }: { item: InnerWorkSessionSummaryDTO }) => {
      const isDeleting = deletingSessions.has(item.id);
      const animationValues = getAnimationValues(item.id);

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
        >
          <Swipeable
            ref={(ref) => {
              if (ref) swipeableRefs.current.set(item.id, ref);
              else swipeableRefs.current.delete(item.id);
            }}
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
            overshootRight={false}
            rightThreshold={40}
          >
            <TouchableOpacity
              style={styles.sessionItem}
              onPress={() => handleSessionPress(item.id)}
              disabled={isDeleting}
            >
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {item.title || 'New Session'}
              </Text>
              <Text style={styles.sessionSubtitle} numberOfLines={1}>
                {item.summary || 'Self-reflection'}
              </Text>
            </TouchableOpacity>
          </Swipeable>
        </Animated.View>
      );
    },
    [deletingSessions, handleSessionPress, renderRightActions, styles]
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
        <Text style={styles.emptyText}>No Inner Thoughts sessions yet</Text>
        <TouchableOpacity style={styles.newButton} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={18} />
          <Text style={styles.newButtonText}>Start Reflecting</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={sessions}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

// ============================================================================
// Partner Sessions List
// ============================================================================

function PartnerSessionsList({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const deleteSession = useDeleteSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

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

  const handleSessionPress = useCallback(
    (sessionId: string) => {
      onClose();
      router.push(`/session/${sessionId}`);
    },
    [onClose, router]
  );

  const handleNewSession = useCallback(() => {
    onClose();
    router.push('/session/new');
  }, [onClose, router]);

  const handleDelete = useCallback(
    (session: SessionSummaryDTO) => {
      swipeableRefs.current.get(session.id)?.close();

      const partnerName = session.partner.name || 'this person';
      Alert.alert('Delete Session', `Delete your session with ${partnerName}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
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
                Alert.alert('Error', 'Failed to delete session.');
              } finally {
                setDeletingSessions((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(session.id);
                  return newSet;
                });
              }
            });
          },
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
      const animationValues = getAnimationValues(item.id);

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
        >
          <Swipeable
            ref={(ref) => {
              if (ref) swipeableRefs.current.set(item.id, ref);
              else swipeableRefs.current.delete(item.id);
            }}
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
            overshootRight={false}
            rightThreshold={40}
          >
            <TouchableOpacity
              onPress={() => handleSessionPress(item.id)}
              disabled={isDeleting}
            >
              <SessionCard session={item} noMargin />
            </TouchableOpacity>
          </Swipeable>
        </Animated.View>
      );
    },
    [deletingSessions, handleSessionPress, renderRightActions]
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
        <Text style={styles.emptyText}>No partner sessions yet</Text>
        <TouchableOpacity style={styles.newButton} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={18} />
          <Text style={styles.newButtonText}>Start a Session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={sessions}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  const { isOpen, closeDrawer, openDrawer, selectedTab, setSelectedTab } = useSessionDrawer();

  const handleNewSession = useCallback(() => {
    if (selectedTab === 'inner-thoughts') {
      closeDrawer();
      router.push('/inner-work/self-reflection/new');
    } else {
      closeDrawer();
      router.push('/session/new');
    }
  }, [selectedTab, closeDrawer, router]);

  const renderDrawerContent = () => (
    <View style={[styles.drawerContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sessions</Text>
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

      {/* Segmented Control */}
      <SegmentedControl selectedTab={selectedTab} onTabChange={setSelectedTab} />

      {/* Session List */}
      <View style={styles.listContainer}>
        {selectedTab === 'inner-thoughts' ? (
          <InnerThoughtsList onClose={closeDrawer} />
        ) : (
          <PartnerSessionsList onClose={closeDrawer} />
        )}
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
      drawerStyle={styles.drawer}
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
      width: DRAWER_WIDTH,
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
    segmentedControl: {
      flexDirection: 'row',
      marginHorizontal: t.spacing.lg,
      marginVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 8,
      padding: 4,
    },
    segment: {
      flex: 1,
      paddingVertical: t.spacing.sm,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentSelected: {
      backgroundColor: t.colors.bgPrimary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '500',
      color: t.colors.textMuted,
    },
    segmentTextSelected: {
      color: t.colors.textPrimary,
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
    sessionItem: {
      backgroundColor: t.colors.bgSecondary,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.lg,
    },
    sessionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 4,
    },
    sessionSubtitle: {
      fontSize: 14,
      color: t.colors.textSecondary,
    },
    deleteAction: {
      backgroundColor: t.colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 70,
      borderTopRightRadius: t.radius.lg,
      borderBottomRightRadius: t.radius.lg,
    },
  }));
