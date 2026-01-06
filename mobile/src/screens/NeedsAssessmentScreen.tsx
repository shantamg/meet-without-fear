/**
 * NeedsAssessmentScreen Component
 *
 * "Am I OK?" - Needs assessment feature for tracking 19 core human needs.
 * Shows baseline assessment flow for new users, or check-in view for returning users.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Brain,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

import {
  useNeedsReference,
  useNeedsState,
  useSubmitBaseline,
  useCheckInNeed,
  groupNeedsByCategory,
  getLowNeeds,
  calculateOverallScore,
  useSpeech,
} from '../hooks';
import { NeedWithScoreDTO } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface NeedsAssessmentScreenProps {
  onNavigateBack?: () => void;
}

type AssessmentMode = 'overview' | 'baseline' | 'checkin';

// ============================================================================
// Score Selection Component
// ============================================================================

interface ScoreSelectorProps {
  value: number | null;
  onChange: (score: number) => void;
}

function ScoreSelector({ value, onChange }: ScoreSelectorProps) {
  const scoreOptions = [
    { value: 0, label: 'Not at all', color: colors.error },
    { value: 1, label: 'Somewhat', color: colors.warning },
    { value: 2, label: 'Fully met', color: colors.success },
  ];

  return (
    <View style={styles.scoreSelector}>
      {scoreOptions.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.scoreOption,
            value === option.value && { backgroundColor: option.color + '30', borderColor: option.color },
          ]}
          onPress={() => onChange(option.value)}
        >
          <Text
            style={[
              styles.scoreOptionText,
              value === option.value && { color: option.color },
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ============================================================================
// Need Card Component
// ============================================================================

interface NeedCardProps {
  need: NeedWithScoreDTO;
  showScore?: boolean;
  onCheckIn?: (needId: number) => void;
}

function NeedCard({ need, showScore = true, onCheckIn }: NeedCardProps) {
  const scoreColor = need.currentScore === 2 ? colors.success
    : need.currentScore === 1 ? colors.warning
    : need.currentScore === 0 ? colors.error
    : colors.textMuted;

  const ScoreIcon = need.currentScore === 2 ? TrendingUp
    : need.currentScore === 0 ? TrendingDown
    : Minus;

  return (
    <TouchableOpacity
      style={styles.needCard}
      onPress={() => onCheckIn?.(need.id)}
      activeOpacity={onCheckIn ? 0.7 : 1}
    >
      <View style={styles.needCardContent}>
        <Text style={styles.needName}>{need.name}</Text>
        <Text style={styles.needDescription}>{need.description}</Text>
      </View>
      {showScore && need.currentScore !== null && (
        <View style={[styles.needScoreBadge, { backgroundColor: scoreColor + '20' }]}>
          <ScoreIcon size={16} color={scoreColor} />
        </View>
      )}
      {onCheckIn && (
        <ChevronRight size={20} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NeedsAssessmentScreen({
  onNavigateBack,
}: NeedsAssessmentScreenProps) {
  const { data: referenceData, isLoading: loadingRef } = useNeedsReference();
  const { data: stateData, isLoading: loadingState, refetch } = useNeedsState();
  const submitBaseline = useSubmitBaseline();
  const checkInNeed = useCheckInNeed();

  // Speech for reading need descriptions
  const { isSpeaking, currentId, toggle: toggleSpeech, stop: stopSpeech } = useSpeech();

  const [mode, setMode] = useState<AssessmentMode>('overview');
  const [baselineScores, setBaselineScores] = useState<Record<number, number>>({});
  const [currentNeedIndex, setCurrentNeedIndex] = useState(0);
  const [selectedNeedForCheckIn, setSelectedNeedForCheckIn] = useState<NeedWithScoreDTO | null>(null);
  const [checkInScore, setCheckInScore] = useState<number | null>(null);

  const needs = referenceData?.needs ?? [];
  const state = stateData?.state;
  const currentScores = stateData?.currentScores ?? [];
  const hasBaseline = state?.baselineCompleted ?? false;

  // Group needs by category
  const groupedNeeds = useMemo(() => {
    if (!currentScores.length) return {};
    return groupNeedsByCategory(currentScores);
  }, [currentScores]);

  const lowNeeds = useMemo(() => {
    if (!currentScores.length) return [];
    return getLowNeeds(currentScores);
  }, [currentScores]);

  const overallScore = useMemo(() => {
    if (!currentScores.length) return null;
    return calculateOverallScore(currentScores);
  }, [currentScores]);

  const handleBack = useCallback(() => {
    stopSpeech(); // Stop any ongoing speech
    if (mode === 'baseline' || mode === 'checkin') {
      setMode('overview');
      setSelectedNeedForCheckIn(null);
      setCheckInScore(null);
    } else {
      onNavigateBack?.();
    }
  }, [mode, onNavigateBack, stopSpeech]);

  const handleStartBaseline = useCallback(() => {
    setCurrentNeedIndex(0);
    setBaselineScores({});
    setMode('baseline');
  }, []);

  const handleBaselineNext = useCallback(() => {
    if (currentNeedIndex < needs.length - 1) {
      setCurrentNeedIndex(currentNeedIndex + 1);
    } else {
      // Submit baseline
      const scores = needs.map((n) => ({
        needId: n.id,
        score: baselineScores[n.id] ?? 1,
      }));
      submitBaseline.mutate({ scores }, {
        onSuccess: () => {
          setMode('overview');
          refetch();
        },
      });
    }
  }, [currentNeedIndex, needs, baselineScores, submitBaseline, refetch]);

  const handleBaselineScoreChange = useCallback((score: number) => {
    const currentNeed = needs[currentNeedIndex];
    if (currentNeed) {
      setBaselineScores((prev) => ({ ...prev, [currentNeed.id]: score }));
    }
  }, [needs, currentNeedIndex]);

  const handleStartCheckIn = useCallback((needId: number) => {
    const need = currentScores.find((n) => n.id === needId);
    if (need) {
      setSelectedNeedForCheckIn(need);
      setCheckInScore(need.currentScore);
      setMode('checkin');
    }
  }, [currentScores]);

  const handleSubmitCheckIn = useCallback(() => {
    if (selectedNeedForCheckIn && checkInScore !== null) {
      checkInNeed.mutate(
        { needId: selectedNeedForCheckIn.id, data: { score: checkInScore } },
        {
          onSuccess: () => {
            setMode('overview');
            setSelectedNeedForCheckIn(null);
            setCheckInScore(null);
            refetch();
          },
        }
      );
    }
  }, [selectedNeedForCheckIn, checkInScore, checkInNeed, refetch]);

  // Loading state
  if (loadingRef || loadingState) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading needs...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Baseline Assessment Flow
  if (mode === 'baseline') {
    const currentNeed = needs[currentNeedIndex];
    const progress = ((currentNeedIndex + 1) / needs.length) * 100;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Baseline Assessment</Text>
          <Text style={styles.headerProgress}>{currentNeedIndex + 1}/{needs.length}</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.baselineContent}>
          <View style={styles.baselineCard}>
            <View style={styles.baselineHeaderRow}>
              <Text style={styles.baselineCategory}>{currentNeed?.category}</Text>
              {currentNeed && (
                <TouchableOpacity
                  style={styles.speechIconButton}
                  onPress={() => toggleSpeech(
                    `${currentNeed.name}. ${currentNeed.description}`,
                    `need-${currentNeed.id}`
                  )}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {isSpeaking && currentId === `need-${currentNeed.id}` ? (
                    <VolumeX size={20} color={colors.accent} />
                  ) : (
                    <Volume2 size={20} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.baselineNeedName}>{currentNeed?.name}</Text>
            <Text style={styles.baselineDescription}>{currentNeed?.description}</Text>

            <Text style={styles.baselineQuestion}>
              How well is this need being met right now?
            </Text>

            <ScoreSelector
              value={currentNeed ? baselineScores[currentNeed.id] ?? null : null}
              onChange={handleBaselineScoreChange}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              baselineScores[currentNeed?.id ?? 0] === undefined && styles.primaryButtonDisabled,
            ]}
            onPress={handleBaselineNext}
            disabled={baselineScores[currentNeed?.id ?? 0] === undefined || submitBaseline.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {submitBaseline.isPending ? 'Saving...' : currentNeedIndex === needs.length - 1 ? 'Complete' : 'Next'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Check-in Flow
  if (mode === 'checkin' && selectedNeedForCheckIn) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Check In</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.baselineContent}>
          <View style={styles.baselineCard}>
            <Text style={styles.baselineCategory}>{selectedNeedForCheckIn.category}</Text>
            <Text style={styles.baselineNeedName}>{selectedNeedForCheckIn.name}</Text>
            <Text style={styles.baselineDescription}>{selectedNeedForCheckIn.description}</Text>

            <Text style={styles.baselineQuestion}>
              How well is this need being met right now?
            </Text>

            <ScoreSelector
              value={checkInScore}
              onChange={setCheckInScore}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              checkInScore === null && styles.primaryButtonDisabled,
            ]}
            onPress={handleSubmitCheckIn}
            disabled={checkInScore === null || checkInNeed.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {checkInNeed.isPending ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Overview Mode
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Am I OK?</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.backButton}>
          <RefreshCw size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro for new users */}
        {!hasBaseline && (
          <View style={styles.introCard}>
            <Brain size={48} color={colors.brandBlue} />
            <Text style={styles.introTitle}>Check in with your needs</Text>
            <Text style={styles.introDescription}>
              Based on Nonviolent Communication, we all share 19 core human needs.
              Understanding which of your needs are met or unmet can help you
              communicate more effectively and find greater peace.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleStartBaseline}>
              <Text style={styles.primaryButtonText}>Start Assessment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overview for returning users */}
        {hasBaseline && (
          <>
            {/* Score Summary */}
            {overallScore !== null && (
              <View style={styles.scoreSummary}>
                <Text style={styles.scoreSummaryLabel}>OVERALL</Text>
                <Text style={styles.scoreSummaryValue}>{overallScore.toFixed(1)}</Text>
                <Text style={styles.scoreSummaryScale}>out of 2.0</Text>
              </View>
            )}

            {/* Low Needs Alert */}
            {lowNeeds.length > 0 && (
              <View style={styles.alertCard}>
                <Text style={styles.alertTitle}>
                  {lowNeeds.length} need{lowNeeds.length > 1 ? 's' : ''} need{lowNeeds.length > 1 ? '' : 's'} attention
                </Text>
                <Text style={styles.alertDescription}>
                  Tap any need below to check in and update its status.
                </Text>
              </View>
            )}

            {/* Needs by Category */}
            {Object.entries(groupedNeeds).map(([category, categoryNeeds]) => (
              <View key={category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{category}</Text>
                {categoryNeeds.map((need) => (
                  <NeedCard
                    key={need.id}
                    need={need}
                    onCheckIn={handleStartCheckIn}
                  />
                ))}
              </View>
            ))}

            {/* Retake Baseline */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleStartBaseline}
            >
              <Text style={styles.secondaryButtonText}>Retake Full Assessment</Text>
            </TouchableOpacity>
          </>
        )}

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
  headerProgress: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },

  // Progress Bar
  progressBar: {
    height: 4,
    backgroundColor: t.colors.bgTertiary,
  },
  progressFill: {
    height: '100%',
    backgroundColor: t.colors.accent,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: t.spacing.md,
  },
  baselineContent: {
    padding: t.spacing.lg,
  },

  // Intro Card
  introCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.xl,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginTop: t.spacing.lg,
    marginBottom: t.spacing.md,
  },
  introDescription: {
    fontSize: 14,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: t.spacing.lg,
  },

  // Baseline Card
  baselineCard: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.lg,
    marginBottom: t.spacing.lg,
  },
  baselineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.spacing.sm,
  },
  baselineCategory: {
    fontSize: 12,
    color: t.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  speechIconButton: {
    padding: t.spacing.xs,
  },
  baselineNeedName: {
    fontSize: 22,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.sm,
  },
  baselineDescription: {
    fontSize: 15,
    color: t.colors.textSecondary,
    lineHeight: 22,
    marginBottom: t.spacing.lg,
  },
  baselineQuestion: {
    fontSize: 16,
    fontWeight: '500',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.md,
  },

  // Score Selector
  scoreSelector: {
    flexDirection: 'row',
    gap: t.spacing.sm,
  },
  scoreOption: {
    flex: 1,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.md,
    borderWidth: 2,
    borderColor: t.colors.border,
    alignItems: 'center',
  },
  scoreOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: t.colors.textSecondary,
  },

  // Buttons
  primaryButton: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: t.colors.bgTertiary,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textOnAccent,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    alignItems: 'center',
    marginTop: t.spacing.md,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },

  // Score Summary
  scoreSummary: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.lg,
    alignItems: 'center',
    marginBottom: t.spacing.md,
  },
  scoreSummaryLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    letterSpacing: 1,
  },
  scoreSummaryValue: {
    fontSize: 48,
    fontWeight: '700',
    color: t.colors.textPrimary,
  },
  scoreSummaryScale: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },

  // Alert Card
  alertCard: {
    backgroundColor: t.colors.error + '15',
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: t.colors.error,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: t.colors.error,
    marginBottom: t.spacing.xs,
  },
  alertDescription: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },

  // Category Section
  categorySection: {
    marginBottom: t.spacing.lg,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: t.spacing.sm,
  },

  // Need Card
  needCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  needCardContent: {
    flex: 1,
  },
  needName: {
    fontSize: 15,
    fontWeight: '500',
    color: t.colors.textPrimary,
    marginBottom: 2,
  },
  needDescription: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  needScoreBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: t.spacing.sm,
  },

  // Bottom
  bottomSpacer: {
    height: t.spacing.xl,
  },
}));

export default NeedsAssessmentScreen;
