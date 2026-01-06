/**
 * Inner Thoughts List Screen
 *
 * Lists all Inner Thoughts sessions with:
 * - Summary/theme for each session
 * - Timestamp of last update
 * - Linked partner session indicator
 * - Ability to continue or start new
 */

import { useMemo, useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Animated, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Layers, ChevronRight, Link, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';

import { useInnerThoughtsSessionsInfinite, useCreateInnerThoughtsSession, useArchiveInnerThoughtsSession } from '@/src/hooks';
import { ScreenHeader } from '@/src/components';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';
import { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';

// Animation types for delete
type AnimationValues = { opacity: Animated.Value; height: Animated.Value };

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

export default function InnerThoughtsListScreen() {
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

  // Flatten pages into single array - useInfiniteQuery returns InfiniteData with pages array
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
      router.push(`/inner-thoughts/${result.session.id}`);
    } catch (err) {
      console.error('Failed to create Inner Thoughts session:', err);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/inner-thoughts/${sessionId}`);
  };

  // Track open swipeable to close it when another opens
  const openSwipeableRef = useRef<Swipeable | null>(null);

  // Animation refs for optimistic delete with slide-up
  const animationRefs = useRef<Record<string, AnimationValues>>({});
  const layoutHeightsRef = useRef<Record<string, number>>({});
  const [deletingSessions, setDeletingSessions] = useState<Set<string>>(new Set());

  // Helper to get or create animation values for a session
  const getAnimationValues = (sessionId: string): AnimationValues => {
    if (!animationRefs.current[sessionId]) {
      animationRefs.current[sessionId] = {
        opacity: new Animated.Value(1),
        height: new Animated.Value(0),
      };
    }
    return animationRefs.current[sessionId];
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
          onPress: () => {
            // Mark session as deleting immediately
            setDeletingSessions(prev => new Set(prev).add(sessionId));

            const animationValues = getAnimationValues(sessionId);

            // Use measured height for collapse animation
            const measuredHeight = layoutHeightsRef.current[sessionId] || 100;
            animationValues.height.setValue(measuredHeight);

            // Run fade and height collapse simultaneously
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
              // After animation completes, delete from backend
              try {
                await archiveSession.mutateAsync({ sessionId });
                refetch();
                // Clean up animation refs
                delete animationRefs.current[sessionId];
                delete layoutHeightsRef.current[sessionId];
              } catch (err) {
                console.error('Failed to delete Inner Thoughts session:', err);
                // Reset animations if deletion failed
                animationValues.opacity.setValue(1);
                animationValues.height.setValue(measuredHeight);
                Alert.alert('Error', 'Failed to delete session. Please try again.');
              } finally {
                setDeletingSessions(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(sessionId);
                  return newSet;
                });
              }
            });
          },
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

    const isDeleting = deletingSessions.has(sessionId);

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
    // Note: linkedPartnerSessionId would be added to DTO in future iteration
    const isLinked = false; // TODO: item.linkedPartnerSessionId
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
            // Close previous swipeable when opening a new one
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
            disabled={isDeleting}
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
      </Animated.View>
    );
  };


  // Header configuration
  const headerConfig = {
    title: 'Inner Thoughts',
    titleIcon: <Layers color={colors.accent} size={18} />,
    rightAction: {
      icon: <Plus color={colors.textPrimary} size={24} />,
      onPress: handleStartNew,
      loading: createSession.isPending,
      accessibilityLabel: 'Start new Inner Thoughts session',
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
          <Layers color="#666" size={48} />
          <Text style={styles.emptyTitle}>No Inner Thoughts yet</Text>
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
