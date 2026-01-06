/**
 * Notifications Screen
 *
 * Displays the user's notification inbox with support for
 * read/unread states, infinite scroll, and deep linking.
 */

import { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationInbox } from '@/src/components/NotificationInbox';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useNotifications } from '@/src/hooks/useNotifications';
import { colors } from '@/src/theme';

// ============================================================================
// Component
// ============================================================================

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    isLoading,
    isError,
    refreshing,
    isLoadingMore,
    hasMore,
    refetch,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();

  // Handle empty state action
  const handleEmptyAction = useCallback(() => {
    router.push('/session/new');
  }, [router]);

  // Render loading state
  if (isLoading && notifications.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <ScreenHeader title="Notifications" />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Render error state
  if (isError && notifications.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <ScreenHeader title="Notifications" />
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Failed to load notifications</Text>
            <Text style={styles.errorSubtext}>Pull down to try again</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Notifications" />
        <View style={styles.content}>
          <NotificationInbox
            notifications={notifications}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            refreshing={refreshing}
            onRefresh={refetch}
            onEmptyAction={handleEmptyAction}
            onEndReached={loadMore}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
