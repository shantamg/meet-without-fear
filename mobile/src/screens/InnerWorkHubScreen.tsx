/**
 * InnerWorkHubScreen Component
 *
 * The main hub for Inner Work features:
 * - Am I OK? (Needs Assessment)
 * - See the Positive (Gratitude)
 * - Develop Loving Awareness (Meditation)
 * - Self-Reflection (AI-guided conversations)
 */

import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Heart,
  Brain,
  Sparkles,
  MessageCircle,
  ChevronRight,
  TrendingUp,
  Lightbulb,
  X,
  AlertTriangle,
} from 'lucide-react-native';

import {
  useInnerWorkOverview,
  useDismissInsight,
  getSuggestedAction,
  calculateWellnessScore,
} from '../hooks';
import { InsightDTO, InsightType } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InnerWorkHubScreenProps {
  onBack?: () => void;
  onNavigateToNeedsAssessment?: () => void;
  onNavigateToGratitude?: () => void;
  onNavigateToMeditation?: () => void;
  onNavigateToSelfReflection?: () => void;
}

interface FeatureCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  stats?: { label: string; value: string }[];
  accentColor: string;
  onPress: () => void;
}

interface InsightCardProps {
  insight: InsightDTO;
  onDismiss: (id: string) => void;
  onLearnMore?: (insight: InsightDTO) => void;
}

// ============================================================================
// Feature Card Component
// ============================================================================

function FeatureCard({ title, subtitle, icon, stats, accentColor, onPress }: FeatureCardProps) {
  return (
    <TouchableOpacity
      style={[styles.featureCard, { borderLeftColor: accentColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.featureCardHeader}>
        <View style={[styles.featureIconContainer, { backgroundColor: accentColor + '20' }]}>
          {icon}
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </View>

      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>

      {stats && stats.length > 0 && (
        <View style={styles.featureStats}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Insight Card Component
// ============================================================================

function getInsightIcon(type: InsightType) {
  switch (type) {
    case InsightType.PATTERN:
      return <TrendingUp size={18} color={colors.brandBlue} />;
    case InsightType.CONTRADICTION:
      return <AlertTriangle size={18} color={colors.warning} />;
    case InsightType.SUGGESTION:
      return <Lightbulb size={18} color={colors.success} />;
    default:
      return <Lightbulb size={18} color={colors.accent} />;
  }
}

function getInsightAccentColor(type: InsightType): string {
  switch (type) {
    case InsightType.PATTERN:
      return colors.brandBlue;
    case InsightType.CONTRADICTION:
      return colors.warning;
    case InsightType.SUGGESTION:
      return colors.success;
    default:
      return colors.accent;
  }
}

function InsightCard({ insight, onDismiss, onLearnMore }: InsightCardProps) {
  const accentColor = getInsightAccentColor(insight.type);

  return (
    <View style={[styles.insightCard, { borderLeftColor: accentColor }]}>
      <View style={styles.insightHeader}>
        <View style={[styles.insightIconContainer, { backgroundColor: accentColor + '20' }]}>
          {getInsightIcon(insight.type)}
        </View>
        <TouchableOpacity
          onPress={() => onDismiss(insight.id)}
          style={styles.insightDismissButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.insightSummary}>{insight.summary}</Text>

      {onLearnMore && (
        <TouchableOpacity
          onPress={() => onLearnMore(insight)}
          style={styles.insightLearnMoreButton}
        >
          <Text style={[styles.insightLearnMoreText, { color: accentColor }]}>
            Learn more
          </Text>
          <ChevronRight size={14} color={accentColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InnerWorkHubScreen({
  onBack,
  onNavigateToNeedsAssessment,
  onNavigateToGratitude,
  onNavigateToMeditation,
  onNavigateToSelfReflection,
}: InnerWorkHubScreenProps) {
  const { data, isLoading, error } = useInnerWorkOverview();
  const dismissInsight = useDismissInsight();
  const overview = data?.overview;

  const suggestedAction = getSuggestedAction(overview);
  const wellnessScore = calculateWellnessScore(overview);

  // Get top 2 insights from overview
  const topInsights = overview?.recentInsights?.slice(0, 2) ?? [];

  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleDismissInsight = useCallback((insightId: string) => {
    dismissInsight.mutate(insightId);
  }, [dismissInsight]);

  const handleLearnMoreInsight = useCallback((insight: InsightDTO) => {
    // Navigate based on insight's related features
    const relatedFeatures = insight.data?.relatedFeatures ?? [];
    if (relatedFeatures.includes('meditation')) {
      onNavigateToMeditation?.();
    } else if (relatedFeatures.includes('gratitude')) {
      onNavigateToGratitude?.();
    } else if (relatedFeatures.includes('needs')) {
      onNavigateToNeedsAssessment?.();
    } else {
      // Default to self-reflection
      onNavigateToSelfReflection?.();
    }
  }, [onNavigateToMeditation, onNavigateToGratitude, onNavigateToNeedsAssessment, onNavigateToSelfReflection]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading Inner Work...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Something went wrong</Text>
          <Text style={styles.errorSubtext}>Please try again later</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inner Work</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Insight Cards - Show up to 2 above other content */}
        {topInsights.length > 0 && (
          <View style={styles.insightsSection}>
            {topInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={handleDismissInsight}
                onLearnMore={handleLearnMoreInsight}
              />
            ))}
          </View>
        )}

        {/* Wellness Score Card */}
        {wellnessScore !== null && (
          <View style={styles.wellnessCard}>
            <View style={styles.wellnessHeader}>
              <Text style={styles.wellnessLabel}>WELLNESS SCORE</Text>
              <TrendingUp size={16} color={colors.success} />
            </View>
            <Text style={styles.wellnessScore}>{wellnessScore}</Text>
            <Text style={styles.wellnessSubtext}>Based on your recent activity</Text>
          </View>
        )}

        {/* Suggested Action */}
        {suggestedAction && (
          <TouchableOpacity
            style={styles.suggestionCard}
            onPress={() => {
              switch (suggestedAction.type) {
                case 'needs_baseline':
                case 'needs_checkin':
                  onNavigateToNeedsAssessment?.();
                  break;
                case 'gratitude':
                  onNavigateToGratitude?.();
                  break;
                case 'meditation':
                  onNavigateToMeditation?.();
                  break;
                default:
                  onNavigateToSelfReflection?.();
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.suggestionContent}>
              <Text style={styles.suggestionTitle}>{suggestedAction.title}</Text>
              <Text style={styles.suggestionDescription}>{suggestedAction.description}</Text>
            </View>
            <ChevronRight size={20} color={colors.accent} />
          </TouchableOpacity>
        )}

        {/* Feature Cards */}
        <Text style={styles.sectionTitle}>Pathways</Text>

        {/* Needs Assessment */}
        <FeatureCard
          title="Am I OK?"
          subtitle="Check in with your 19 core human needs"
          icon={<Brain size={24} color={colors.brandBlue} />}
          accentColor={colors.brandBlue}
          stats={
            overview?.needsAssessment.baselineCompleted
              ? [
                  {
                    label: 'Overall',
                    value: overview.needsAssessment.overallScore?.toFixed(1) ?? '-',
                  },
                  {
                    label: 'Low needs',
                    value: String(overview.needsAssessment.lowNeedsCount),
                  },
                ]
              : undefined
          }
          onPress={() => onNavigateToNeedsAssessment?.()}
        />

        {/* Gratitude */}
        <FeatureCard
          title="See the Positive"
          subtitle="Practice gratitude and notice patterns"
          icon={<Heart size={24} color={colors.success} />}
          accentColor={colors.success}
          stats={
            overview?.gratitude
              ? [
                  { label: 'Entries', value: String(overview.gratitude.totalEntries) },
                  { label: 'Streak', value: `${overview.gratitude.streakDays}d` },
                ]
              : undefined
          }
          onPress={() => onNavigateToGratitude?.()}
        />

        {/* Meditation */}
        <FeatureCard
          title="Develop Loving Awareness"
          subtitle="Guided and unguided meditation practice"
          icon={<Sparkles size={24} color={colors.warning} />}
          accentColor={colors.warning}
          stats={
            overview?.meditation
              ? [
                  { label: 'Sessions', value: String(overview.meditation.totalSessions) },
                  { label: 'Minutes', value: String(overview.meditation.totalMinutes) },
                ]
              : undefined
          }
          onPress={() => onNavigateToMeditation?.()}
        />

        {/* Self-Reflection */}
        <FeatureCard
          title="Self-Reflection"
          subtitle="Private conversations to process your thoughts"
          icon={<MessageCircle size={24} color={colors.brandOrange} />}
          accentColor={colors.brandOrange}
          onPress={() => onNavigateToSelfReflection?.()}
        />

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  },
  errorSubtext: {
    marginTop: t.spacing.sm,
    fontSize: 14,
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
  headerRight: {
    width: 32,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: t.spacing.md,
  },

  // Insights Section
  insightsSection: {
    marginBottom: t.spacing.md,
  },
  insightCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
    borderLeftWidth: 4,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.spacing.sm,
  },
  insightIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightDismissButton: {
    padding: t.spacing.xs,
  },
  insightSummary: {
    fontSize: 14,
    color: t.colors.textPrimary,
    lineHeight: 20,
  },
  insightLearnMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: t.spacing.sm,
    paddingTop: t.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  insightLearnMoreText: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: t.spacing.xs,
  },

  // Wellness Card
  wellnessCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.lg,
    marginBottom: t.spacing.md,
    alignItems: 'center',
  },
  wellnessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
  },
  wellnessLabel: {
    fontSize: 11,
    color: t.colors.textSecondary,
    letterSpacing: 1,
  },
  wellnessScore: {
    fontSize: 48,
    fontWeight: '700',
    color: t.colors.textPrimary,
    marginVertical: t.spacing.xs,
  },
  wellnessSubtext: {
    fontSize: 12,
    color: t.colors.textMuted,
  },

  // Suggestion Card
  suggestionCard: {
    backgroundColor: t.colors.bgTertiary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: t.colors.accent,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.accent,
    marginBottom: t.spacing.xs,
  },
  suggestionDescription: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },

  // Section
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.md,
  },

  // Feature Card
  featureCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    borderLeftWidth: 4,
  },
  featureCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.spacing.sm,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.xs,
  },
  featureSubtitle: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  featureStats: {
    flexDirection: 'row',
    marginTop: t.spacing.md,
    paddingTop: t.spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    gap: t.spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },

  // Bottom
  bottomSpacer: {
    height: t.spacing.xl,
  },
}));

export default InnerWorkHubScreen;
