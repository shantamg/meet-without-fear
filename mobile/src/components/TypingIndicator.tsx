import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Component
// ============================================================================

export function TypingIndicator() {
  const styles = useStyles();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animation1 = animateDot(dot1, 0);
    const animation2 = animateDot(dot2, 150);
    const animation3 = animateDot(dot3, 300);

    animation1.start();
    animation2.start();
    animation3.start();

    return () => {
      animation1.stop();
      animation2.stop();
      animation3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View testID="typing-indicator" style={styles.container}>
      <Animated.View style={[styles.dot, { opacity: dot1 }]} />
      <Animated.View style={[styles.dot, { opacity: dot2 }]} />
      <Animated.View style={[styles.dot, { opacity: dot3 }]} />
    </View>
  );
}

// ============================================================================
// Styles
const useStyles = () =>
  createStyles((t) => ({
    container: {
      flexDirection: 'row',
      padding: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignSelf: 'flex-start',
      marginLeft: t.spacing.xl,
      marginVertical: t.spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.textMuted,
      marginHorizontal: 2,
    },
  }));
