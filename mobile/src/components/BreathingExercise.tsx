import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '@/theme';

/**
 * Breathing phases for the exercise
 */
type BreathingPhase = 'ready' | 'inhale' | 'hold' | 'exhale';

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
  /** Duration for each phase in milliseconds */
  phaseDuration?: number;
}

/**
 * Phase timing configuration
 */
const PHASE_INSTRUCTIONS: Record<Exclude<BreathingPhase, 'ready'>, string> = {
  inhale: 'Breathe in slowly...',
  hold: 'Hold...',
  exhale: 'Breathe out slowly...',
};

/**
 * Get the phase instruction text
 */
function getPhaseInstruction(phase: BreathingPhase): string {
  if (phase === 'ready') {
    return 'Get comfortable and press Start';
  }
  return PHASE_INSTRUCTIONS[phase];
}

/**
 * BreathingExercise - A modal component for guided breathing exercises
 *
 * Displays an animated circle that expands and contracts with breathing phases.
 * Tracks cycles completed and allows capturing intensity after exercise.
 */
export function BreathingExercise({
  visible,
  intensityBefore,
  onComplete,
  onClose,
  cycles = 3,
  phaseDuration = 4000,
}: BreathingExerciseProps) {
  const [phase, setPhase] = useState<BreathingPhase>('ready');
  const [completedCycles, setCompletedCycles] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showIntensityCheck, setShowIntensityCheck] = useState(false);
  const [intensityAfter, setIntensityAfter] = useState(5);

  const scale = useSharedValue(1);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setPhase('ready');
      setCompletedCycles(0);
      setIsRunning(false);
      setShowIntensityCheck(false);
      setIntensityAfter(5);
      scale.value = 1;
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }
    }
  }, [visible, scale]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }
      cancelAnimation(scale);
    };
  }, [scale]);

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

  // Animate scale based on phase
  useEffect(() => {
    if (!isRunning || phase === 'ready') return;

    if (phase === 'inhale') {
      scale.value = withTiming(1.3, { duration: phaseDuration, easing: Easing.inOut(Easing.ease) });
    } else if (phase === 'hold') {
      // Keep scale at current value
    } else if (phase === 'exhale') {
      scale.value = withTiming(1, { duration: phaseDuration, easing: Easing.inOut(Easing.ease) });
    }

    // Schedule next phase using phase-specific duration
    const currentPhaseDuration = phaseDuration;
    phaseTimeoutRef.current = setTimeout(() => {
      if (completedCycles < cycles) {
        advancePhase();
      }
    }, currentPhaseDuration);

    return () => {
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }
    };
  }, [phase, isRunning, advancePhase, completedCycles, cycles, scale]);

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
    <Modal visible={visible} animationType="fade" transparent testID="breathing-modal">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Breathing Exercise</Text>

          {!showIntensityCheck ? (
            <>
              <Animated.View style={[styles.circle, animatedCircleStyle]}>
                <Text style={styles.phaseText}>{phase === 'ready' ? 'Ready' : phase}</Text>
              </Animated.View>

              <Text style={styles.instruction}>{getPhaseInstruction(phase)}</Text>

              <Text style={styles.count}>
                {completedCycles}/{cycles} cycles
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
            </>
          ) : (
            <>
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
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={onClose} testID="skip-button">
            <Text style={styles.skip}>{showIntensityCheck ? 'Cancel' : 'Skip for now'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    color: colors.textPrimary,
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 163, 127, 0.2)',
    borderWidth: 3,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  phaseText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  instruction: {
    fontSize: 18,
    marginBottom: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  count: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 48,
    borderRadius: 8,
    marginBottom: 16,
  },
  startButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 48,
    borderRadius: 8,
    marginBottom: 16,
  },
  doneButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  skip: {
    color: colors.textMuted,
    fontSize: 14,
  },
  checkInLabel: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
    color: colors.textPrimary,
  },
  beforeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  intensitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  intensityButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intensityButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  intensityValue: {
    width: 80,
    alignItems: 'center',
  },
  intensityValueText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});

export default BreathingExercise;
