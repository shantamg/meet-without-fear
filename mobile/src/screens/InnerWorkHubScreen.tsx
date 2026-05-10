/**
 * InnerWorkHubScreen Component
 *
 * The Inner Work hub showing the user's Inner Thoughts session list.
 * Each session displays its date and AI-generated topic tag.
 */

import { useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Sparkles,
  MessageCircle,
  ChevronRight,
  Lock,
  Plus,
} from 'lucide-react-native';

import { useInnerThoughtsSessions } from '../hooks';
import { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { trackInnerWorkHubOpened } from '../services/analytics';
import { createStyles } from '../theme/styled';
import { useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InnerWorkHubScreenProps {
  onBack?: () => void;
  onStartNewSession?: () => void;
  onOpenSession?: (sessionId: string) => void;
  /** How the user arrived at the hub (e.g. 'tab_press', 'post_session_prompt') */
  source?: string;
}

interface SessionListItemProps {
  session: InnerWorkSessionSummaryDTO;
  onPress: () => void;
}

// ============================================================================
// Session List Item Component
// ============================================================================

function SessionListItem({ session, onPress }: SessionListItemProps) {
  const { palette } = useAppAppearance();
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
    <TouchableOpacity
      style={[
        styles.sessionItem,
        {
          backgroundColor: palette.bgElev,
          borderColor: palette.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.sessionContent}>
        <Text style={[styles.sessionDate, { color: palette.text }]}>{formattedDate}</Text>
        {session.theme != null && (
          <View style={styles.sessionThemeTag}>
            <Sparkles size={11} color={palette.accent} />
            <Text style={[styles.sessionThemeText, { color: palette.accent }]}>{session.theme}</Text>
          </View>
        )}
        <Text style={[styles.sessionSummary, { color: palette.textMuted }]} numberOfLines={2}>
          {secondaryText}
        </Text>
      </View>
      <ChevronRight size={20} color={palette.textFaint} />
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InnerWorkHubScreen({
  onBack,
  onStartNewSession,
  onOpenSession,
  source = 'tab_press',
}: InnerWorkHubScreenProps) {
  const { palette } = useAppAppearance();
  const { data, isLoading, error, refetch } = useInnerThoughtsSessions();

  useEffect(() => {
    trackInnerWorkHubOpened(source);
  }, [source]);

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleNewSession = useCallback(() => {
    onStartNewSession?.();
  }, [onStartNewSession]);

  const handleSessionPress = useCallback((sessionId: string) => {
    onOpenSession?.(sessionId);
  }, [onOpenSession]);

  const sessions = data?.sessions ?? [];

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={[styles.loadingText, { color: palette.textMuted }]}>Opening your space...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: palette.bg, borderBottomColor: palette.divider }]}>
          <HeaderBackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: palette.text }]}>Inner Thoughts</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: palette.text }]}>
            We're having trouble loading your space right now.
          </Text>
          <Text style={[styles.errorSubtext, { color: palette.textMuted }]}>
            Your reflections are safe — please try again in a moment.
          </Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={[styles.errorRetryButton, { backgroundColor: palette.accent }]}
              onPress={() => refetch()}
              activeOpacity={0.7}
            >
              <Text style={[styles.errorRetryText, { color: palette.bg }]}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.errorHomeButton, { backgroundColor: palette.bgElev }]}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Text style={[styles.errorHomeText, { color: palette.text }]}>Go Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.bg, borderBottomColor: palette.divider }]}>
        <HeaderBackButton onPress={handleBack} />
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Inner Thoughts</Text>
          <View style={styles.privacyBadge}>
            <Lock size={10} color={palette.textMuted} />
            <Text style={[styles.privacyText, { color: palette.textMuted }]}>Your private space</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.headerIconButton, { backgroundColor: palette.bgElev, borderColor: palette.border }]}
          onPress={handleNewSession}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Start new Inner Thoughts session"
        >
          <Plus size={20} color={palette.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SessionListItem session={item} onPress={() => handleSessionPress(item.id)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MessageCircle size={40} color={palette.textMuted} />
            <Text style={[styles.emptyStateText, { color: palette.text }]}>Start your first session</Text>
            <Text style={[styles.emptyStateSubtext, { color: palette.textMuted }]}>
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
    width: 36,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  listContent: {
    padding: t.spacing.md,
  },

  // Session Item
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.sm,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
    borderWidth: 1,
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
    color: t.colors.accent,
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
