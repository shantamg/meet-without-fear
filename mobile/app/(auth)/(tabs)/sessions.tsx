import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';

import { SessionCard } from '@/src/components/SessionCard';
import { useSessions, useDeleteSession } from '@/src/hooks/useSessions';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus } from '@meet-without-fear/shared';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';

/**
 * Sessions tab screen
 * Lists all user's sessions with swipe-to-delete
 */
export default function SessionsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const deleteSession = useDeleteSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animation refs for optimistic delete with slide-up
  const animationRefs = useRef<Record<string, { opacity: Animated.Value; height: Animated.Value }>>({});
  const layoutHeightsRef = useRef<Record<string, number>>({});
  const [deletingSessions, setDeletingSessions] = useState<Set<string>>(new Set());

  // Helper to get or create animation values for a session
  const getAnimationValues = (sessionId: string) => {
    if (!animationRefs.current[sessionId]) {
      animationRefs.current[sessionId] = {
        opacity: new Animated.Value(1),
        height: new Animated.Value(0),
      };
    }
    return animationRefs.current[sessionId];
  };

  // Filter out archived sessions from display
  const sessions = (data?.items ?? []).filter(
    (s) => s.status !== SessionStatus.ARCHIVED
  );

  const handleNewSession = () => {
    router.push('/session/new');
  };

  const handleSessionPress = (sessionId: string) => {
    router.push(`/session/${sessionId}`);
  };

  // All sessions can be deleted
  const canDelete = (status: SessionStatus): boolean => {
    return [
      SessionStatus.RESOLVED,
      SessionStatus.ABANDONED,
      SessionStatus.CREATED,
      SessionStatus.INVITED,
      SessionStatus.ACTIVE,
      SessionStatus.PAUSED,
      SessionStatus.WAITING,
    ].includes(status);
  };

  const handleDelete = useCallback(
    (session: SessionSummaryDTO) => {
      // Close the swipeable
      swipeableRefs.current.get(session.id)?.close();

      const partnerName = session.partner.name || 'this person';
      const isActive = [
        SessionStatus.ACTIVE,
        SessionStatus.PAUSED,
        SessionStatus.WAITING,
      ].includes(session.status);

      const message = isActive
        ? `Delete your session with ${partnerName}? Your partner will be notified and can keep their own data.`
        : `Delete your session with ${partnerName}?`;

      Alert.alert('Delete Session', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Mark session as deleting immediately
            setDeletingSessions(prev => new Set(prev).add(session.id));

            const animationValues = getAnimationValues(session.id);

            // Use measured height for collapse animation
            const measuredHeight = layoutHeightsRef.current[session.id] || 100;
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
                await deleteSession.mutateAsync({ sessionId: session.id });
                // Clean up animation refs
                delete animationRefs.current[session.id];
                delete layoutHeightsRef.current[session.id];
              } catch (error) {
                console.error('Failed to delete session:', error);
                // Reset animations if deletion failed
                animationValues.opacity.setValue(1);
                animationValues.height.setValue(measuredHeight);
                Alert.alert('Error', 'Failed to delete session. Please try again.');
              } finally {
                setDeletingSessions(prev => {
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
      if (!canDelete(session.status)) {
        return null;
      }

      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => handleDelete(session)}
          accessibilityRole="button"
          accessibilityLabel="Delete session"
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 color="#FFFFFF" size={24} />
          </Animated.View>
          <Animated.Text style={[styles.deleteText, { transform: [{ scale }] }]}>
            Delete
          </Animated.Text>
        </TouchableOpacity>
      );
    },
    [handleDelete, styles]
  );

  const renderSessionItem = useCallback(
    ({ item }: { item: SessionSummaryDTO }) => {
      const isDeletable = canDelete(item.status);
      const isDeleting = deletingSessions.has(item.id);
      const animationValues = getAnimationValues(item.id);

      const content = isDeletable ? (
        <Swipeable
          ref={(ref) => {
            if (ref) {
              swipeableRefs.current.set(item.id, ref);
            } else {
              swipeableRefs.current.delete(item.id);
            }
          }}
          renderRightActions={(progress, dragX) =>
            renderRightActions(progress, dragX, item)
          }
          overshootRight={false}
          rightThreshold={40}
        >
          <TouchableOpacity onPress={() => handleSessionPress(item.id)} disabled={isDeleting}>
            <SessionCard session={item} noMargin />
          </TouchableOpacity>
        </Swipeable>
      ) : (
        <TouchableOpacity onPress={() => handleSessionPress(item.id)}>
          <SessionCard session={item} noMargin />
        </TouchableOpacity>
      );

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
          {content}
        </Animated.View>
      );
    },
    [renderRightActions, handleSessionPress, deletingSessions]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>💬</Text>
        <Text style={styles.emptyTitle}>No Sessions Yet</Text>
        <Text style={styles.emptyDescription}>
          Start your first session to begin expressing yourself and being heard
        </Text>
        <TouchableOpacity style={styles.newSessionButton} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={20} />
          <Text style={styles.newSessionButtonText}>New Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading your sessions…</Text>
        </View>
      ) : sessions.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Floating action button for new session */}
      {sessions.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={28} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    listContent: {
      padding: t.spacing.lg,
    },
    separator: {
      height: t.spacing.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      padding: t.spacing['3xl'],
    },
    emptyState: {
      alignItems: 'center',
      gap: t.spacing.lg,
    },
    emptyIcon: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.colors.textPrimary,
    },
    emptyDescription: {
      fontSize: 16,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    newSessionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.accent,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.lg,
      borderRadius: 12,
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    newSessionButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      ...{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      },
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    loadingText: {
      color: t.colors.textSecondary,
      fontSize: 16,
    },
    // Delete swipe action - matches inner-thoughts styling
    deleteAction: {
      backgroundColor: t.colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      borderTopRightRadius: t.radius.lg,
      borderBottomRightRadius: t.radius.lg,
    },
    deleteText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
  }));
