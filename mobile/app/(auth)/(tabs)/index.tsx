/**
 * Home Screen
 *
 * Main dashboard showing sessions with smart hero card for urgent sessions.
 * Features:
 * - Hero card for most urgent session (action needed first)
 * - Session list sorted by priority
 * - Empty state with new session CTA
 * - Pull to refresh
 * - Biometric authentication opt-in prompt
 */

import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/hooks/useAuth';
import { useBiometricAuth } from '@/src/hooks';
import { useSessions } from '../../../src/hooks/useSessions';
import { SessionCard } from '../../../src/components/SessionCard';
import { BiometricPrompt } from '../../../src/components/BiometricPrompt';
import { colors } from '@/src/theme';
import type { SessionSummaryDTO } from '@be-heard/shared';

// ============================================================================
// Component
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const { isAvailable, isEnrolled, hasPrompted, isLoading: biometricLoading } = useBiometricAuth();

  // Biometric prompt state
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Show biometric prompt when conditions are met
  useEffect(() => {
    // Show prompt if biometrics available, enrolled, and user hasn't been prompted yet
    if (!biometricLoading && isAvailable && isEnrolled && !hasPrompted) {
      // Small delay to let the UI settle after login
      const timer = setTimeout(() => {
        setShowBiometricPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [biometricLoading, isAvailable, isEnrolled, hasPrompted]);

  // Sort sessions: action needed first, then by last updated
  const sortedSessions = useMemo(() => {
    const sessions = data?.items || [];
    return [...sessions].sort((a, b) => {
      // Sessions with selfActionNeeded come first
      const aHasAction = a.selfActionNeeded.length > 0;
      const bHasAction = b.selfActionNeeded.length > 0;

      if (aHasAction && !bHasAction) return -1;
      if (bHasAction && !aHasAction) return 1;

      // Then sort by most recently updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [data?.items]);

  const heroSession = sortedSessions[0];
  const otherSessions = sortedSessions.slice(1);

  const handleNewSession = () => {
    router.push('/session/new');
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!sortedSessions.length) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          {/* Welcome header */}
          <View style={styles.welcomeSection}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.firstName || user?.name || 'User'}</Text>
          </View>

          <View style={styles.emptyContent}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>&#128172;</Text>
            </View>
            <Text style={styles.emptyTitle}>No active sessions</Text>
            <Text style={styles.emptySubtitle}>
              Start a new conversation to work through something together
            </Text>
            <TouchableOpacity
              style={styles.newSessionButton}
              onPress={handleNewSession}
              accessibilityRole="button"
              accessibilityLabel="Create new session"
            >
              <Plus color={colors.textPrimary} size={20} />
              <Text style={styles.newSessionButtonText}>New Session</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Biometric opt-in prompt */}
        <BiometricPrompt
          visible={showBiometricPrompt}
          onDismiss={() => setShowBiometricPrompt(false)}
          testID="biometric-prompt"
        />
      </SafeAreaView>
    );
  }

  // Render session list item
  const renderSession = ({ item }: { item: SessionSummaryDTO }) => (
    <SessionCard session={item} />
  );

  // Key extractor for FlatList
  const keyExtractor = (item: SessionSummaryDTO) => item.id;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={otherSessions}
        keyExtractor={keyExtractor}
        renderItem={renderSession}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Welcome section */}
            <View style={styles.welcomeSection}>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.firstName || user?.name || 'User'}</Text>
            </View>

            {/* Header with new session button */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Your Sessions</Text>
              <TouchableOpacity
                style={styles.headerNewButton}
                onPress={handleNewSession}
                accessibilityRole="button"
                accessibilityLabel="Create new session"
              >
                <Plus color={colors.accent} size={24} />
              </TouchableOpacity>
            </View>

            {/* Hero card for most urgent session */}
            {heroSession && (
              <SessionCard session={heroSession} isHero />
            )}

            {/* Section header for other sessions */}
            {otherSessions.length > 0 && (
              <Text style={styles.sectionTitle}>Other Sessions</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          heroSession ? null : (
            <Text style={styles.noMoreSessions}>No other sessions</Text>
          )
        }
      />

      {/* Biometric opt-in prompt */}
      <BiometricPrompt
        visible={showBiometricPrompt}
        onDismiss={() => setShowBiometricPrompt(false)}
        testID="biometric-prompt"
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Layout containers
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyContainer: {
    flex: 1,
    padding: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 280,
    alignSelf: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },

  // Welcome section
  welcomeSection: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerNewButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.bgTertiary,
  },

  // Section title
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Loading state
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },

  // Empty state
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },

  // New session button
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newSessionButtonText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },

  // No more sessions text
  noMoreSessions: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
