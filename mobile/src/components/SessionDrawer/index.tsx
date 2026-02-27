/**
 * Session Drawer Component
 *
 * Native hamburger menu drawer for browsing conversations.
 *
 * Features:
 * - Native drawer with gesture support (swipe to close)
 * - Sessions organized into sections (Needs Attention / In Progress / Completed)
 * - Swipe-to-archive on session cards
 * - New session button in header
 * - Closes on session selection
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Archive } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { useSessionDrawer } from '../../hooks/useSessionDrawer';
import { useSessions, useArchiveSession } from '../../hooks/useSessions';
import { SessionCard } from '../SessionCard';
import { createStyles } from '../../theme/styled';
import { colors } from '../../theme';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus } from '@meet-without-fear/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.9;

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
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const archiveSession = useArchiveSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animation refs for optimistic archive
  const animationRefs = useRef<Record<string, { opacity: Animated.Value; height: Animated.Value }>>({});
  const layoutHeightsRef = useRef<Record<string, number>>({});
  const [archivingSessions, setArchivingSessions] = useState<Set<string>>(new Set());

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
    if (needsAttention.length > 0) result.push({ title: 'Needs Your Attention', data: needsAttention });
    if (inProgress.length > 0) result.push({ title: 'In Progress', data: inProgress });
    if (completed.length > 0) result.push({ title: 'Completed', data: completed });
    return result;
  }, [sessions]);

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

  const handleArchive = useCallback(
    (session: SessionSummaryDTO) => {
      swipeableRefs.current.get(session.id)?.close();

      const partnerName = session.partner.name || 'this person';
      Alert.alert('Archive Session', `Move this session with ${partnerName} to your archive?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'default',
          onPress: () => {
            setArchivingSessions((prev) => new Set(prev).add(session.id));
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
                setArchivingSessions((prev) => {
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
      session: SessionSummaryDTO
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={styles.archiveAction}
          onPress={() => handleArchive(session)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Archive color="#FFFFFF" size={20} />
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [handleArchive, styles]
  );

  const renderItem = useCallback(
    ({ item }: { item: SessionSummaryDTO }) => {
      const isArchiving = archivingSessions.has(item.id);
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
              ...(isArchiving ? { height: animationValues.height, overflow: 'hidden' } : {}),
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
              disabled={isArchiving}
            >
              <SessionCard session={item} noMargin />
            </TouchableOpacity>
          </Swipeable>
        </Animated.View>
      );
    },
    [archivingSessions, handleSessionPress, renderRightActions]
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
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
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
    archiveAction: {
      backgroundColor: t.colors.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
      width: 70,
      borderTopRightRadius: t.radius.lg,
      borderBottomRightRadius: t.radius.lg,
    },
  }));
