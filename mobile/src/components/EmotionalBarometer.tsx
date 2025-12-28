import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { useCallback } from 'react';
import { colors } from '@/theme';

/**
 * Threshold for showing breathing exercise suggestion
 * Plan specifies >= 8 for "Intense" zone
 */
const SUGGESTION_THRESHOLD = 8;

/**
 * Display mode for the barometer
 * - 'full': Full slider view with all options (default)
 * - 'compact': Smaller inline view for embedding
 * - 'quick': Just 3 buttons for quick selection
 */
export type PromptMode = 'full' | 'compact' | 'quick';

/**
 * Quick selection options for 'quick' mode
 */
interface QuickOption {
  label: string;
  value: number;
  color: string;
}

const QUICK_OPTIONS: QuickOption[] = [
  { label: 'Calm', value: 2, color: colors.calm },
  { label: 'Mixed', value: 6, color: colors.elevated },
  { label: 'Intense', value: 9, color: colors.intense },
];

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
  /** Display mode for periodic prompts */
  promptMode?: PromptMode;
}

/**
 * Intensity level definitions mapping values to labels and colors
 * Zone boundaries per plan:
 * - Calm: 1-4
 * - Elevated: 5-7
 * - Intense: 8-10
 */
const INTENSITY_LEVELS: IntensityLevel[] = [
  { max: 4, label: 'Calm', color: colors.calm },
  { max: 7, label: 'Elevated', color: colors.elevated },
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
 * Shows a suggestion to take a moment when intensity is high (>=8).
 * Optionally allows entering context about the emotional state.
 *
 * Supports multiple prompt modes:
 * - 'full': Full slider view with all options (default)
 * - 'compact': Smaller inline view for embedding
 * - 'quick': Just 3 buttons for quick selection (Calm/Mixed/Intense)
 */
export function EmotionalBarometer({
  value,
  onChange,
  showLabel = true,
  showContextInput = false,
  onContextChange,
  context = '',
  promptMode = 'full',
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

  const handleQuickSelect = useCallback(
    (selectedValue: number) => {
      onChange(selectedValue);
    },
    [onChange]
  );

  // Quick mode: 3 tappable buttons for fast selection
  if (promptMode === 'quick') {
    return (
      <View style={styles.quickContainer}>
        {showLabel && (
          <Text style={styles.quickLabel}>How are you feeling?</Text>
        )}
        <View style={styles.quickButtonsRow}>
          {QUICK_OPTIONS.map((option) => {
            const isSelected = getIntensityLevel(value).label === option.label ||
              (option.label === 'Mixed' && getIntensityLevel(value).label === 'Elevated');
            return (
              <TouchableOpacity
                key={option.label}
                testID={`quick-${option.label.toLowerCase()}`}
                style={[
                  styles.quickButton,
                  { borderColor: option.color },
                  isSelected && { backgroundColor: option.color },
                ]}
                onPress={() => handleQuickSelect(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.quickButtonText,
                    { color: isSelected ? colors.textPrimary : option.color },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Compact mode: smaller inline view
  if (promptMode === 'compact') {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactLabel}>Feeling:</Text>
          <Text style={[styles.compactValue, { color: currentColor }]}>
            {currentLevel.label}
          </Text>
        </View>
        <Slider
          testID="slider"
          style={styles.compactSlider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onValueChange={handleValueChange}
          minimumTrackTintColor={currentColor}
          maximumTrackTintColor={colors.bgTertiary}
          thumbTintColor={currentColor}
        />
      </View>
    );
  }

  // Full mode (default): complete slider view
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

      {value >= SUGGESTION_THRESHOLD && (
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
  // Full mode styles
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

  // Quick mode styles
  quickContainer: {
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  quickButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Compact mode styles
  compactContainer: {
    padding: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  compactLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  compactValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  compactSlider: {
    width: '100%',
    height: 24,
  },
});

export default EmotionalBarometer;
