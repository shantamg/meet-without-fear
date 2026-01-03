import { useCallback, useRef } from 'react';
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
import { Plus, Archive } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';

import { SessionCard } from '@/src/components/SessionCard';
import { useSessions, useArchiveSession } from '@/src/hooks/useSessions';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus } from '@meet-without-fear/shared';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';

/**
 * Sessions tab screen
 * Lists all user's sessions with swipe-to-archive for eligible sessions
 */
export default function SessionsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const archiveSession = useArchiveSession();
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

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

  // Check if a session can be archived
  const canArchive = (status: SessionStatus): boolean => {
    return [
      SessionStatus.RESOLVED,
      SessionStatus.ABANDONED,
      SessionStatus.CREATED,
      SessionStatus.INVITED,
    ].includes(status);
  };

  const handleArchive = useCallback(
    (session: SessionSummaryDTO) => {
      // Close the swipeable
      swipeableRefs.current.get(session.id)?.close();

      Alert.alert(
        'Archive Session',
        `Archive your session with ${session.partner.name || 'this person'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            style: 'destructive',
            onPress: async () => {
              try {
                await archiveSession.mutateAsync({ sessionId: session.id });
              } catch (error) {
                console.error('Failed to archive session:', error);
                Alert.alert('Error', 'Failed to archive session. Please try again.');
              }
            },
          },
        ]
      );
    },
    [archiveSession]
  );

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
      session: SessionSummaryDTO
    ) => {
      if (!canArchive(session.status)) {
        return null;
      }

      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={styles.archiveAction}
          onPress={() => handleArchive(session)}
          accessibilityRole="button"
          accessibilityLabel="Archive session"
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Archive color="#FFFFFF" size={24} />
          </Animated.View>
          <Animated.Text
            style={[styles.archiveText, { transform: [{ scale }] }]}
          >
            Archive
          </Animated.Text>
        </TouchableOpacity>
      );
    },
    [handleArchive, styles]
  );

  const renderSessionItem = useCallback(
    ({ item }: { item: SessionSummaryDTO }) => {
      const isArchivable = canArchive(item.status);

      if (isArchivable) {
        return (
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
            <TouchableOpacity onPress={() => handleSessionPress(item.id)}>
              <SessionCard session={item} />
            </TouchableOpacity>
          </Swipeable>
        );
      }

      return (
        <TouchableOpacity onPress={() => handleSessionPress(item.id)}>
          <SessionCard session={item} />
        </TouchableOpacity>
      );
    },
    [renderRightActions, handleSessionPress]
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
    // Archive swipe action
    archiveAction: {
      backgroundColor: t.colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      borderRadius: 12,
      marginLeft: t.spacing.sm,
    },
    archiveText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
  }));
