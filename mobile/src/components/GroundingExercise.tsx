/**
 * GroundingExercise Component
 *
 * A 5-4-3-2-1 grounding exercise that guides users through their senses
 * to return to the present moment. Based on the demo HTML implementation.
 *
 * Steps:
 * 1. 5 things you can SEE
 * 2. 4 things you can TOUCH
 * 3. 3 things you can HEAR
 * 4. 2 things you can SMELL
 * 5. 1 thing you can TASTE
 */

import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { IntensityCheck } from './IntensityCheck';

interface GroundingStep {
  number: number;
  sense: string;
  prompt: string;
}

const GROUNDING_STEPS: GroundingStep[] = [
  { number: 5, sense: 'See', prompt: 'Name 5 things you can see right now' },
  { number: 4, sense: 'Touch', prompt: 'Name 4 things you can touch or feel' },
  { number: 3, sense: 'Hear', prompt: 'Name 3 things you can hear' },
  { number: 2, sense: 'Smell', prompt: 'Name 2 things you can smell' },
  { number: 1, sense: 'Taste', prompt: 'Name 1 thing you can taste' },
];

export interface GroundingExerciseProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Intensity before starting the exercise */
  intensityBefore: number;
  /** Callback when exercise is completed */
  onComplete: (intensityAfter: number) => void;
  /** Callback when modal is closed without completing */
  onClose: () => void;
}

export function GroundingExercise({
  visible,
  intensityBefore,
  onComplete,
  onClose,
}: GroundingExerciseProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(-1); // -1 = not started
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [showIntensityCheck, setShowIntensityCheck] = useState(false);
  const [intensityAfter, setIntensityAfter] = useState(5);
  const inputRef = useRef<TextInput>(null);

  const isStarted = currentStepIndex >= 0;
  const isFinished = completedSteps.length === GROUNDING_STEPS.length;

  // Initialize intensity to current value when modal opens
  useEffect(() => {
    if (visible) {
      setIntensityAfter(intensityBefore);
    }
  }, [visible, intensityBefore]);

  const handleStart = useCallback(() => {
    setCurrentStepIndex(0);
  }, []);

  const handleNextStep = useCallback(() => {
    if (currentInput.trim().length === 0) return;

    // Dismiss keyboard first
    Keyboard.dismiss();

    setCompletedSteps((prev) => [...prev, currentStepIndex]);
    setCurrentInput('');

    if (currentStepIndex < GROUNDING_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      // Focus input for next step after a brief delay
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // All steps completed
      setShowIntensityCheck(true);
    }
  }, [currentStepIndex, currentInput]);

  const handleComplete = useCallback(() => {
    onComplete(intensityAfter);
    // Reset state for next time
    setCurrentStepIndex(-1);
    setCompletedSteps([]);
    setCurrentInput('');
    setShowIntensityCheck(false);
    setIntensityAfter(intensityBefore);
  }, [intensityAfter, intensityBefore, onComplete]);

  const handleClose = useCallback(() => {
    onClose();
    // Reset state
    setCurrentStepIndex(-1);
    setCompletedSteps([]);
    setCurrentInput('');
    setShowIntensityCheck(false);
    setIntensityAfter(intensityBefore);
  }, [intensityBefore, onClose]);

  const handleIntensityChange = useCallback((newValue: number) => {
    setIntensityAfter(newValue);
  }, []);

  const currentStep = currentStepIndex >= 0 ? GROUNDING_STEPS[currentStepIndex] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      testID="grounding-exercise-modal"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.fullScreen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
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
            <Text style={styles.title}>5-4-3-2-1 Grounding</Text>
            <Text style={styles.subtitle}>
              Connect with your senses to return to the present
            </Text>
          </View>

          {!showIntensityCheck ? (
            <ScrollView
              style={styles.stepsContainer}
              contentContainerStyle={styles.stepsContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Show completed steps */}
              {completedSteps.map((stepIdx) => {
                const step = GROUNDING_STEPS[stepIdx];
                return (
                  <View key={stepIdx} style={[styles.step, styles.stepCompleted]}>
                    <View style={styles.stepHeader}>
                      <View style={[styles.stepNumber, styles.stepNumberCompleted]}>
                        <Text style={styles.stepNumberText}>{step.number}</Text>
                      </View>
                      <Text style={styles.stepSense}>{step.sense}</Text>
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
                      <Text style={styles.stepNumberText}>{currentStep.number}</Text>
                    </View>
                    <Text style={styles.stepSense}>{currentStep.sense}</Text>
                  </View>
                  <Text style={styles.stepPrompt}>{currentStep.prompt}</Text>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={currentInput}
                    onChangeText={setCurrentInput}
                    placeholder="Type your answer here..."
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                    returnKeyType="done"
                    blurOnSubmit={false}
                    onSubmitEditing={() => {
                      if (currentInput.trim().length > 0) {
                        handleNextStep();
                      }
                    }}
                    testID="grounding-input"
                  />
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
                  style={[
                    styles.primaryButton,
                    currentInput.trim().length === 0 && styles.buttonDisabled,
                  ]}
                  onPress={handleNextStep}
                  disabled={currentInput.trim().length === 0}
                  testID="next-button"
                >
                  <Text style={styles.primaryButtonText}>
                    {currentStepIndex < GROUNDING_STEPS.length - 1 ? 'Next' : 'Complete'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : (
            <IntensityCheck
              value={intensityAfter}
              onChange={handleIntensityChange}
              onDone={handleComplete}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  keyboardAvoid: {
    flex: 1,
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
  stepSense: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepPrompt: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  input: {
    marginTop: 12,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
  },
});

export default GroundingExercise;
