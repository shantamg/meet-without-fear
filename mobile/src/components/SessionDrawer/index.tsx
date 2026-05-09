/**
 * Session Drawer Component
 *
 * Native hamburger menu drawer for browsing conversations.
 *
 * Features:
 * - Native drawer with gesture support (swipe to close)
 * - Sessions organized into sections (Needs Attention / In Progress / Completed)
 * - Row overflow menu for secondary actions
 * - New session button in header
 * - Closes on session selection
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  SectionList,
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
  useWindowDimensions,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Trash2, Search, MoreHorizontal, Home } from 'lucide-react-native';

import { useSessionDrawer } from '../../hooks/useSessionDrawer';
import { useSessions, useDeleteSession } from '../../hooks/useSessions';
import { designFonts, useAppAppearance } from '../../theme';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus, Stage, StageStatus } from '@meet-without-fear/shared';

// On web the app is constrained to a centered mobile column (see mobile/app/_layout.tsx).
// The drawer must not exceed that column, or `react-native-drawer-layout`'s
// `left: calc(width * -1)` offset pushes it off-screen.
const WEB_COLUMN_MAX_WIDTH = 480;

// ============================================================================
// Session Section Types
// ============================================================================

interface SessionSection {
  title: string;
  data: SessionSummaryDTO[];
}

const PROGRESS_STAGES = [
  Stage.WITNESS,
  Stage.PERSPECTIVE_STRETCH,
  Stage.NEED_MAPPING,
  Stage.STRATEGIC_REPAIR,
] as const;

function formatShortRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function getPartnerDisplayName(session: SessionSummaryDTO): string {
  return session.partner.nickname || session.partner.name || 'Partner';
}

function getTopicLine(session: SessionSummaryDTO): string {
  const topicFrame = (session as SessionSummaryDTO & { topicFrame?: string }).topicFrame;
  return (
    topicFrame ||
    session.statusSummary?.userStatus ||
    session.statusSummary?.partnerStatus ||
    'Conversation in progress'
  );
}

function getBadgeLabel(session: SessionSummaryDTO): { label: string; kind: 'ready' | 'neutral' } {
  if (session.status === SessionStatus.RESOLVED) return { label: 'Complete', kind: 'neutral' };
  if (session.status === SessionStatus.PAUSED) return { label: 'Paused', kind: 'neutral' };
  if (session.status === SessionStatus.CREATED || session.status === SessionStatus.INVITED) {
    return { label: 'Invitation sent', kind: 'ready' };
  }
  if (session.selfActionNeeded.length > 0) return { label: 'Ready for you', kind: 'ready' };
  return { label: 'In progress', kind: 'neutral' };
}

function getSegmentFill(
  segmentStage: Stage,
  myStage: Stage,
  myStatus: StageStatus
): 'done' | 'now' | 'empty' {
  if (segmentStage < myStage) return 'done';
  if (segmentStage === myStage) {
    if (myStatus === StageStatus.COMPLETED || myStatus === StageStatus.GATE_PENDING) return 'done';
    if (myStatus === StageStatus.IN_PROGRESS) return 'now';
  }
  return 'empty';
}

// ============================================================================
// Conversations List (formerly PartnerSessionsList)
// ============================================================================

function ConversationsList({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { palette } = useAppAppearance();
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
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const sessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.items ?? []).filter((s) => {
      if (s.status === SessionStatus.ARCHIVED) return false;
      if (!normalizedQuery) return true;
      const haystack = `${getPartnerDisplayName(s)} ${getTopicLine(s)}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [data?.items, query]);

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
      if (menuSessionId === sessionId) {
        setMenuSessionId(null);
        return;
      }

      setMenuSessionId(null);
      onClose();
      router.push(`/session/${sessionId}`);
    },
    [menuSessionId, onClose, router]
  );

  const handleNewSession = useCallback(() => {
    onClose();
    router.push('/session/new');
  }, [onClose, router]);

  const handleDelete = useCallback(
    (session: SessionSummaryDTO) => {
      setMenuSessionId(null);

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

  const renderItem = useCallback(
    ({ item }: { item: SessionSummaryDTO }) => {
      const isDeleting = deletingSessions.has(item.id);
      const animationValues = getAnimationValues(item.id);
      const menuOpen = menuSessionId === item.id;

      return (
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) layoutHeightsRef.current[item.id] = h;
          }}
          style={{
            opacity: animationValues.opacity,
            ...(isDeleting ? { height: animationValues.height, overflow: 'hidden' as const } : {}),
          }}
        >
          <ConversationRow
            session={item}
            palette={palette}
            menuOpen={menuOpen}
            disabled={isDeleting}
            onPress={() => handleSessionPress(item.id)}
            onMenuPress={() => setMenuSessionId((current) => current === item.id ? null : item.id)}
            onDelete={() => handleDelete(item)}
          />
        </Animated.View>
      );
    },
    [
      deletingSessions,
      handleSessionPress,
      handleDelete,
      menuSessionId,
      palette,
    ]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SessionSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
        <View style={styles.sectionRule} />
      </View>
    ),
    [styles]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={palette.accent} />
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
    <View style={styles.conversationsShell}>
      <View style={styles.searchBox}>
        <Search color={palette.textFaint} size={15} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people, topics..."
          placeholderTextColor={palette.textFaint}
          style={styles.searchInput}
        />
      </View>
      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

function ConversationRow({
  session,
  palette,
  menuOpen,
  disabled,
  onPress,
  onMenuPress,
  onDelete,
}: {
  session: SessionSummaryDTO;
  palette: ReturnType<typeof useAppAppearance>['palette'];
  menuOpen: boolean;
  disabled: boolean;
  onPress: () => void;
  onMenuPress: () => void;
  onDelete: () => void;
}) {
  const badge = getBadgeLabel(session);
  const partnerName = getPartnerDisplayName(session);
  const initial = partnerName.charAt(0).toUpperCase();
  const needsAttention = session.selfActionNeeded.length > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        rowStyles.row,
        { backgroundColor: needsAttention ? palette.selected : 'transparent' },
        menuOpen && rowStyles.rowMenuOpen,
      ]}
    >
      {needsAttention && <View style={[rowStyles.selectedStripe, { backgroundColor: palette.accent }]} />}
      <View
        style={[
          rowStyles.avatar,
          { backgroundColor: palette.chipBg, borderColor: palette.border },
        ]}
      >
        <Text style={[rowStyles.avatarText, { color: palette.text }]}>{initial}</Text>
        {session.hasUnread && <View style={[rowStyles.ping, { backgroundColor: palette.accent, borderColor: palette.bg }]} />}
      </View>
      <View style={rowStyles.body}>
        <View style={rowStyles.topRow}>
          <Text style={[rowStyles.name, { color: palette.text }]} numberOfLines={1}>
            {partnerName}
          </Text>
          <Text style={[rowStyles.time, { color: palette.textFaint }]}>
            {formatShortRelativeTime(session.updatedAt)}
          </Text>
        </View>
        <Text style={[rowStyles.subject, { color: palette.textMuted }]} numberOfLines={1}>
          {getTopicLine(session)}
        </Text>
        <View style={rowStyles.foot}>
          <View
            style={[
              rowStyles.chip,
              { backgroundColor: badge.kind === 'ready' ? palette.accentSoft : palette.chipBg },
            ]}
          >
            <View
              style={[
                rowStyles.chipDot,
                { backgroundColor: badge.kind === 'ready' ? palette.accentText : palette.textMuted },
              ]}
            />
            <Text
              style={[
                rowStyles.chipText,
                { color: badge.kind === 'ready' ? palette.accentText : palette.textMuted },
              ]}
            >
              {badge.label}
            </Text>
          </View>
          <View style={rowStyles.progress}>
            {PROGRESS_STAGES.map((stage) => {
              const fill = getSegmentFill(stage, session.myProgress.stage, session.myProgress.status as StageStatus);
              return (
                <View
                  key={stage}
                  style={[
                    rowStyles.progressSegment,
                    { backgroundColor: palette.progressPending },
                    fill === 'done' && { backgroundColor: palette.success },
                    fill === 'now' && { backgroundColor: palette.accent },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={[
          rowStyles.menuButton,
          {
            backgroundColor: menuOpen ? palette.chipBg : 'transparent',
          },
        ]}
        onPress={(event) => {
          event.stopPropagation();
          onMenuPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${partnerName}`}
      >
        <MoreHorizontal color={palette.textFaint} size={16} />
      </TouchableOpacity>
      {menuOpen && (
        <View
          style={[
            rowStyles.overflowMenu,
            {
              backgroundColor: palette.bgElev,
              borderColor: palette.border,
            },
          ]}
        >
          <TouchableOpacity
            style={rowStyles.overflowItem}
            onPress={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Delete conversation with ${partnerName}`}
          >
            <Trash2 color={palette.danger} size={14} />
            <Text style={[rowStyles.overflowText, { color: palette.danger }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Pressable>
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
  const { palette } = useAppAppearance();
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

  const handleHomePress = useCallback(() => {
    closeDrawer();
    router.replace('/(auth)/(tabs)');
  }, [closeDrawer, router]);

  const renderDrawerContent = () => (
    <View style={[styles.drawerContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Conversations</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleHomePress}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Home color={palette.textMuted} size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleNewSession}
            accessibilityRole="button"
            accessibilityLabel="Start new session"
          >
            <Plus color={palette.textMuted} size={21} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={closeDrawer}
            accessibilityRole="button"
            accessibilityLabel="Close drawer"
          >
            <X color={palette.textMuted} size={21} />
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

const useStyles = () => {
  const { palette } = useAppAppearance();

  return useMemo(() => StyleSheet.create({
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.42)',
    },
    drawer: {
      backgroundColor: palette.bg,
    },
    drawerContent: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    headerTitle: {
      fontSize: 34,
      color: palette.text,
      letterSpacing: -0.3,
      fontFamily: designFonts.serif,
    },
    headerTitleWrap: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 4,
    },
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
      paddingTop: 14,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 10.5,
      fontWeight: '700',
      color: palette.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: designFonts.mono,
    },
    sectionCount: {
      fontSize: 10.5,
      fontWeight: '700',
      color: palette.textFaint,
      opacity: 0.75,
      fontFamily: designFonts.mono,
    },
    sectionRule: {
      flex: 1,
      height: 1,
      backgroundColor: palette.divider,
    },
    listContainer: {
      flex: 1,
    },
    conversationsShell: {
      flex: 1,
    },
    searchBox: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 6,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bgElev,
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      color: palette.text,
      fontSize: 13.5,
      paddingVertical: 10,
      fontFamily: designFonts.sans,
    },
    listContent: {
      paddingHorizontal: 8,
      paddingBottom: 24,
    },
    separator: {
      height: 1,
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
      padding: 20,
    },
    emptyText: {
      fontSize: 16,
      color: palette.textMuted,
      marginBottom: 16,
      fontFamily: designFonts.sans,
    },
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.accent,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 999,
      gap: 8,
    },
    newButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: palette.bg,
      fontFamily: designFonts.sans,
    },
  }), [palette]);
};

const rowStyles = StyleSheet.create({
  row: {
    minHeight: 78,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  rowMenuOpen: {
    zIndex: 30,
  },
  selectedStripe: {
    position: 'absolute',
    left: 2,
    top: 14,
    bottom: 14,
    width: 2,
    borderRadius: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  ping: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    fontFamily: designFonts.sans,
  },
  time: {
    fontSize: 10.5,
    fontWeight: '500',
    fontFamily: designFonts.mono,
  },
  subject: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 8,
    fontFamily: designFonts.sans,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    maxWidth: 130,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  progressSegment: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  menuButton: {
    width: 24,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -1,
  },
  overflowMenu: {
    position: 'absolute',
    top: 40,
    right: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    minWidth: 118,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  overflowItem: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  overflowText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
});
