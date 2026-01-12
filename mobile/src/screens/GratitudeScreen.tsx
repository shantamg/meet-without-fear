/**
 * GratitudeScreen Component
 *
 * "See the Positive" - Gratitude practice feature for journaling
 * what you're grateful for and tracking patterns over time.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Heart,
  Plus,
  Calendar,
  Flame,
  X,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

import {
  useGratitudeEntries,
  useCreateGratitude,
  useGratitudePrompt,
  useGratitudePatterns,
  calculateStreak,
  getTodaysEntries,
  useSpeech,
} from '../hooks';
import { useToast } from '../contexts/ToastContext';
import { GratitudeEntryDTO } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface GratitudeScreenProps {
  onNavigateBack?: () => void;
}

// ============================================================================
// Entry Card Component
// ============================================================================

interface EntryCardProps {
  entry: GratitudeEntryDTO;
}

function EntryCard({ entry }: EntryCardProps) {
  const date = new Date(entry.createdAt);
  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  // Get first theme from metadata if available
  const firstTheme = entry.metadata?.themes?.[0];

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryContent}>
        <Text style={styles.entryText}>{entry.content}</Text>
        {firstTheme && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{firstTheme}</Text>
          </View>
        )}
      </View>
      <Text style={styles.entryTime}>{dateString} at {timeString}</Text>
    </View>
  );
}

// ============================================================================
// New Entry Modal Component
// ============================================================================

interface NewEntryFormProps {
  onSubmit: (content: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  prompt?: string;
}

function NewEntryForm({ onSubmit, onCancel, isSubmitting, prompt }: NewEntryFormProps) {
  const [content, setContent] = useState('');
  const { isSpeaking, currentId, toggle: toggleSpeech } = useSpeech();

  const handleSubmit = useCallback(() => {
    if (content.trim()) {
      onSubmit(content.trim());
    }
  }, [content, onSubmit]);

  const handleCancel = useCallback(() => {
    if (content.trim()) {
      // Confirm discard when there's unsaved content
      Alert.alert(
        'Discard Entry?',
        'You have unsaved text. Are you sure you want to discard it?',
        [
          { text: 'Keep Writing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onCancel },
        ]
      );
    } else {
      onCancel();
    }
  }, [content, onCancel]);

  const handlePromptSpeech = useCallback(() => {
    if (prompt) {
      toggleSpeech(prompt, 'gratitude-prompt');
    }
  }, [prompt, toggleSpeech]);

  const isPromptSpeaking = isSpeaking && currentId === 'gratitude-prompt';

  return (
    <View style={styles.newEntryForm}>
      <View style={styles.newEntryHeader}>
        <Text style={styles.newEntryTitle}>What are you grateful for?</Text>
        <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
          <X size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {prompt && (
        <TouchableOpacity style={styles.promptCard} onPress={handlePromptSpeech}>
          <Sparkles size={16} color={colors.accent} />
          <Text style={styles.promptText}>{prompt}</Text>
          {isPromptSpeaking ? (
            <VolumeX size={18} color={colors.accent} />
          ) : (
            <Volume2 size={18} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      )}

      <TextInput
        style={styles.textInput}
        placeholder="I'm grateful for..."
        placeholderTextColor={colors.textMuted}
        multiline
        value={content}
        onChangeText={setContent}
        autoFocus
      />

      <TouchableOpacity
        style={[
          styles.submitButton,
          !content.trim() && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!content.trim() || isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Saving...' : 'Save Gratitude'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function GratitudeScreen({ onNavigateBack }: GratitudeScreenProps) {
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  const { showSuccess, showError } = useToast();
  const { data: entriesData, isLoading } = useGratitudeEntries({ limit: 50 });
  const { data: patternsData } = useGratitudePatterns();
  const { data: promptData } = useGratitudePrompt();
  const createGratitude = useCreateGratitude();

  const entries = entriesData?.entries ?? [];
  const patterns = patternsData?.patterns;

  const streak = useMemo(() => calculateStreak(entries), [entries]);
  const todaysCount = useMemo(() => getTodaysEntries(entries).length, [entries]);

  const handleBack = useCallback(() => {
    onNavigateBack?.();
  }, [onNavigateBack]);

  const handleAddEntry = useCallback(() => {
    setIsAddingEntry(true);
  }, []);

  const handleCancelEntry = useCallback(() => {
    setIsAddingEntry(false);
  }, []);

  const handleSubmitEntry = useCallback(
    (content: string) => {
      createGratitude.mutate(
        { content },
        {
          onSuccess: () => {
            setIsAddingEntry(false);
            showSuccess('Gratitude Saved', 'Your gratitude entry has been recorded.');
          },
          onError: () => {
            showError('Save Failed', 'Could not save your gratitude entry. Please try again.');
          },
        }
      );
    },
    [createGratitude, showSuccess, showError]
  );

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading gratitude...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>See the Positive</Text>
          <TouchableOpacity onPress={handleAddEntry} style={styles.addButton}>
            <Plus size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* New Entry Form (Full Screen Overlay) */}
        {isAddingEntry ? (
          <NewEntryForm
            onSubmit={handleSubmitEntry}
            onCancel={handleCancelEntry}
            isSubmitting={createGratitude.isPending}
            prompt={promptData?.prompt}
          />
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Flame size={24} color={colors.warning} />
                <Text style={styles.statValue}>{streak}</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>
              <View style={styles.statCard}>
                <Calendar size={24} color={colors.brandBlue} />
                <Text style={styles.statValue}>{todaysCount}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={styles.statCard}>
                <Heart size={24} color={colors.success} />
                <Text style={styles.statValue}>{entries.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>

            {/* Top Themes */}
            {patterns?.topThemes && patterns.topThemes.length > 0 && (
              <View style={styles.patternsCard}>
                <Text style={styles.patternsTitle}>Your Patterns</Text>
                <Text style={styles.patternsDescription}>
                  Common themes in your gratitude:
                </Text>
                <View style={styles.topCategoriesList}>
                  {patterns.topThemes.slice(0, 3).map((theme, index) => (
                    <View key={theme.theme} style={styles.topCategoryItem}>
                      <Text style={styles.topCategoryRank}>#{index + 1}</Text>
                      <Text style={styles.topCategoryName}>{theme.theme}</Text>
                      <Text style={styles.topCategoryCount}>({theme.count})</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Empty State */}
            {entries.length === 0 && (
              <View style={styles.emptyState}>
                <Heart size={64} color={colors.success + '40'} />
                <Text style={styles.emptyTitle}>Start your gratitude practice</Text>
                <Text style={styles.emptyDescription}>
                  Taking a moment each day to notice what you're grateful for
                  can improve your mood and overall well-being.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={handleAddEntry}>
                  <Text style={styles.primaryButtonText}>Add First Entry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Recent Entries */}
            {entries.length > 0 && (
              <View style={styles.entriesSection}>
                <Text style={styles.sectionTitle}>Recent Gratitudes</Text>
                {entries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </View>
            )}

            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}

        {/* Floating Add Button (when not adding) */}
        {!isAddingEntry && entries.length > 0 && (
          <TouchableOpacity style={styles.fab} onPress={handleAddEntry}>
            <Plus size={28} color={colors.textOnAccent} />
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: t.spacing.md,
    fontSize: 16,
    color: t.colors.textSecondary,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  addButton: {
    padding: t.spacing.xs,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: t.spacing.md,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    marginBottom: t.spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: t.colors.textPrimary,
    marginTop: t.spacing.sm,
  },
  statLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },

  // Patterns Card
  patternsCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.lg,
  },
  patternsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.xs,
  },
  patternsDescription: {
    fontSize: 13,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.md,
  },
  topCategoriesList: {
    gap: t.spacing.sm,
  },
  topCategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topCategoryRank: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.accent,
    width: 30,
  },
  topCategoryName: {
    fontSize: 14,
    color: t.colors.textPrimary,
    flex: 1,
  },
  topCategoryCount: {
    fontSize: 12,
    color: t.colors.textMuted,
  },

  // Entries Section
  entriesSection: {
    marginTop: t.spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.md,
  },

  // Entry Card
  entryCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  entryContent: {
    marginBottom: t.spacing.sm,
  },
  entryText: {
    fontSize: 15,
    color: t.colors.textPrimary,
    lineHeight: 22,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.bgTertiary,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 2,
    marginTop: t.spacing.sm,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  entryTime: {
    fontSize: 11,
    color: t.colors.textMuted,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: t.spacing['3xl'],
    paddingHorizontal: t.spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginTop: t.spacing.lg,
    marginBottom: t.spacing.sm,
  },
  emptyDescription: {
    fontSize: 14,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: t.spacing.lg,
  },

  // New Entry Form
  newEntryForm: {
    flex: 1,
    padding: t.spacing.md,
  },
  newEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.spacing.lg,
  },
  newEntryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  closeButton: {
    padding: t.spacing.xs,
  },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.sm,
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
  },
  promptText: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textSecondary,
    fontStyle: 'italic',
  },
  textInput: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    fontSize: 16,
    color: t.colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: t.spacing.lg,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: t.colors.textSecondary,
    marginBottom: t.spacing.sm,
  },
  categoryScroll: {
    marginBottom: t.spacing.lg,
  },
  categoryChip: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    marginRight: t.spacing.sm,
  },
  categoryChipSelected: {
    borderColor: t.colors.accent,
    backgroundColor: t.colors.accent + '20',
  },
  categoryChipText: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: t.colors.accent,
  },
  submitButton: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: t.colors.bgTertiary,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textOnAccent,
  },

  // Primary Button
  primaryButton: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textOnAccent,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: t.spacing.lg,
    right: t.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Bottom
  bottomSpacer: {
    height: 80,
  },
}));

export default GratitudeScreen;
