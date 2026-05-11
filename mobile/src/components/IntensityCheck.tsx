/**
 * IntensityCheck Component
 *
 * A reusable component for checking emotional intensity after exercises.
 * Uses the same slider style as EmotionalBarometer for consistency.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useCallback, useMemo } from 'react';
import { appWidthStyle, designFonts, useAppAppearance } from '@/theme';

type Palette = ReturnType<typeof useAppAppearance>['palette'];

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function interpolateColor(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const r = Math.round(start.r + (end.r - start.r) * amount);
  const g = Math.round(start.g + (end.g - start.g) * amount);
  const b = Math.round(start.b + (end.b - start.b) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get interpolated color between theme semantic colors based on value (1-10).
 */
function getGradientColor(value: number, palette: Palette): string {
  const t = (value - 1) / 9;

  if (t <= 0.5) {
    return interpolateColor(palette.success, palette.warning, t * 2);
  }

  return interpolateColor(palette.warning, palette.danger, (t - 0.5) * 2);
}

/**
 * Get intensity label for a value
 */
function getIntensityLabel(value: number): string {
  if (value <= 4) return 'Calm';
  if (value <= 7) return 'Moderate';
  return 'Intense';
}

export interface IntensityCheckProps {
  /** Current intensity value (1-10) */
  value: number;
  /** Callback when intensity changes */
  onChange: (value: number) => void;
  /** Callback when user confirms and is done */
  onDone: () => void;
  /** Label for the done button */
  doneButtonLabel?: string;
}

/**
 * IntensityCheck - Post-exercise intensity check component
 *
 * Displays a slider matching the EmotionalBarometer style for users
 * to rate how they're feeling after completing an exercise.
 */
export function IntensityCheck({
  value,
  onChange,
  onDone,
  doneButtonLabel = 'Back to chat',
}: IntensityCheckProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const currentColor = getGradientColor(value, palette);
  const currentLabel = getIntensityLabel(value);

  const handleValueChange = useCallback(
    (newValue: number) => {
      onChange(Math.round(newValue));
    },
    [onChange]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How are you feeling now?</Text>

      <View style={styles.currentContainer}>
        <Text style={[styles.currentValue, { color: currentColor }]}>
          {value} - {currentLabel}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          testID="intensity-slider"
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onValueChange={handleValueChange}
          minimumTrackTintColor={currentColor}
          maximumTrackTintColor={palette.progressPending}
          thumbTintColor={currentColor}
        />

        <View style={styles.labels}>
          <Text style={styles.scaleLabel}>Calm</Text>
          <Text style={styles.scaleLabel}>Moderate</Text>
          <Text style={styles.scaleLabel}>Intense</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.doneButton}
        onPress={onDone}
        testID="done-button"
      >
        <Text style={styles.doneButtonText}>{doneButtonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  container: {
    ...appWidthStyle,
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '500',
    color: palette.text,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: designFonts.serif,
  },
  currentContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  currentValue: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: designFonts.serif,
  },
  sliderContainer: {
    width: '100%',
    marginBottom: 40,
    backgroundColor: palette.bgPane,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  scaleLabel: {
    fontSize: 12,
    color: palette.textFaint,
    fontFamily: designFonts.mono,
  },
  doneButton: {
    backgroundColor: palette.accent,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 8,
  },
  doneButtonText: {
    color: palette.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
});

export default IntensityCheck;
