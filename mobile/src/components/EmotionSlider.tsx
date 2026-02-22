/**
 * EmotionSlider Component
 *
 * A mood/emotion barometer slider that lets users indicate their emotional state.
 *
 * Features:
 * - Gradient slider from calm (green) to elevated (yellow) to intense (red)
 * - Shows word labels: "Calm", "Elevated", "Intense" based on value
 * - Triggers callback when emotion level is high (>= threshold)
 */

import { View, Text, Animated } from 'react-native';
import { useRef, useState, useEffect, useCallback } from 'react';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

const SLIDER_HINT_SEEN_KEY = 'emotion_slider_hint_seen';

// ============================================================================
// Types
// ============================================================================

interface EmotionSliderProps {
  /** Current emotion value (1-10) */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Callback when emotion reaches high threshold */
  onHighEmotion?: (value: number) => void;
  /** Threshold for triggering onHighEmotion (default: 9) */
  highThreshold?: number;
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Compact mode for low-profile display */
  compact?: boolean;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get interpolated color between green and red based on value (1-10)
 * Calm (#10a37f) -> Elevated (#f59e0b) -> Intense (#ef4444)
 */
function getGradientColor(value: number): string {
  const t = (value - 1) / 9;

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
 * Get intensity label based on value
 * Zone boundaries: Calm (1-4), Elevated (5-7), Intense (8-10)
 */
function getIntensityLabel(value: number): string {
  if (value <= 4) return 'Calm';
  if (value <= 7) return 'Elevated';
  return 'Intense';
}

// ============================================================================
// Component
// ============================================================================

export function EmotionSlider({
  value,
  onChange,
  onHighEmotion,
  highThreshold = 9,
  disabled = false,
  compact = false,
  testID = 'emotion-slider',
}: EmotionSliderProps) {
  const styles = useStyles(compact);
  const currentColor = getGradientColor(value);
  const intensityLabel = getIntensityLabel(value);

  // Track the value when user starts sliding
  const slideStartValue = useRef(value);

  // Onboarding hint state
  const [showHint, setShowHint] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SLIDER_HINT_SEEN_KEY).then((seen) => {
      if (!cancelled && seen !== 'true') {
        setShowHint(true);
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissHint = useCallback(() => {
    if (!showHint) return;
    AsyncStorage.setItem(SLIDER_HINT_SEEN_KEY, 'true');
    Animated.timing(hintOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowHint(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHint]);

  const handleSlidingStart = () => {
    // Remember value at start of slide
    slideStartValue.current = value;
    dismissHint();
  };

  const handleValueChange = (newValue: number) => {
    const roundedValue = Math.round(newValue);
    onChange(roundedValue);
  };

  const handleSlidingComplete = (newValue: number) => {
    const roundedValue = Math.round(newValue);

    // Only trigger high emotion if:
    // 1. Final value is >= threshold
    // 2. User raised the value (not lowered)
    if (
      roundedValue >= highThreshold &&
      roundedValue > slideStartValue.current &&
      onHighEmotion
    ) {
      onHighEmotion(roundedValue);
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>How are you feeling?</Text>
        <Text style={[styles.value, { color: currentColor }]} testID={`${testID}-value`}>
          {intensityLabel}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onSlidingStart={handleSlidingStart}
          onValueChange={handleValueChange}
          onSlidingComplete={handleSlidingComplete}
          minimumTrackTintColor={currentColor}
          maximumTrackTintColor={colors.bgTertiary}
          thumbTintColor={currentColor}
          disabled={disabled}
          testID={`${testID}-control`}
        />
        {showHint && (
          <Animated.Text
            style={[styles.hint, { opacity: hintOpacity }]}
            testID={`${testID}-hint`}
          >
            Slide to update how you're feeling
          </Animated.Text>
        )}
      </View>

      <View style={styles.labels}>
        <Text style={styles.labelText}>Calm</Text>
        <Text style={styles.labelText}>Elevated</Text>
        <Text style={styles.labelText}>Intense</Text>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = (compact?: boolean) =>
  createStyles((t) => ({
    container: {
      backgroundColor: t.colors.bgSecondary,
      paddingHorizontal: compact ? t.spacing.md : t.spacing.xl,
      paddingVertical: compact ? t.spacing.xs : t.spacing.md,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: compact ? 0 : t.spacing.sm,
    },
    label: {
      fontSize: compact ? t.typography.fontSize.xs : t.typography.fontSize.sm,
      color: t.colors.textMuted,
    },
    value: {
      fontSize: compact ? t.typography.fontSize.sm : t.typography.fontSize.md,
      fontWeight: '600',
    },
    sliderContainer: {
      marginVertical: compact ? 0 : t.spacing.xs,
    },
    slider: {
      width: '100%',
      height: compact ? 28 : 40,
    },
    hint: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginTop: compact ? 0 : t.spacing.xs,
    },
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: compact ? 0 : t.spacing.xs,
      display: compact ? 'none' : 'flex',
    },
    labelText: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
    },
  }));
