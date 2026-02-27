/**
 * SessionEntryMoodCheck Component
 *
 * A modal that appears when entering a chat session to capture the user's
 * current emotional state. This ensures the emotional barometer reflects
 * how the user is actually feeling at the start of the conversation.
 *
 * Polished, inviting design with clean slider and soothing aesthetic.
 */

import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { colors, spacing, radius } from '@/theme';

/**
 * Get interpolated color based on value (1-10)
 * Non-judgmental gradient: teal → gray → amber (no red)
 */
function getGradientColor(value: number): string {
  const t = (value - 1) / 9;

  if (t <= 0.5) {
    // Calm (#5eaaa8 teal) to Moderate (#94a3b8 gray)
    const localT = t * 2;
    const r = Math.round(94 + (148 - 94) * localT);
    const g = Math.round(170 + (163 - 170) * localT);
    const b = Math.round(168 + (184 - 168) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Moderate (#94a3b8 gray) to Intense (#f59e0b amber)
    const localT = (t - 0.5) * 2;
    const r = Math.round(148 + (245 - 148) * localT);
    const g = Math.round(163 + (158 - 163) * localT);
    const b = Math.round(184 + (11 - 184) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Get energy label for a value
 */
function getIntensityLabel(value: number): string {
  if (value <= 4) return 'Calm';
  if (value <= 7) return 'Moderate';
  return 'Intense';
}

export interface SessionEntryMoodCheckProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Render as full-screen view instead of modal overlay (prevents content flash) */
  fullScreen?: boolean;
  /** Initial slider value (defaults to 5 - neutral Moderate) */
  initialValue?: number;
  /** Callback when user completes the check */
  onComplete: (intensity: number) => void;
}

/**
 * SessionEntryMoodCheck - Modal for checking emotional state on session entry
 *
 * Displays a full-screen modal with a slider for users to indicate how they're
 * feeling before starting or resuming a chat conversation.
 *
 * When fullScreen is true, renders as a standalone view (not modal) to prevent
 * flash of content behind it during screen transitions.
 */
export function SessionEntryMoodCheck({
  visible,
  fullScreen = false,
  initialValue = 5,
  onComplete,
}: SessionEntryMoodCheckProps) {
  const [value, setValue] = useState(initialValue);
  const currentColor = getGradientColor(value);
  const currentLabel = getIntensityLabel(value);

  const handleValueChange = useCallback((newValue: number) => {
    setValue(Math.round(newValue));
  }, []);

  const handleContinue = useCallback(() => {
    onComplete(value);
  }, [onComplete, value]);

  // Get a softer pastel color for the label
  const getSoftLabelColor = (label: string): string => {
    if (label === 'Calm') return '#7dd3c0'; // Soft teal
    if (label === 'Moderate') return '#94a3b8'; // Soft gray
    return '#fbbf24'; // Soft amber
  };

  const softLabelColor = getSoftLabelColor(currentLabel);

  // Shared content between modal and full-screen modes
  const content = (
    <View style={fullScreen ? styles.fullScreenOverlay : styles.overlay}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.container}>
          <View style={styles.contentArea}>
            <Text style={styles.title}>How are you feeling right now?</Text>
            <Text style={styles.privacyText}>
              This helps your AI guide adjust its approach. Only the AI sees this — your partner won't.
            </Text>

            <View style={styles.labelContainer}>
              <Text style={[styles.emotionLabel, { color: softLabelColor }]}>
                {currentLabel}
              </Text>
            </View>

            <View style={styles.sliderContainer}>
              <Slider
                testID="mood-check-slider"
                style={styles.slider}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={value}
                onValueChange={handleValueChange}
                minimumTrackTintColor={currentColor}
                maximumTrackTintColor="rgba(148, 163, 184, 0.3)"
                thumbTintColor={currentColor}
              />
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              testID="mood-check-continue-button"
              activeOpacity={0.8}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipLink}
              onPress={() => onComplete(5)}
              testID="mood-check-skip-button"
              activeOpacity={0.7}
            >
              <Text style={styles.skipLinkText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );

  // Full-screen mode: render directly without Modal wrapper
  if (fullScreen) {
    return visible ? content : null;
  }

  // Modal mode: wrap in Modal for overlay behavior
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent
      testID="session-entry-mood-check-modal"
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  contentArea: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 32,
  },
  labelContainer: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  emotionLabel: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.25,
  },
  sliderContainer: {
    width: '100%',
    marginBottom: 64,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  privacyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing['2xl'],
    paddingHorizontal: spacing.md,
  },
  continueButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.full,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  skipLink: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skipLinkText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '400',
  },
});

export default SessionEntryMoodCheck;
