/**
 * InnerWorkHubScreen Component
 *
 * The Inner Work hub showing the user's Inner Thoughts session list.
 * Each session displays its date and AI-generated topic tag.
 */

import { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Sparkles,
  MessageCircle,
  ChevronRight,
  Lock,
} from 'lucide-react-native';

import { useInnerThoughtsSessions } from '../hooks';
import { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InnerWorkHubScreenProps {
  onBack?: () => void;
  onNavigateToSelfReflection?: () => void;
}

interface SessionListItemProps {
  session: InnerWorkSessionSummaryDTO;
  onPress: () => void;
}

// ============================================================================
// Session List Item Component
// ============================================================================

function SessionListItem({ session, onPress }: SessionListItemProps) {
  const formattedDate = new Date(session.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let secondaryText: string;
  if (session.summary) {
    secondaryText = session.summary;
  } else if (session.title) {
    secondaryText = session.title;
  } else {
    secondaryText = `Session with ${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`;
  }

  return (
    <TouchableOpacity style={styles.sessionItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.sessionContent}>
        <Text style={styles.sessionDate}>{formattedDate}</Text>
        {session.theme != null && (
          <View style={styles.sessionThemeTag}>
            <Sparkles size={11} color={colors.brandPurple} />
            <Text style={styles.sessionThemeText}>{session.theme}</Text>
          </View>
        )}
        <Text style={styles.sessionSummary} numberOfLines={2}>
          {secondaryText}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InnerWorkHubScreen({
  onBack,
  onNavigateToSelfReflection,
}: InnerWorkHubScreenProps) {
  const { data, isLoading, error, refetch } = useInnerThoughtsSessions();

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleNewSession = useCallback(() => {
    onNavigateToSelfReflection?.();
  }, [onNavigateToSelfReflection]);

  const handleSessionPress = useCallback(() => {
    onNavigateToSelfReflection?.();
  }, [onNavigateToSelfReflection]);

  const sessions = data?.sessions ?? [];

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Opening your space...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Inner Work</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            We're having trouble loading your space right now.
          </Text>
          <Text style={styles.errorSubtext}>
            Your reflections are safe — please try again in a moment.
          </Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={styles.errorRetryButton}
              onPress={() => refetch()}
              activeOpacity={0.7}
            >
              <Text style={styles.errorRetryText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.errorHomeButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Text style={styles.errorHomeText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Inner Work</Text>
          <View style={styles.privacyBadge}>
            <Lock size={10} color={colors.textMuted} />
            <Text style={styles.privacyText}>Your private space</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.newSessionButton}
            onPress={handleNewSession}
            activeOpacity={0.8}
          >
            <View style={styles.newSessionIconContainer}>
              <MessageCircle size={22} color={colors.brandPurple} />
            </View>
            <Text style={styles.newSessionText}>New Session</Text>
            <ChevronRight size={20} color={colors.brandPurple} />
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <SessionListItem session={item} onPress={handleSessionPress} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MessageCircle size={40} color={colors.textMuted} />
            <Text style={styles.emptyStateText}>Start your first session</Text>
            <Text style={styles.emptyStateSubtext}>
              This is your private space to reflect and process your thoughts.
            </Text>
          </View>
        }
        ListFooterComponent={<View style={styles.bottomSpacer} />}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = createStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.bgPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: t.spacing.md,
    fontSize: 16,
    color: t.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: t.spacing.xl,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: t.colors.textPrimary,
    textAlign: 'center',
  },
  errorSubtext: {
    marginTop: t.spacing.sm,
    fontSize: 14,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: t.spacing.md,
    marginTop: t.spacing.lg,
  },
  errorRetryButton: {
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.lg,
  },
  errorRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.textOnAccent,
  },
  errorHomeButton: {
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
  },
  errorHomeText: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.bgSecondary,
  },
  backButton: {
    padding: t.spacing.xs,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  privacyText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  headerRight: {
    width: 32,
  },

  // List
  listContent: {
    padding: t.spacing.md,
  },

  // New Session Button
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  newSessionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandPurple + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: t.spacing.sm,
  },
  newSessionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },

  // Session Item
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  sessionContent: {
    flex: 1,
    marginRight: t.spacing.sm,
  },
  sessionDate: {
    fontSize: 15,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: 4,
  },
  sessionThemeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  sessionThemeText: {
    fontSize: 12,
    color: colors.brandPurple,
    fontWeight: '500',
  },
  sessionSummary: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: t.spacing.xl * 2,
    paddingHorizontal: t.spacing.lg,
  },
  emptyStateText: {
    fontSize: 17,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginTop: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Bottom
  bottomSpacer: {
    height: t.spacing.xl,
  },
}));

export default InnerWorkHubScreen;
