import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '@/theme';

/**
 * Breathing phases for the 4-7-8 exercise
 */
type BreathingPhase = 'ready' | 'inhale' | 'hold' | 'exhale';

/**
 * 4-7-8 Breathing timing (in seconds)
 * - Inhale: 4 seconds
 * - Hold: 7 seconds
 * - Exhale: 8 seconds
 */
const PHASE_DURATIONS: Record<Exclude<BreathingPhase, 'ready'>, number> = {
  inhale: 4,
  hold: 7,
  exhale: 8,
};

/**
 * Phase instructions matching the demo
 */
const PHASE_INSTRUCTIONS: Record<Exclude<BreathingPhase, 'ready'>, string> = {
  inhale: 'Breathe in through your nose',
  hold: 'Hold your breath gently',
  exhale: 'Exhale slowly through your mouth',
};

/**
 * Phase display text for the circle
 */
const PHASE_DISPLAY_TEXT: Record<Exclude<BreathingPhase, 'ready'>, string> = {
  inhale: 'Breathe In',
  hold: 'Hold',
  exhale: 'Breathe Out',
};

/**
 * Props for BreathingExercise component
 */
export interface BreathingExerciseProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Intensity before starting the exercise */
  intensityBefore: number;
  /** Callback when exercise is completed */
  onComplete: (intensityAfter: number) => void;
  /** Callback when modal is closed without completing */
  onClose: () => void;
  /** Number of breathing cycles to complete */
  cycles?: number;
  /** Duration for each phase in milliseconds (only for testing, uses 4-7-8 by default) */
  phaseDuration?: number;
}

/**
 * Get the phase instruction text
 */
function getPhaseInstruction(phase: BreathingPhase): string {
  if (phase === 'ready') {
    return 'Tap to begin';
  }
  return PHASE_INSTRUCTIONS[phase];
}

/**
 * Get the display text for the circle
 */
function getPhaseDisplayText(phase: BreathingPhase): string {
  if (phase === 'ready') {
    return 'Ready';
  }
  return PHASE_DISPLAY_TEXT[phase];
}

/**
 * BreathingExercise - A 4-7-8 guided breathing exercise
 *
 * Displays an animated circle that expands and contracts with breathing phases.
 * Shows countdown timer for each phase matching the demo behavior.
 * Tracks cycles completed and allows capturing intensity after exercise.
 */
export function BreathingExercise({
  visible,
  intensityBefore,
  onComplete,
  onClose,
  cycles = 3,
  phaseDuration,
}: BreathingExerciseProps) {
  const [phase, setPhase] = useState<BreathingPhase>('ready');
  const [completedCycles, setCompletedCycles] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showIntensityCheck, setShowIntensityCheck] = useState(false);
  const [intensityAfter, setIntensityAfter] = useState(5);
  const [countdown, setCountdown] = useState<number | null>(null);

  const scale = useSharedValue(1);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get duration for current phase (in seconds)
  const getPhaseDuration = useCallback(
    (p: Exclude<BreathingPhase, 'ready'>): number => {
      // If phaseDuration prop is provided (for testing), convert to seconds
      if (phaseDuration) {
        return phaseDuration / 1000;
      }
      return PHASE_DURATIONS[p];
    },
    [phaseDuration]
  );

  // Cleanup timers
  const clearTimers = useCallback(() => {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setPhase('ready');
      setCompletedCycles(0);
      setIsRunning(false);
      setShowIntensityCheck(false);
      setIntensityAfter(5);
      setCountdown(null);
      scale.value = 1;
      clearTimers();
    }
  }, [visible, scale, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      cancelAnimation(scale);
    };
  }, [scale, clearTimers]);

  // Handle phase transitions
  const advancePhase = useCallback(() => {
    setPhase((currentPhase) => {
      if (currentPhase === 'ready') return 'inhale';
      if (currentPhase === 'inhale') return 'hold';
      if (currentPhase === 'hold') return 'exhale';
      // After exhale, increment cycle and check if done
      setCompletedCycles((c) => {
        const newCount = c + 1;
        if (newCount >= cycles) {
          setIsRunning(false);
          setShowIntensityCheck(true);
          return newCount;
        }
        return newCount;
      });
      return 'inhale';
    });
  }, [cycles]);

  // Run countdown and animate for each phase
  useEffect(() => {
    if (!isRunning || phase === 'ready') return;

    const duration = getPhaseDuration(phase);
    const durationMs = duration * 1000;

    // Start countdown
    setCountdown(duration);

    // Animate scale based on phase
    if (phase === 'inhale') {
      scale.value = withTiming(1.3, { duration: durationMs, easing: Easing.inOut(Easing.ease) });
    } else if (phase === 'hold') {
      // Keep scale at current value
    } else if (phase === 'exhale') {
      scale.value = withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) });
    }

    // Update countdown every second
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) return prev;
        return prev - 1;
      });
    }, 1000);

    // Schedule next phase
    phaseTimeoutRef.current = setTimeout(() => {
      clearTimers();
      if (completedCycles < cycles || phase !== 'exhale') {
        advancePhase();
      }
    }, durationMs);

    return () => {
      clearTimers();
    };
  }, [phase, isRunning, advancePhase, completedCycles, cycles, scale, getPhaseDuration, clearTimers]);

  const animatedCircleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleStart = useCallback(() => {
    setIsRunning(true);
    setPhase('inhale');
  }, []);

  const handleComplete = useCallback(() => {
    onComplete(intensityAfter);
  }, [onComplete, intensityAfter]);

  const handleIntensityChange = useCallback((delta: number) => {
    setIntensityAfter((current) => {
      const newValue = current + delta;
      return Math.min(10, Math.max(1, newValue));
    });
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} testID="breathing-modal">
      <SafeAreaView style={styles.fullScreen} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            testID="back-button"
          >
            <Text style={styles.backButtonText}>← Back to chat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>4-7-8 Breathing</Text>
          <Text style={styles.subtitle}>Follow the circle and breathe with the rhythm</Text>

          {!showIntensityCheck ? (
            <View style={styles.exerciseContent}>
              <Animated.View style={[styles.circle, animatedCircleStyle]}>
                <Text style={styles.phaseText}>{getPhaseDisplayText(phase)}</Text>
              </Animated.View>

              {/* Countdown timer */}
              <Text style={styles.timer} testID="countdown-timer">
                {countdown !== null ? countdown : '--'}
              </Text>

              <Text style={styles.instruction}>{getPhaseInstruction(phase)}</Text>

              <Text style={styles.count} testID="cycle-count">
                {completedCycles > 0 ? `Cycle ${completedCycles} of ${cycles}` : ''}
              </Text>

              {phase === 'ready' && (
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStart}
                  testID="start-button"
                >
                  <Text style={styles.startButtonText}>Start</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.intensityContent}>
              <Text style={styles.checkInLabel}>How are you feeling now?</Text>
              <Text style={styles.beforeLabel}>Before: {intensityBefore}</Text>

              <View style={styles.intensitySelector}>
                <TouchableOpacity
                  style={styles.intensityButton}
                  onPress={() => handleIntensityChange(-1)}
                  testID="decrease-intensity"
                >
                  <Text style={styles.intensityButtonText}>-</Text>
                </TouchableOpacity>

                <View style={styles.intensityValue}>
                  <Text style={styles.intensityValueText}>{intensityAfter}</Text>
                </View>

                <TouchableOpacity
                  style={styles.intensityButton}
                  onPress={() => handleIntensityChange(1)}
                  testID="increase-intensity"
                >
                  <Text style={styles.intensityButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.doneButton}
                onPress={handleComplete}
                testID="done-button"
              >
                <Text style={styles.doneButtonText}>Back to chat</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.skipButton} onPress={onClose} testID="skip-button">
            <Text style={styles.skip}>{showIntensityCheck ? 'Cancel' : 'Skip for now'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  exerciseContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intensityContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  circle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(16, 163, 127, 0.15)',
    borderWidth: 4,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  phaseText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.accent,
  },
  timer: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  instruction: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  count: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 24,
    minHeight: 20,
  },
  startButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 12,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 12,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 16,
    marginBottom: 24,
  },
  skip: {
    color: colors.textMuted,
    fontSize: 16,
  },
  checkInLabel: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.textPrimary,
  },
  beforeLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  intensitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  intensityButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intensityButtonText: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  intensityValue: {
    width: 100,
    alignItems: 'center',
  },
  intensityValueText: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});

export default BreathingExercise;
