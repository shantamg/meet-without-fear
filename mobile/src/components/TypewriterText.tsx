import { useEffect, useRef, useState, useMemo } from 'react';
import { Text, Animated, StyleProp, TextStyle, View } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface TypewriterTextProps {
  /** The full text content to animate */
  text: string;
  /** Text style to apply */
  style?: StyleProp<TextStyle>;
  /** Delay between each word appearing (ms) */
  wordDelay?: number;
  /** Duration of the fade-in animation for each word (ms) */
  fadeDuration?: number;
  /** Skip animation and show full text immediately */
  skipAnimation?: boolean;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Callback during animation progress (for scrolling) */
  onProgress?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders text with a word-by-word fade-in typewriter effect.
 * Each word fades in sequentially, creating a smooth reading experience.
 */
export function TypewriterText({
  text,
  style,
  wordDelay = 50,
  fadeDuration = 150,
  skipAnimation = false,
  onComplete,
  onProgress,
}: TypewriterTextProps) {
  // Split text into words (keeping words only, we'll add spaces in render)
  const words = useMemo(() => {
    return text.split(/\s+/).filter(word => word.length > 0);
  }, [text]);

  // Track how many words are currently visible
  const [visibleCount, setVisibleCount] = useState(skipAnimation ? words.length : 0);

  // Store animated values for each word
  const animatedValues = useRef<Animated.Value[]>([]);

  // Track if animation has completed
  const hasCompletedRef = useRef(false);

  // Store callbacks in refs to avoid re-triggering animation
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;

  // Initialize animated values when words change
  useEffect(() => {
    animatedValues.current = words.map(() => new Animated.Value(skipAnimation ? 1 : 0));
    hasCompletedRef.current = false;
    setVisibleCount(skipAnimation ? words.length : 0);
  }, [text, skipAnimation, words.length]);

  // Run the animation
  useEffect(() => {
    if (skipAnimation) {
      hasCompletedRef.current = true;
      return;
    }

    if (hasCompletedRef.current) {
      return;
    }

    let currentIndex = 0;
    const totalWords = words.length;
    let isMounted = true;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;

    const animateNextWord = () => {
      if (!isMounted || currentIndex >= totalWords) {
        if (isMounted) {
          hasCompletedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }

      // Make word visible and start fade animation together
      const animValue = animatedValues.current[currentIndex];
      setVisibleCount(currentIndex + 1);

      if (animValue && isMounted) {
        Animated.timing(animValue, {
          toValue: 1,
          duration: fadeDuration,
          useNativeDriver: true,
        }).start();
      }

      // Call progress callback every few words
      if (currentIndex % 3 === 0) {
        onProgressRef.current?.();
      }

      currentIndex++;

      // Schedule next word
      if (currentIndex < totalWords && isMounted) {
        nextTimer = setTimeout(animateNextWord, wordDelay);
      } else if (isMounted) {
        // Final word animated, call complete after fade finishes
        nextTimer = setTimeout(() => {
          if (isMounted) {
            hasCompletedRef.current = true;
            onCompleteRef.current?.();
          }
        }, fadeDuration);
      }
    };

    // Start animation
    const startTimer = setTimeout(animateNextWord, 0);

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      if (nextTimer) {
        clearTimeout(nextTimer);
      }
    };
  }, [text, skipAnimation, wordDelay, fadeDuration, words.length]);

  // If skipping animation, render plain text
  if (skipAnimation) {
    return <Text style={style}>{text}</Text>;
  }

  // Render animated words using flexWrap View for proper word-level animation
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.slice(0, visibleCount).map((word, index) => {
        const animValue = animatedValues.current[index];
        const isLastWord = index === visibleCount - 1;

        return (
          <Animated.Text
            key={index}
            style={[
              style,
              {
                opacity: animValue,
                // Add space after each word except the last visible one
                // (to prevent trailing space issues)
              },
            ]}
          >
            {word}{isLastWord ? '' : ' '}
          </Animated.Text>
        );
      })}
    </View>
  );
}
