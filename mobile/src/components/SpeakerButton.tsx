/**
 * SpeakerButton Component
 *
 * A small speaker icon button that speaks text when tapped.
 * Toggles between speaking and stopped states.
 */

import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Volume2, VolumeX } from 'lucide-react-native';
import { useRef, useEffect } from 'react';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface SpeakerButtonProps {
  /** Whether speech is currently playing for this text */
  isSpeaking: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Size of the icon (default: 18) */
  size?: number;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SpeakerButton({
  isSpeaking,
  onPress,
  size = 18,
  testID = 'speaker-button',
}: SpeakerButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when speaking
  useEffect(() => {
    if (isSpeaking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      // Reset scale when not speaking
      scaleAnim.setValue(1);
    }
  }, [isSpeaking, scaleAnim]);

  const Icon = isSpeaking ? VolumeX : Volume2;
  const iconColor = isSpeaking ? colors.accent : colors.textMuted;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.container}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID={testID}
      accessibilityLabel={isSpeaking ? 'Stop speaking' : 'Speak text'}
      accessibilityRole="button"
      accessibilityState={{ selected: isSpeaking }}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Icon size={size} color={iconColor} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 4,
    borderRadius: 4,
  },
});

export default SpeakerButton;
