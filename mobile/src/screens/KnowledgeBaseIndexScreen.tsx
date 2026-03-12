/**
 * Knowledge Base Index Screen
 *
 * Browse index showing topics, people, and themes as a SectionList.
 * Each row navigates to the detail screen (KnowledgeBaseTopicScreen).
 *
 * 2-tap depth constraint: Index (tap 1) -> Detail with full content (tap 2).
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Tag, Users, Sparkles, ChevronRight, type LucideIcon } from 'lucide-react-native';

import {
  useKnowledgeBaseTopics,
  useKnowledgeBasePeople,
  useKnowledgeBaseThemes,
  TopicSummaryDTO,
  PersonSummaryDTO,
  ThemeSummaryDTO,
} from '@/src/hooks/useKnowledgeBase';
import { ScreenHeader } from '@/src/components';
import { createStyles } from '@/src/theme/styled';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

type SectionType = 'topic' | 'person' | 'theme';
type SummaryItem = TopicSummaryDTO | PersonSummaryDTO | ThemeSummaryDTO;

interface Section {
  title: string;
  icon: LucideIcon;
  data: SummaryItem[];
  type: SectionType;
}

// ============================================================================
// Component
// ============================================================================

export default function KnowledgeBaseIndexScreen() {
  const styles = useStyles();
  const router = useRouter();

  const { data: topicsData, isLoading: topicsLoading } = useKnowledgeBaseTopics();
  const { data: peopleData, isLoading: peopleLoading } = useKnowledgeBasePeople();
  const { data: themesData, isLoading: themesLoading } = useKnowledgeBaseThemes();

  const isLoading = topicsLoading || peopleLoading || themesLoading;

  const sections: Section[] = [
    { title: 'Topics', icon: Tag, data: topicsData?.items ?? [], type: 'topic' as const },
    { title: 'People', icon: Users, data: peopleData?.items ?? [], type: 'person' as const },
    { title: 'Themes', icon: Sparkles, data: themesData?.items ?? [], type: 'theme' as const },
  ].filter((s) => s.data.length > 0);

  const handleItemPress = useCallback(
    (item: SummaryItem, sectionType: SectionType) => {
      const slug = 'slug' in item && item.slug ? item.slug : item.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push({ pathname: '/inner-thoughts/knowledge-base/[topic]' as any, params: { topic: slug, type: sectionType } });
    },
    [router]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => {
      const Icon = section.icon;
      return (
        <View style={styles.sectionHeader}>
          <Icon color={colors.textSecondary} size={14} />
          <Text style={styles.sectionHeaderText}>{section.title.toUpperCase()}</Text>
          <Text style={styles.sectionHeaderCount}>({section.data.length})</Text>
        </View>
      );
    },
    [styles.sectionHeader, styles.sectionHeaderText, styles.sectionHeaderCount]
  );

  const renderItem = useCallback(
    ({ item, section }: { item: SummaryItem; section: Section }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleItemPress(item, section.type)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.label}`}
        activeOpacity={0.7}
      >
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Text style={styles.rowCount}>{item.takeawayCount} takeaways</Text>
        </View>
        <ChevronRight color={colors.textMuted} size={18} />
      </TouchableOpacity>
    ),
    [handleItemPress, styles.row, styles.rowContent, styles.rowLabel, styles.rowCount]
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Knowledge Base" showBackButton />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (sections.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Knowledge Base" showBackButton />
        <View style={styles.emptyContainer}>
          <Sparkles color={colors.textMuted} size={48} />
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Your knowledge base will grow as you complete sessions and review your reflections.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="Knowledge Base" showBackButton />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      />
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
    },
    listContent: {
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.sm,
    },
    sectionHeaderText: {
      fontSize: 13,
      color: t.colors.textSecondary,
      fontWeight: '600',
      letterSpacing: 1,
    },
    sectionHeaderCount: {
      fontSize: 13,
      color: t.colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    rowContent: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 16,
      color: t.colors.textPrimary,
      fontWeight: '500',
      marginBottom: 2,
    },
    rowCount: {
      fontSize: 13,
      color: t.colors.textMuted,
    },
    separator: {
      height: t.spacing.sm,
    },
    sectionSeparator: {
      height: 0,
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
      maxWidth: 300,
      lineHeight: 24,
    },
  }));
