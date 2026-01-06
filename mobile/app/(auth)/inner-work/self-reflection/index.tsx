/**
 * Self-Reflection List Screen
 *
 * Lists all self-reflection sessions with:
 * - Summary/theme for each session
 * - Timestamp of last update
 * - Linked partner session indicator
 * - Ability to continue or start new
 */

import { useMemo, useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Animated, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, MessageCircle, ChevronRight, Link, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';

import { useInnerThoughtsSessionsInfinite, useCreateInnerThoughtsSession, useArchiveInnerThoughtsSession } from '@/src/hooks';
import { ScreenHeader } from '@/src/components';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';
import { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';

// Simple time ago formatter
function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ============================================================================
// Component
// ============================================================================

export default function SelfReflectionListScreen() {
  const styles = useStyles();
  const router = useRouter();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInnerThoughtsSessionsInfinite();
  const createSession = useCreateInnerThoughtsSession();
  const archiveSession = useArchiveInnerThoughtsSession();

  // Flatten pages into single array
  const sessions = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.sessions);
  }, [data]);

  // Handle loading more when reaching end of list
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Footer component for loading more indicator
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }, [isFetchingNextPage, styles.footerLoader]);

  const handleStartNew = async () => {
    try {
      const result = await createSession.mutateAsync({});
      router.push(`/inner-work/self-reflection/${result.session.id}`);
    } catch (err) {
      console.error('Failed to create self-reflection session:', err);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/inner-work/self-reflection/${sessionId}`);
  };

  // Track open swipeable to close it when another opens
  const openSwipeableRef = useRef<Swipeable | null>(null);

  // Track which session is being deleted for loading state
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      setDeletingSessionId(sessionId);
      await archiveSession.mutateAsync({ sessionId });
      refetch();
    } catch (err) {
      console.error('Failed to delete self-reflection session:', err);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const confirmDeleteSession = (sessionId: string, title: string) => {
    // Close the swipeable first
    if (openSwipeableRef.current) {
      openSwipeableRef.current.close();
    }

    Alert.alert(
      'Delete Session',
      `Are you sure you want to delete "${title}"? This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteSession(sessionId),
        },
      ]
    );
  };

  // Render the delete action when swiping
  const renderRightActions = (
    sessionId: string,
    title: string,
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    const isDeleting = deletingSessionId === sessionId;

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => confirmDeleteSession(sessionId, title)}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel="Delete session"
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 color="#fff" size={22} />
          </Animated.View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSession = ({ item }: { item: InnerWorkSessionSummaryDTO }) => {
    const timeAgo = formatTimeAgo(item.updatedAt);
    const displayTitle = item.title || item.theme || 'Untitled session';
    const displaySummary = item.summary || 'Tap to continue...';
    const isLinked = false; // TODO: item.linkedPartnerSessionId

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            ref.close = () => {
              if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
                openSwipeableRef.current.close();
              }
            };
          }
        }}
        onSwipeableWillOpen={() => {
          if (openSwipeableRef.current) {
            openSwipeableRef.current.close();
          }
        }}
        onSwipeableOpen={(direction, swipeable) => {
          openSwipeableRef.current = swipeable;
        }}
        renderRightActions={(progress, dragX) => renderRightActions(item.id, displayTitle, progress, dragX)}
        rightThreshold={40}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sessionCard,
            pressed && styles.sessionCardPressed,
          ]}
          onPress={() => handleOpenSession(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${displayTitle}`}
        >
          <View style={styles.sessionContent}>
            <View style={styles.sessionTitleRow}>
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {displayTitle}
              </Text>
              {isLinked && (
                <Link color={colors.accent} size={14} />
              )}
            </View>
            <Text style={styles.sessionSummary} numberOfLines={2}>
              {displaySummary}
            </Text>
            <Text style={styles.sessionTime}>{timeAgo}</Text>
          </View>
          <ChevronRight color="#666" size={20} />
        </Pressable>
      </Swipeable>
    );
  };


  // Header configuration
  const headerConfig = {
    title: 'Self-Reflection',
    titleIcon: <MessageCircle color={colors.accent} size={18} />,
    rightAction: {
      icon: <Plus color={colors.textPrimary} size={24} />,
      onPress: handleStartNew,
      loading: createSession.isPending,
      accessibilityLabel: 'Start new self-reflection session',
    },
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader {...headerConfig} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader {...headerConfig} />

      {sessions.length === 0 && !isLoading ? (
        <View style={styles.emptyContainer}>
          <MessageCircle color="#666" size={48} />
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a session to explore what's on your mind
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={renderFooter}
          onRefresh={refetch}
          refreshing={isLoading}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    listContent: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.xl,
    },
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
      padding: t.spacing.lg,
    },
    sessionCardPressed: {
      backgroundColor: t.colors.bgTertiary,
    },
    deleteAction: {
      backgroundColor: t.colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      borderTopRightRadius: t.radius.lg,
      borderBottomRightRadius: t.radius.lg,
    },
    sessionContent: {
      flex: 1,
    },
    sessionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    sessionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textPrimary,
      flex: 1,
    },
    sessionSummary: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 8,
      lineHeight: 20,
    },
    sessionTime: {
      fontSize: 12,
      color: t.colors.textMuted,
    },
    separator: {
      height: t.spacing.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.spacing.xl,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginTop: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    emptySubtitle: {
      fontSize: 16,
      color: t.colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },
    footerLoader: {
      paddingVertical: t.spacing.lg,
      alignItems: 'center',
    },
  }));
