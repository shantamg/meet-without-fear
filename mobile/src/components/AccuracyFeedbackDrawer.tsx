/**
 * AccuracyFeedbackDrawer Component
 *
 * A drawer that displays the partner's empathy statement and allows
 * the user to provide feedback on its accuracy. Follows the same
 * pattern as ViewEmpathyStatementDrawer for consistency.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, Minus, XCircle, ChevronLeft } from 'lucide-react-native';
import { colors } from '@/theme';

export interface AccuracyFeedbackDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The partner's empathy statement */
  statement: string;
  /** Partner's name */
  partnerName: string;
  /** Callback when "Accurate" is tapped */
  onAccurate: () => void;
  /** Callback when "Partially accurate" is tapped */
  onPartiallyAccurate: () => void;
  /** Callback when "Not quite" is tapped */
  onInaccurate: (feedback: string) => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

export function AccuracyFeedbackDrawer({
  visible,
  statement,
  partnerName,
  onAccurate,
  onPartiallyAccurate,
  onInaccurate,
  onClose,
}: AccuracyFeedbackDrawerProps) {
  const [isFeedbackStep, setIsFeedbackStep] = useState(false);
  const [roughFeedback, setRoughFeedback] = useState('');
  const [showFeedbackError, setShowFeedbackError] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsFeedbackStep(false);
      setRoughFeedback('');
      setShowFeedbackError(false);
    }
  }, [visible]);

  const handleAccurate = () => {
    onAccurate();
    onClose();
  };

  const handlePartiallyAccurate = () => {
    onPartiallyAccurate();
    onClose();
  };

  const handleInaccurate = () => {
    setIsFeedbackStep(true);
  };

  const handleSubmitFeedback = () => {
    const trimmedFeedback = roughFeedback.trim();
    if (!trimmedFeedback) {
      setShowFeedbackError(true);
      return;
    }

    onInaccurate(trimmedFeedback);
    onClose();
  };

  const handleBackToOptions = () => {
    setIsFeedbackStep(false);
    setShowFeedbackError(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="accuracy-feedback-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {/* Header with close button */}
          <View style={styles.header}>
            {isFeedbackStep && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackToOptions}
                testID="accuracy-feedback-back"
                accessibilityLabel="Back"
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <ChevronLeft color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              testID="accuracy-feedback-close"
              accessibilityLabel="Close"
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Scrollable content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.title}>
                {partnerName}'s understanding
              </Text>
              <Text style={styles.subtitle}>
                {partnerName} shared this to show they understand your perspective. How well does it capture your experience?
              </Text>

              {/* Partner's empathy statement */}
              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>{statement}</Text>
              </View>

              {isFeedbackStep ? (
                <View style={styles.feedbackSection}>
                  <Text style={styles.feedbackQuestion}>What feels off?</Text>
                  <Text style={styles.feedbackPrompt}>
                    Share a rough note first. The feedback coach will help you turn it into something clear and constructive.
                  </Text>
                  <TextInput
                    style={[styles.feedbackInput, showFeedbackError && styles.feedbackInputError]}
                    value={roughFeedback}
                    onChangeText={(text) => {
                      setRoughFeedback(text);
                      if (text.trim()) setShowFeedbackError(false);
                    }}
                    placeholder="For example: It misses that I felt dismissed, not just frustrated."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    testID="accuracy-rough-feedback-input"
                    accessibilityLabel="What feels off?"
                  />
                  {showFeedbackError && (
                    <Text style={styles.feedbackError}>Add a little feedback before continuing.</Text>
                  )}
                  <View style={styles.inputActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onClose}
                      testID="accuracy-feedback-cancel"
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.continueButton,
                        !roughFeedback.trim() && styles.continueButtonDisabled,
                      ]}
                      disabled={!roughFeedback.trim()}
                      onPress={handleSubmitFeedback}
                      testID="accuracy-feedback-continue"
                    >
                      <Text style={styles.continueButtonText}>Continue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Feedback buttons */
                <View style={styles.feedbackSection}>
                  <Text style={styles.feedbackQuestion}>How accurate is this?</Text>

                  <TouchableOpacity
                    style={styles.feedbackButton}
                    onPress={handleAccurate}
                    testID="accuracy-accurate-button"
                    activeOpacity={0.8}
                  >
                    <View style={[styles.feedbackIcon, styles.accurateIcon]}>
                      <Check color="white" size={18} />
                    </View>
                    <View style={styles.feedbackTextContainer}>
                      <Text style={styles.feedbackButtonTitle}>Accurate</Text>
                      <Text style={styles.feedbackButtonDesc}>This captures my perspective well</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.feedbackButton}
                    onPress={handlePartiallyAccurate}
                    testID="accuracy-partial-button"
                    activeOpacity={0.8}
                  >
                    <View style={[styles.feedbackIcon, styles.partialIcon]}>
                      <Minus color="white" size={18} />
                    </View>
                    <View style={styles.feedbackTextContainer}>
                      <Text style={styles.feedbackButtonTitle}>Partially accurate</Text>
                      <Text style={styles.feedbackButtonDesc}>Some parts are right, but not all</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.feedbackButton}
                    onPress={handleInaccurate}
                    testID="accuracy-inaccurate-button"
                    activeOpacity={0.8}
                  >
                    <View style={[styles.feedbackIcon, styles.inaccurateIcon]}>
                      <XCircle color="white" size={18} />
                    </View>
                    <View style={styles.feedbackTextContainer}>
                      <Text style={styles.feedbackButtonTitle}>Not quite</Text>
                      <Text style={styles.feedbackButtonDesc}>This doesn't capture my perspective</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
  },
  closeButton: {
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    marginLeft: 'auto',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  messageContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandBlue,
    padding: 20,
    marginBottom: 32,
  },
  messageText: {
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  feedbackSection: {
    gap: 12,
  },
  feedbackQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  feedbackIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accurateIcon: {
    backgroundColor: colors.success,
  },
  partialIcon: {
    backgroundColor: colors.warning,
  },
  inaccurateIcon: {
    backgroundColor: colors.error,
  },
  feedbackTextContainer: {
    flex: 1,
  },
  feedbackButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  feedbackButtonDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  feedbackPrompt: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  feedbackInput: {
    minHeight: 140,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  feedbackInputError: {
    borderColor: colors.error,
  },
  feedbackError: {
    fontSize: 13,
    color: colors.error,
  },
  inputActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  continueButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export default AccuracyFeedbackDrawer;
