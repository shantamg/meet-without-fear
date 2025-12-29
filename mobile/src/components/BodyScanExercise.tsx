/**
 * BodyScanExercise Component
 *
 * A guided body scan exercise that helps users notice physical sensations
 * without judgment. Based on the demo HTML implementation.
 *
 * Steps through body areas:
 * 1. Feet
 * 2. Legs
 * 3. Stomach
 * 4. Chest
 * 5. Shoulders
 * 6. Face
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';

interface BodyScanStep {
  area: string;
  prompt: string;
}

const BODY_SCAN_STEPS: BodyScanStep[] = [
  {
    area: 'Feet',
    prompt: 'Notice your feet. Are they warm or cool? Tense or relaxed? Just observe.',
  },
  {
    area: 'Legs',
    prompt: 'Move your attention to your legs. Notice any sensations in your calves and thighs.',
  },
  {
    area: 'Stomach',
    prompt: 'Bring awareness to your stomach. Notice if it feels tight, fluttery, or calm.',
  },
  {
    area: 'Chest',
    prompt: 'Focus on your chest. Notice your breath moving in and out. How does it feel?',
  },
  {
    area: 'Shoulders',
    prompt: 'Notice your shoulders. Are they raised or relaxed? Let them soften if you can.',
  },
  {
    area: 'Face',
    prompt: 'Finally, notice your face. Your jaw, your forehead. Let any tension melt away.',
  },
];

export interface BodyScanExerciseProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Intensity before starting the exercise */
  intensityBefore: number;
  /** Callback when exercise is completed */
  onComplete: (intensityAfter: number) => void;
  /** Callback when modal is closed without completing */
  onClose: () => void;
}

export function BodyScanExercise({
  visible,
  intensityBefore,
  onComplete,
  onClose,
}: BodyScanExerciseProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(-1); // -1 = not started
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showIntensityCheck, setShowIntensityCheck] = useState(false);
  const [intensityAfter, setIntensityAfter] = useState(5);

  const isStarted = currentStepIndex >= 0;

  const handleStart = useCallback(() => {
    setCurrentStepIndex(0);
  }, []);

  const handleNextStep = useCallback(() => {
    setCompletedSteps((prev) => [...prev, currentStepIndex]);

    if (currentStepIndex < BODY_SCAN_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // All steps completed
      setShowIntensityCheck(true);
    }
  }, [currentStepIndex]);

  const handleComplete = useCallback(() => {
    onComplete(intensityAfter);
    // Reset state for next time
    setCurrentStepIndex(-1);
    setCompletedSteps([]);
    setShowIntensityCheck(false);
    setIntensityAfter(5);
  }, [intensityAfter, onComplete]);

  const handleClose = useCallback(() => {
    onClose();
    // Reset state
    setCurrentStepIndex(-1);
    setCompletedSteps([]);
    setShowIntensityCheck(false);
    setIntensityAfter(5);
  }, [onClose]);

  const handleIntensityChange = useCallback((delta: number) => {
    setIntensityAfter((current) => Math.min(10, Math.max(1, current + delta)));
  }, []);

  const currentStep = currentStepIndex >= 0 ? BODY_SCAN_STEPS[currentStepIndex] : null;
  const isFinished = completedSteps.length === BODY_SCAN_STEPS.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      testID="body-scan-exercise-modal"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.fullScreen} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleClose}
            testID="back-button"
          >
            <Text style={styles.backButtonText}>← Back to chat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Body Scan</Text>
          <Text style={styles.subtitle}>
            Notice physical sensations without judgment
          </Text>
        </View>

        {!showIntensityCheck ? (
          <ScrollView
            style={styles.stepsContainer}
            contentContainerStyle={styles.stepsContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Show completed steps */}
            {completedSteps.map((stepIdx) => {
              const step = BODY_SCAN_STEPS[stepIdx];
              return (
                <View key={stepIdx} style={[styles.step, styles.stepCompleted]}>
                  <View style={styles.stepHeader}>
                    <View style={[styles.stepNumber, styles.stepNumberCompleted]}>
                      <Text style={styles.stepNumberText}>{stepIdx + 1}</Text>
                    </View>
                    <Text style={styles.stepArea}>{step.area}</Text>
                  </View>
                  <Text style={styles.stepPrompt}>{step.prompt}</Text>
                </View>
              );
            })}

            {/* Current step */}
            {currentStep && !isFinished && (
              <View style={[styles.step, styles.stepActive]}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{currentStepIndex + 1}</Text>
                  </View>
                  <Text style={styles.stepArea}>{currentStep.area}</Text>
                </View>
                <Text style={styles.stepPrompt}>{currentStep.prompt}</Text>
              </View>
            )}

            {/* Start/Next button */}
            {!isStarted ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleStart}
                testID="start-button"
              >
                <Text style={styles.primaryButtonText}>Start</Text>
              </TouchableOpacity>
            ) : !isFinished ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleNextStep}
                testID="next-button"
              >
                <Text style={styles.primaryButtonText}>
                  {currentStepIndex < BODY_SCAN_STEPS.length - 1 ? 'Next' : 'Complete'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : (
          /* Post-exercise intensity check */
          <View style={styles.intensityCheck}>
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
              style={styles.primaryButton}
              onPress={handleComplete}
              testID="done-button"
            >
              <Text style={styles.primaryButtonText}>Back to chat</Text>
            </TouchableOpacity>
          </View>
        )}
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
  titleContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stepsContainer: {
    flex: 1,
  },
  stepsContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  step: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  stepActive: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  stepCompleted: {
    opacity: 0.7,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberCompleted: {
    backgroundColor: colors.success,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  stepArea: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepPrompt: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  intensityCheck: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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

export default BodyScanExercise;
