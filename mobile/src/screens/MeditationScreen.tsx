/**
 * MeditationScreen Component
 *
 * "Develop Loving Awareness" - Meditation feature with guided and unguided
 * meditation sessions, AI-generated scripts, and progress tracking.
 */

import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Sparkles,
  Play,
  Clock,
  Target,
  TrendingUp,
  Pause,
  RotateCcw,
  ChevronRight,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

import {
  useMeditationStats,
  useMeditationSessions,
  useCreateMeditationSession,
  useUpdateMeditationSession,
  useGenerateMeditationScript,
  getDurationOptions,
  getFocusAreaSuggestions,
  formatDuration,
  formatTotalTime,
  useSpeech,
  useAutoSpeech,
} from '../hooks';
import { MeditationType } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface MeditationScreenProps {
  onNavigateBack?: () => void;
}

type ScreenMode = 'home' | 'setup' | 'active' | 'complete';

// ============================================================================
// Duration Selector Component
// ============================================================================

interface DurationSelectorProps {
  value: number;
  onChange: (duration: number) => void;
}

function DurationSelector({ value, onChange }: DurationSelectorProps) {
  const options = getDurationOptions();

  return (
    <View style={styles.durationSelector}>
      {options.slice(0, 5).map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.durationOption,
            value === option.value && styles.durationOptionSelected,
          ]}
          onPress={() => onChange(option.value)}
        >
          <Text
            style={[
              styles.durationOptionText,
              value === option.value && styles.durationOptionTextSelected,
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
// Focus Area Selector Component
// ============================================================================

interface FocusSelectorProps {
  value?: string;
  onChange: (focus?: string) => void;
}

function FocusSelector({ value, onChange }: FocusSelectorProps) {
  const suggestions = getFocusAreaSuggestions();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.focusScroll}
    >
      {suggestions.map((focus) => (
        <TouchableOpacity
          key={focus}
          style={[
            styles.focusChip,
            value === focus && styles.focusChipSelected,
          ]}
          onPress={() => onChange(value === focus ? undefined : focus)}
        >
          <Text
            style={[
              styles.focusChipText,
              value === focus && styles.focusChipTextSelected,
            ]}
          >
            {focus}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ============================================================================
// Timer Component
// ============================================================================

interface TimerProps {
  seconds: number;
  totalSeconds: number;
}

function Timer({ seconds, totalSeconds }: TimerProps) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = (seconds / totalSeconds) * 100;

  return (
    <View style={styles.timerContainer}>
      <View style={styles.timerCircle}>
        <View style={[styles.timerProgress, { height: `${100 - progress}%` }]} />
        <Text style={styles.timerText}>
          {minutes}:{secs.toString().padStart(2, '0')}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MeditationScreen({ onNavigateBack }: MeditationScreenProps) {
  const [mode, setMode] = useState<ScreenMode>('home');
  const [selectedType, setSelectedType] = useState<MeditationType>(MeditationType.UNGUIDED);
  const [duration, setDuration] = useState(10);
  const [focusArea, setFocusArea] = useState<string | undefined>();
  const [generatedScript, setGeneratedScript] = useState<string | undefined>();
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Speech for guided meditation
  const { isSpeaking, playMeditationScript, stop: stopSpeech } = useSpeech();
  const { isAutoSpeechEnabled } = useAutoSpeech();

  const { data: statsData, isLoading: loadingStats } = useMeditationStats();
  const { data: sessionsData } = useMeditationSessions({ limit: 5 });
  const createSession = useCreateMeditationSession();
  const updateSession = useUpdateMeditationSession();
  const generateScript = useGenerateMeditationScript();

  const stats = statsData?.stats;
  const recentSessions = sessionsData?.sessions ?? [];

  const handleBack = useCallback(() => {
    if (mode === 'setup' || mode === 'complete') {
      setMode('home');
      setGeneratedScript(undefined);
    } else if (mode === 'active') {
      // Confirm exit during active session
      if (timerInterval) clearInterval(timerInterval);
      stopSpeech(); // Stop any ongoing speech
      setMode('home');
      setTimerSeconds(0);
    } else {
      onNavigateBack?.();
    }
  }, [mode, timerInterval, onNavigateBack, stopSpeech]);

  const handleStartSetup = useCallback((type: MeditationType) => {
    setSelectedType(type);
    setMode('setup');
  }, []);

  const handleGenerateScript = useCallback(() => {
    if (!focusArea) return;
    generateScript.mutate(
      {
        focusArea,
        durationMinutes: duration,
      },
      {
        onSuccess: (data) => {
          setGeneratedScript(data.script);
        },
      }
    );
  }, [generateScript, duration, focusArea]);

  const handleStartSession = useCallback(() => {
    createSession.mutate(
      {
        type: selectedType,
        durationMinutes: duration,
        focusArea,
      },
      {
        onSuccess: (data) => {
          setCurrentSessionId(data.session.id);
          setTimerSeconds(duration * 60);
          setMode('active');

          // Auto-start speech for guided meditation if auto-speech is enabled
          if (selectedType === MeditationType.GUIDED && generatedScript && isAutoSpeechEnabled) {
            // Play meditation script with pauses and slow speech
            playMeditationScript(generatedScript, 'meditation-script');
          }

          // Start countdown
          const interval = setInterval(() => {
            setTimerSeconds((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                setMode('complete');
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          setTimerInterval(interval);
        },
      }
    );
  }, [createSession, selectedType, duration, focusArea, generatedScript, isAutoSpeechEnabled, playMeditationScript]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      // Resume
      const interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setMode('complete');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setTimerInterval(interval);
      setIsPaused(false);
    } else {
      // Pause
      if (timerInterval) clearInterval(timerInterval);
      setIsPaused(true);
    }
  }, [isPaused, timerInterval]);

  const handleCompleteSession = useCallback(
    (_rating?: number) => {
      stopSpeech(); // Stop any ongoing speech
      if (currentSessionId) {
        updateSession.mutate({
          id: currentSessionId,
          data: {
            completed: true,
          },
        });
      }
      setMode('home');
      setCurrentSessionId(undefined);
      setTimerSeconds(0);
      setGeneratedScript(undefined);
    },
    [currentSessionId, updateSession, stopSpeech]
  );

  // Handle speaking the meditation script
  // Uses playMeditationScript which handles pauses and slow speech
  const handleToggleSpeech = useCallback(() => {
    if (generatedScript) {
      if (isSpeaking) {
        stopSpeech();
      } else {
        playMeditationScript(generatedScript, 'meditation-script');
      }
    }
  }, [generatedScript, isSpeaking, playMeditationScript, stopSpeech]);

  // Loading state
  if (loadingStats) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading meditation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Active Session View
  if (mode === 'active') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectedType === MeditationType.GUIDED ? 'Guided' : 'Unguided'} Meditation
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.activeContainer}>
          <Timer seconds={timerSeconds} totalSeconds={duration * 60} />

          {focusArea && (
            <Text style={styles.activeFocus}>{focusArea}</Text>
          )}

          {generatedScript && (
            <>
              <ScrollView style={styles.scriptScroll}>
                <Text style={styles.scriptText}>{generatedScript}</Text>
              </ScrollView>
              {/* Speech control for guided meditation */}
              <TouchableOpacity
                style={styles.speechButton}
                onPress={handleToggleSpeech}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX size={20} color={colors.accent} />
                    <Text style={styles.speechButtonText}>Stop Reading</Text>
                  </>
                ) : (
                  <>
                    <Volume2 size={20} color={colors.accent} />
                    <Text style={styles.speechButtonText}>Read Aloud</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={styles.activeControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handlePauseResume}
            >
              {isPaused ? (
                <Play size={32} color={colors.textPrimary} />
              ) : (
                <Pause size={32} color={colors.textPrimary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endButton}
              onPress={() => handleCompleteSession()}
            >
              <Text style={styles.endButtonText}>End Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Complete View
  if (mode === 'complete') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.completeContainer}>
          <Sparkles size={64} color={colors.warning} />
          <Text style={styles.completeTitle}>Session Complete</Text>
          <Text style={styles.completeSubtitle}>
            Great job taking time for mindfulness!
          </Text>

          <Text style={styles.ratingLabel}>How was your session?</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                style={styles.ratingButton}
                onPress={() => handleCompleteSession(rating)}
              >
                <Text style={styles.ratingButtonText}>{rating}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => handleCompleteSession()}
          >
            <Text style={styles.skipButtonText}>Skip Rating</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Setup View
  if (mode === 'setup') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectedType === MeditationType.GUIDED ? 'Guided' : 'Unguided'} Session
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.setupContent}>
          <Text style={styles.setupLabel}>Duration</Text>
          <DurationSelector value={duration} onChange={setDuration} />

          <Text style={styles.setupLabel}>Focus Area (optional)</Text>
          <FocusSelector value={focusArea} onChange={setFocusArea} />

          {selectedType === MeditationType.GUIDED && (
            <>
              {!generatedScript ? (
                <TouchableOpacity
                  style={styles.generateButton}
                  onPress={handleGenerateScript}
                  disabled={generateScript.isPending}
                >
                  <Sparkles size={20} color={colors.accent} />
                  <Text style={styles.generateButtonText}>
                    {generateScript.isPending ? 'Generating...' : 'Generate Script'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.scriptPreview}>
                  <Text style={styles.scriptPreviewLabel}>Preview</Text>
                  <Text style={styles.scriptPreviewText} numberOfLines={4}>
                    {generatedScript}
                  </Text>
                  <TouchableOpacity onPress={handleGenerateScript}>
                    <Text style={styles.regenerateText}>
                      <RotateCcw size={14} color={colors.accent} /> Regenerate
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[
              styles.startButton,
              (selectedType === MeditationType.GUIDED && !generatedScript) && styles.startButtonDisabled,
            ]}
            onPress={handleStartSession}
            disabled={
              createSession.isPending ||
              (selectedType === MeditationType.GUIDED && !generatedScript)
            }
          >
            <Play size={24} color={colors.textOnAccent} />
            <Text style={styles.startButtonText}>
              {createSession.isPending ? 'Starting...' : 'Begin Meditation'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Home View
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Develop Loving Awareness</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Clock size={24} color={colors.brandBlue} />
              <Text style={styles.statValue}>
                {formatTotalTime(stats.totalMinutes)}
              </Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </View>
            <View style={styles.statCard}>
              <Target size={24} color={colors.success} />
              <Text style={styles.statValue}>{stats.totalSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={24} color={colors.warning} />
              <Text style={styles.statValue}>{stats.currentStreak}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
          </View>
        )}

        {/* Session Types */}
        <Text style={styles.sectionTitle}>Start a Session</Text>

        <TouchableOpacity
          style={styles.typeCard}
          onPress={() => handleStartSetup(MeditationType.UNGUIDED)}
        >
          <View style={styles.typeCardContent}>
            <View style={[styles.typeIcon, { backgroundColor: colors.brandBlue + '20' }]}>
              <Clock size={28} color={colors.brandBlue} />
            </View>
            <View style={styles.typeInfo}>
              <Text style={styles.typeName}>Unguided</Text>
              <Text style={styles.typeDescription}>
                Simple timer for your own practice
              </Text>
            </View>
          </View>
          <ChevronRight size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.typeCard}
          onPress={() => handleStartSetup(MeditationType.GUIDED)}
        >
          <View style={styles.typeCardContent}>
            <View style={[styles.typeIcon, { backgroundColor: colors.warning + '20' }]}>
              <Sparkles size={28} color={colors.warning} />
            </View>
            <View style={styles.typeInfo}>
              <Text style={styles.typeName}>Guided</Text>
              <Text style={styles.typeDescription}>
                AI-generated meditation script
              </Text>
            </View>
          </View>
          <ChevronRight size={24} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            {recentSessions.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionType}>
                    {session.type === MeditationType.GUIDED ? 'Guided' : 'Unguided'}
                  </Text>
                  <Text style={styles.sessionDetails}>
                    {formatDuration(session.durationMinutes)}
                    {session.focusArea && ` • ${session.focusArea}`}
                  </Text>
                </View>
                <Text style={styles.sessionDate}>
                  {new Date(session.startedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            ))}
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

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: t.spacing.md,
  },
  setupContent: {
    padding: t.spacing.lg,
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
    fontSize: 18,
    fontWeight: '700',
    color: t.colors.textPrimary,
    marginTop: t.spacing.sm,
  },
  statLabel: {
    fontSize: 10,
    color: t.colors.textMuted,
    marginTop: 2,
  },

  // Section
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.md,
    marginTop: t.spacing.sm,
  },

  // Type Cards
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  typeCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: t.spacing.md,
  },
  typeInfo: {
    flex: 1,
  },
  typeName: {
    fontSize: 17,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: 2,
  },
  typeDescription: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },

  // Session Card
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    fontSize: 14,
    fontWeight: '500',
    color: t.colors.textPrimary,
  },
  sessionDetails: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  sessionDate: {
    fontSize: 12,
    color: t.colors.textMuted,
  },

  // Setup
  setupLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: t.spacing.sm,
    marginTop: t.spacing.lg,
  },

  // Duration Selector
  durationSelector: {
    flexDirection: 'row',
    gap: t.spacing.sm,
  },
  durationOption: {
    flex: 1,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.md,
    borderWidth: 2,
    borderColor: t.colors.border,
    alignItems: 'center',
  },
  durationOptionSelected: {
    borderColor: t.colors.accent,
    backgroundColor: t.colors.accent + '20',
  },
  durationOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: t.colors.textSecondary,
  },
  durationOptionTextSelected: {
    color: t.colors.accent,
  },

  // Focus Selector
  focusScroll: {
    marginBottom: t.spacing.md,
  },
  focusChip: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    marginRight: t.spacing.sm,
  },
  focusChipSelected: {
    borderColor: t.colors.accent,
    backgroundColor: t.colors.accent + '20',
  },
  focusChipText: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  focusChipTextSelected: {
    color: t.colors.accent,
  },

  // Generate Button
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    marginTop: t.spacing.lg,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: t.colors.accent,
  },

  // Script Preview
  scriptPreview: {
    backgroundColor: t.colors.bgSecondary,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginTop: t.spacing.lg,
  },
  scriptPreviewLabel: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  scriptPreviewText: {
    fontSize: 14,
    color: t.colors.textSecondary,
    lineHeight: 22,
  },
  regenerateText: {
    fontSize: 14,
    color: t.colors.accent,
    marginTop: t.spacing.sm,
  },

  // Start Button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.md,
    marginTop: t.spacing['2xl'],
  },
  startButtonDisabled: {
    backgroundColor: t.colors.bgTertiary,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: t.colors.textOnAccent,
  },

  // Active Session
  activeContainer: {
    flex: 1,
    padding: t.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerContainer: {
    marginBottom: t.spacing.xl,
  },
  timerCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: t.colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timerProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.colors.accent + '30',
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: t.colors.textPrimary,
  },
  activeFocus: {
    fontSize: 18,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.lg,
  },
  scriptScroll: {
    maxHeight: 150,
    marginBottom: t.spacing.lg,
  },
  scriptText: {
    fontSize: 16,
    color: t.colors.textSecondary,
    lineHeight: 26,
    textAlign: 'center',
  },
  activeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.lg,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endButton: {
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
    backgroundColor: t.colors.bgTertiary,
    borderRadius: t.radius.md,
  },
  endButtonText: {
    fontSize: 16,
    color: t.colors.textSecondary,
  },

  // Complete Screen
  completeContainer: {
    flex: 1,
    padding: t.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: t.colors.textPrimary,
    marginTop: t.spacing.lg,
  },
  completeSubtitle: {
    fontSize: 16,
    color: t.colors.textSecondary,
    marginTop: t.spacing.sm,
    marginBottom: t.spacing['2xl'],
  },
  ratingLabel: {
    fontSize: 16,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    marginBottom: t.spacing.lg,
  },
  ratingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  skipButton: {
    padding: t.spacing.md,
  },
  skipButtonText: {
    fontSize: 14,
    color: t.colors.textMuted,
  },

  // Bottom
  bottomSpacer: {
    height: t.spacing.xl,
  },

  // Speech button
  speechButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.accent,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    marginTop: t.spacing.md,
  },
  speechButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: t.colors.accent,
  },
}));

export default MeditationScreen;
