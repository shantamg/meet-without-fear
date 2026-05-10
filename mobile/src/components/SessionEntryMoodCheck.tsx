/**
 * SessionEntryMoodCheck Component
 *
 * Full-screen check-in shown when entering a session.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { designFonts, useAppAppearance } from '@/theme';
import { HeaderBackButton } from './HeaderBackButton';

const FEELINGS = [
  { intensity: 10, label: 'Heated', hint: 'lit up, hard to breathe' },
  { intensity: 8, label: 'Activated', hint: 'on edge, fast' },
  { intensity: 6, label: 'Tense', hint: 'shoulders up' },
  { intensity: 5, label: 'Steady', hint: 'with you' },
  { intensity: 3, label: 'Settled', hint: 'a little softer' },
  { intensity: 1, label: 'Calm', hint: 'open, slow' },
] as const;

function nearestFeeling(intensity: number) {
  return FEELINGS.reduce((best, feeling) => {
    const bestDistance = Math.abs(best.intensity - intensity);
    const distance = Math.abs(feeling.intensity - intensity);
    return distance < bestDistance ? feeling : best;
  }, FEELINGS[0]);
}

function getGradientColor(value: number): string {
  const t = (value - 1) / 9;

  if (t <= 0.5) {
    const localT = t * 2;
    const r = Math.round(16 + (245 - 16) * localT);
    const g = Math.round(163 + (158 - 163) * localT);
    const b = Math.round(127 + (11 - 127) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const localT = (t - 0.5) * 2;
  const r = Math.round(245 + (239 - 245) * localT);
  const g = Math.round(158 + (68 - 158) * localT);
  const b = Math.round(11 + (68 - 11) * localT);
  return `rgb(${r}, ${g}, ${b})`;
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
  /** Optional back action for full-screen presentation */
  onBack?: () => void;
}

export function SessionEntryMoodCheck({
  visible,
  fullScreen = false,
  initialValue = 5,
  onComplete,
  onBack,
}: SessionEntryMoodCheckProps) {
  const [value, setValue] = useState(initialValue);
  const { palette } = useAppAppearance();
  const styles = useStyles();
  const feeling = nearestFeeling(value);
  const sliderColor = getGradientColor(value);

  const handleValueChange = useCallback((newValue: number) => {
    setValue(Math.round(newValue));
  }, []);

  const handleContinue = useCallback(() => {
    onComplete(value);
  }, [onComplete, value]);

  const backSwipeResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Boolean(onBack) &&
        gestureState.x0 <= 28 &&
        gestureState.dx > 12 &&
        Math.abs(gestureState.dy) < 24,
      onPanResponderRelease: (_, gestureState) => {
        if (!onBack) return;
        if (gestureState.dx > 70 || gestureState.vx > 0.65) {
          onBack();
        }
      },
    }),
    [onBack]
  );

  const content = (
    <View
      style={fullScreen ? styles.fullScreenOverlay : styles.overlay}
      {...(onBack ? backSwipeResponder.panHandlers : {})}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          {onBack && (
            <HeaderBackButton
              onPress={onBack}
              accessibilityLabel="Back to home"
              testID="mood-check-back-button"
            />
          )}
          <Text style={styles.topLabel}>Before we begin</Text>
          <View style={styles.topRule} />
        </View>

        <View style={styles.center}>
          <Text style={styles.kicker}>A check-in, just for you</Text>
          <Text style={styles.title}>
            How are you feeling{'\n'}
            <Text style={styles.titleEmphasis}>right now?</Text>
          </Text>
          <Text style={styles.subtitle}>
            This helps your guide adjust its approach. Only the AI sees this — your partner won't.
          </Text>

          <View style={styles.readout}>
            <Text style={styles.feelingName}>{feeling.label}</Text>
            <Text style={styles.feelingHint}>— {feeling.hint}</Text>
          </View>

          <View style={styles.scale} testID="mood-check-scale">
            <View style={styles.sliderContainer}>
              <Slider
                testID="mood-check-slider"
                style={styles.slider}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={value}
                onValueChange={handleValueChange}
                minimumTrackTintColor={sliderColor}
                maximumTrackTintColor={palette.progressPending}
                thumbTintColor={sliderColor}
              />
            </View>
            <View style={styles.axis}>
              <Text style={styles.axisText}>Calm</Text>
              <View style={styles.axisRule} />
              <Text style={styles.axisText}>Steady</Text>
              <View style={styles.axisRule} />
              <Text style={styles.axisText}>Heated</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            testID="mood-check-continue-button"
            activeOpacity={0.86}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>

        </View>
      </SafeAreaView>
    </View>
  );

  if (fullScreen) {
    return visible ? content : null;
  }

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

const useStyles = () => {
  const { palette } = useAppAppearance();

  return useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: palette.scrim,
    },
    fullScreenOverlay: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    safeArea: {
      flex: 1,
      paddingTop: 18,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 22,
      paddingBottom: 8,
    },
    topLabel: {
      color: palette.textFaint,
      fontFamily: designFonts.mono,
      fontSize: 11,
      letterSpacing: 1.54,
      textTransform: 'uppercase',
    },
    topRule: {
      flex: 1,
      height: 1,
      backgroundColor: palette.divider,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 14,
    },
    kicker: {
      fontFamily: designFonts.serif,
      fontSize: 17,
      fontStyle: 'italic',
      letterSpacing: 0.08,
      color: palette.textMuted,
    },
    title: {
      fontFamily: designFonts.serif,
      fontSize: 46,
      lineHeight: 45,
      fontWeight: '400',
      letterSpacing: -1,
      color: palette.text,
    },
    titleEmphasis: {
      fontFamily: designFonts.serif,
      fontStyle: 'italic',
      color: palette.accentText,
    },
    subtitle: {
      fontSize: 14.5,
      lineHeight: 21.75,
      color: palette.textMuted,
      maxWidth: 300,
      marginTop: 4,
    },
    readout: {
      marginTop: 22,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      flexWrap: 'wrap',
    },
    feelingName: {
      fontFamily: designFonts.serif,
      fontSize: 30,
      fontStyle: 'italic',
      letterSpacing: -0.15,
      color: palette.accentText,
    },
    feelingHint: {
      fontFamily: designFonts.serif,
      fontSize: 13.5,
      fontStyle: 'italic',
      color: palette.textFaint,
    },
    scale: {
      marginTop: 8,
    },
    sliderContainer: {
      paddingTop: 4,
      paddingBottom: 2,
    },
    slider: {
      width: '100%',
      height: 40,
    },
    axis: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    axisText: {
      fontFamily: designFonts.mono,
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: palette.textFaint,
    },
    axisRule: {
      flex: 1,
      height: 1,
      backgroundColor: palette.divider,
    },
    footer: {
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 28,
      alignItems: 'stretch',
      gap: 8,
    },
    continueButton: {
      width: '100%',
      minHeight: 54,
      borderRadius: 999,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    continueButtonText: {
      color: '#fffaf0',
      fontSize: 15,
      fontWeight: '500',
    },
  }), [palette]);
};

export default SessionEntryMoodCheck;
