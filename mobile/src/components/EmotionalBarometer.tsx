import { View, Text, TextInput, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useCallback } from 'react';
import { colors } from '@/theme';

/**
 * Intensity level configuration with label and color
 */
interface IntensityLevel {
  max: number;
  label: string;
  color: string;
}

/**
 * Props for EmotionalBarometer component
 */
export interface EmotionalBarometerProps {
  /** Current intensity value (1-10) */
  value: number;
  /** Callback when intensity changes */
  onChange: (value: number) => void;
  /** Whether to show the header label */
  showLabel?: boolean;
  /** Whether to show context input */
  showContextInput?: boolean;
  /** Callback when context text changes */
  onContextChange?: (context: string) => void;
  /** Current context value */
  context?: string;
}

/**
 * Intensity level definitions mapping values to labels and colors
 */
const INTENSITY_LEVELS: IntensityLevel[] = [
  { max: 3, label: 'Calm', color: colors.calm },
  { max: 6, label: 'Elevated', color: colors.elevated },
  { max: 10, label: 'Intense', color: colors.intense },
];

/**
 * Get the intensity level for a given value
 */
function getIntensityLevel(value: number): IntensityLevel {
  return INTENSITY_LEVELS.find((level) => value <= level.max) || INTENSITY_LEVELS[2];
}

/**
 * Get interpolated color between green and red based on value (1-10)
 */
function getGradientColor(value: number): string {
  // Map value 1-10 to 0-1 for interpolation
  const t = (value - 1) / 9;

  // Calm (#10a37f) to Elevated (#f59e0b) to Intense (#ef4444)
  if (t <= 0.5) {
    // Calm to Elevated
    const localT = t * 2;
    const r = Math.round(16 + (245 - 16) * localT);
    const g = Math.round(163 + (158 - 163) * localT);
    const b = Math.round(127 + (11 - 127) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Elevated to Intense
    const localT = (t - 0.5) * 2;
    const r = Math.round(245 + (239 - 245) * localT);
    const g = Math.round(158 + (68 - 158) * localT);
    const b = Math.round(11 + (68 - 11) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * EmotionalBarometer - A slider component for checking in emotional intensity
 *
 * Displays a 1-10 slider with color gradient from green (calm) to red (intense).
 * Shows a suggestion to take a moment when intensity is high (>=9).
 * Optionally allows entering context about the emotional state.
 */
export function EmotionalBarometer({
  value,
  onChange,
  showLabel = true,
  showContextInput = false,
  onContextChange,
  context = '',
}: EmotionalBarometerProps) {
  const currentLevel = getIntensityLevel(value);
  const currentColor = getGradientColor(value);

  const handleValueChange = useCallback(
    (newValue: number) => {
      onChange(Math.round(newValue));
    },
    [onChange]
  );

  const handleContextChange = useCallback(
    (text: string) => {
      onContextChange?.(text);
    },
    [onContextChange]
  );

  return (
    <View style={styles.container}>
      {showLabel && (
        <View style={styles.header}>
          <Text style={styles.label}>How are you feeling?</Text>
          <Text style={[styles.value, { color: currentColor }]}>
            {value} - {currentLevel.label}
          </Text>
        </View>
      )}

      <Slider
        testID="slider"
        style={styles.slider}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={handleValueChange}
        minimumTrackTintColor={currentColor}
        maximumTrackTintColor={colors.bgTertiary}
        thumbTintColor={currentColor}
      />

      <View style={styles.labels}>
        <Text style={styles.scaleLabel}>Calm</Text>
        <Text style={styles.scaleLabel}>Elevated</Text>
        <Text style={styles.scaleLabel}>Intense</Text>
      </View>

      {value >= 9 && (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>
            Take a moment to ground yourself before continuing
          </Text>
        </View>
      )}

      {showContextInput && (
        <View style={styles.contextContainer}>
          <Text style={styles.contextLabel}>What's going on?</Text>
          <TextInput
            testID="context-input"
            style={styles.contextInput}
            value={context}
            onChangeText={handleContextChange}
            placeholder="Optional: describe what you're feeling..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scaleLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  suggestion: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: 'center',
  },
  contextContainer: {
    marginTop: 16,
  },
  contextLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  contextInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 80,
    backgroundColor: colors.bgPrimary,
  },
});

export default EmotionalBarometer;
