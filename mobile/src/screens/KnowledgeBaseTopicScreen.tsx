/**
 * Knowledge Base Topic/Person/Theme Detail Screen
 *
 * Shows all takeaways for a given topic, person, or theme.
 * Takeaway content is shown in full (no 3rd drill-down — satisfies 2-tap depth constraint).
 *
 * Features:
 * - Multi-select mode via header "Select" / "Cancel" toggle
 * - Select All / Deselect All shortcut in bottom action bar
 * - OS share sheet integration via React Native Share API
 * - Selection state resets on navigation away (useFocusEffect cleanup)
 * - iPad popover anchor via findNodeHandle
 *
 * @param topic - Slug or ID for the topic/person/theme (from URL param)
 * @param type  - 'topic' | 'person' | 'theme' (from URL param)
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Circle, CheckCircle2 } from 'lucide-react-native';

import {
  useKnowledgeBaseTopicDetail,
  useKnowledgeBasePersonDetail,
  useKnowledgeBaseThemeDetail,
  TakeawayItem,
} from '@/src/hooks/useKnowledgeBase';
import { formatTakeawaysForExport } from '@/src/utils/knowledgeBaseExport';
import { ScreenHeader } from '@/src/components';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeBaseTopicScreenProps {
  topic?: string;
  type?: 'topic' | 'person' | 'theme';
}

// ============================================================================
// Helpers
// ============================================================================

function formatSessionDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Component
// ============================================================================

export default function KnowledgeBaseTopicScreen({
  topic,
  type = 'topic',
}: KnowledgeBaseTopicScreenProps) {
  const styles = useStyles();

  // ---- Selection state ----
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Reset selection state when navigating away (Research pitfall 4)
  useFocusEffect(
    useCallback(() => {
      return () => exitSelectionMode();
    }, [exitSelectionMode])
  );

  // ---- Data fetching ----
  // All three hooks are called but only the matching one is enabled via the
  // enabled option already built into each hook (falsy id => disabled).
  const topicQuery = useKnowledgeBaseTopicDetail(type === 'topic' ? topic : undefined);
  const personQuery = useKnowledgeBasePersonDetail(type === 'person' ? topic : undefined);
  const themeQuery = useKnowledgeBaseThemeDetail(type === 'theme' ? topic : undefined);

  const activeQuery = type === 'topic' ? topicQuery : type === 'person' ? personQuery : themeQuery;

  // Normalise: each query wraps its payload in a different key
  const detail = (() => {
    if (type === 'topic' && topicQuery.data) {
      return { label: topicQuery.data.topic.label, takeaways: topicQuery.data.topic.takeaways };
    }
    if (type === 'person' && personQuery.data) {
      return { label: personQuery.data.person.label, takeaways: personQuery.data.person.takeaways };
    }
    if (type === 'theme' && themeQuery.data) {
      return { label: themeQuery.data.theme.label, takeaways: themeQuery.data.theme.takeaways };
    }
    return null;
  })();

  // ---- Share handler ----
  // iPad popover anchor
  const shareButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  const handleShare = useCallback(async () => {
    if (!detail?.takeaways) return;
    const selected = detail.takeaways.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;

    const text = formatTakeawaysForExport(
      selected.map((t) => ({ content: t.content, theme: t.theme })),
      detail.label
    );

    try {
      const shareOptions =
        Platform.OS === 'ios'
          ? { anchor: findNodeHandle(shareButtonRef.current) ?? undefined }
          : {};

      await Share.share({ message: text, title: 'My Reflections' }, shareOptions);
    } catch {
      // User dismissed the share sheet — not an error
    }
  }, [detail, selectedIds]);

  // ---- Select All toggle ----
  const handleSelectAll = useCallback(() => {
    if (!detail?.takeaways) return;
    if (selectedIds.size === detail.takeaways.length) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      setSelectedIds(new Set(detail.takeaways.map((t) => t.id))); // Select all
    }
  }, [detail, selectedIds.size]);

  // ---- Header right action ----
  const headerRightAction = {
    icon: (
      <Text style={selectionMode ? styles.headerActionCancel : styles.headerActionSelect}>
        {selectionMode ? 'Cancel' : 'Select'}
      </Text>
    ),
    onPress: selectionMode ? exitSelectionMode : () => setSelectionMode(true),
    accessibilityLabel: selectionMode ? 'Cancel selection' : 'Enter selection mode',
  };

  // ---- Render states ----
  if (activeQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Loading..." showBackButton rightAction={headerRightAction} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (activeQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title={topic ?? 'Detail'} showBackButton />
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load content.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => activeQuery.refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Item renderer ----
  const renderItem = ({ item }: { item: TakeawayItem }) => {
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={selectionMode ? () => toggleItem(item.id) : undefined}
        activeOpacity={selectionMode ? 0.7 : 1}
        accessibilityRole={selectionMode ? 'checkbox' : 'none'}
        accessibilityState={selectionMode ? { checked: isSelected } : undefined}
        accessibilityLabel={item.content}
      >
        {selectionMode && (
          <View style={styles.checkbox}>
            {isSelected ? (
              <CheckCircle2 color={colors.accent} size={22} />
            ) : (
              <Circle color={colors.textMuted} size={22} />
            )}
          </View>
        )}
        <View style={styles.cardContent}>
          <Text style={styles.takeawayContent}>{item.content}</Text>
          <Text style={styles.takeawayDate}>{formatSessionDate(item.sessionDate)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const takeaways = detail?.takeaways ?? [];
  const allSelected = takeaways.length > 0 && selectedIds.size === takeaways.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader
        title={detail?.label ?? topic ?? 'Detail'}
        showBackButton
        rightAction={headerRightAction}
      />

      {takeaways.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No takeaways yet for this {type}.</Text>
        </View>
      ) : (
        <FlatList
          data={takeaways}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            selectionMode && selectedIds.size > 0 && styles.listContentWithBar,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Bottom action bar — visible only in selection mode */}
      {selectionMode && (
        <View style={styles.actionBar}>
          <Text style={styles.actionBarCount}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity
            style={styles.actionBarButton}
            onPress={handleSelectAll}
            accessibilityRole="button"
            accessibilityLabel={allSelected ? 'Deselect all takeaways' : 'Select all takeaways'}
          >
            <Text style={styles.actionBarButtonText}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            ref={shareButtonRef}
            style={[
              styles.shareButton,
              selectedIds.size === 0 && styles.shareButtonDisabled,
            ]}
            onPress={handleShare}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Share ${selectedIds.size} selected takeaways`}
          >
            <Text
              style={[
                styles.shareButtonText,
                selectedIds.size === 0 && styles.shareButtonTextDisabled,
              ]}
            >
              Share
            </Text>
          </TouchableOpacity>
        </View>
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
      padding: t.spacing.xl,
    },
    listContent: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.xl,
    },
    listContentWithBar: {
      paddingBottom: 80,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    cardSelected: {
      borderWidth: 1.5,
      borderColor: t.colors.accent,
    },
    checkbox: {
      marginRight: t.spacing.md,
      marginTop: 2,
    },
    cardContent: {
      flex: 1,
    },
    takeawayContent: {
      fontSize: 15,
      color: t.colors.textPrimary,
      lineHeight: 22,
      marginBottom: t.spacing.sm,
    },
    takeawayDate: {
      fontSize: 12,
      color: t.colors.textMuted,
    },
    separator: {
      height: t.spacing.sm,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.spacing.xl,
    },
    emptyText: {
      fontSize: 16,
      color: t.colors.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 16,
      color: t.colors.error,
      marginBottom: t.spacing.md,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.md,
    },
    retryButtonText: {
      fontSize: 15,
      color: t.colors.accent,
      fontWeight: '600',
    },
    headerActionSelect: {
      fontSize: 15,
      color: t.colors.accent,
      fontWeight: '500',
    },
    headerActionCancel: {
      fontSize: 15,
      color: t.colors.textSecondary,
      fontWeight: '500',
    },
    // Bottom action bar
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    actionBarCount: {
      fontSize: 14,
      color: t.colors.textSecondary,
      flex: 1,
    },
    actionBarButton: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      marginRight: t.spacing.sm,
    },
    actionBarButtonText: {
      fontSize: 14,
      color: t.colors.accent,
      fontWeight: '500',
    },
    shareButton: {
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      backgroundColor: t.colors.accent,
      borderRadius: t.radius.md,
    },
    shareButtonDisabled: {
      backgroundColor: t.colors.bgTertiary,
    },
    shareButtonText: {
      fontSize: 14,
      color: '#fff',
      fontWeight: '600',
    },
    shareButtonTextDisabled: {
      color: t.colors.textMuted,
    },
  }));
