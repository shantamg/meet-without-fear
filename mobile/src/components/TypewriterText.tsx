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

// Special token to represent newlines
const NEWLINE_TOKEN = '\n';

/**
 * Renders text with a word-by-word fade-in typewriter effect.
 * Each word fades in sequentially, creating a smooth reading experience.
 * Preserves newlines in the text.
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
  // Split text into tokens (words and newlines preserved)
  const tokens = useMemo(() => {
    const result: string[] = [];
    // Split by newlines first, preserving them
    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
      // Split each line into words
      const words = line.split(/\s+/).filter(word => word.length > 0);
      result.push(...words);
      // Add newline token between lines (not after the last line)
      if (lineIndex < lines.length - 1) {
        result.push(NEWLINE_TOKEN);
      }
    });
    return result;
  }, [text]);

  // Track how many tokens are currently visible
  const [visibleCount, setVisibleCount] = useState(skipAnimation ? tokens.length : 0);

  // Store animated values for each token
  const animatedValues = useRef<Animated.Value[]>([]);

  // Track if animation has completed
  const hasCompletedRef = useRef(false);

  // Store callbacks in refs to avoid re-triggering animation
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;

  // Initialize animated values when tokens change
  useEffect(() => {
    animatedValues.current = tokens.map(() => new Animated.Value(skipAnimation ? 1 : 0));
    hasCompletedRef.current = false;
    setVisibleCount(skipAnimation ? tokens.length : 0);
  }, [text, skipAnimation, tokens.length]);

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
    const totalTokens = tokens.length;
    let isMounted = true;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;

    const animateNextToken = () => {
      if (!isMounted || currentIndex >= totalTokens) {
        if (isMounted) {
          hasCompletedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }

      // Make token visible and start fade animation together
      const animValue = animatedValues.current[currentIndex];
      setVisibleCount(currentIndex + 1);

      if (animValue && isMounted) {
        Animated.timing(animValue, {
          toValue: 1,
          duration: fadeDuration,
          useNativeDriver: true,
        }).start();
      }

      // Call progress callback every few tokens
      if (currentIndex % 3 === 0) {
        onProgressRef.current?.();
      }

      currentIndex++;

      // Schedule next token (newlines are instant, words have delay)
      if (currentIndex < totalTokens && isMounted) {
        const nextDelay = tokens[currentIndex - 1] === NEWLINE_TOKEN ? 0 : wordDelay;
        nextTimer = setTimeout(animateNextToken, nextDelay);
      } else if (isMounted) {
        // Final token animated, call complete after fade finishes
        nextTimer = setTimeout(() => {
          if (isMounted) {
            hasCompletedRef.current = true;
            onCompleteRef.current?.();
          }
        }, fadeDuration);
      }
    };

    // Start animation
    const startTimer = setTimeout(animateNextToken, 0);

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      if (nextTimer) {
        clearTimeout(nextTimer);
      }
    };
  }, [text, skipAnimation, wordDelay, fadeDuration, tokens.length]);

  // If skipping animation, render plain text
  if (skipAnimation) {
    return <Text style={style}>{text}</Text>;
  }

  // Render animated tokens using Text wrapper for proper newline handling
  return (
    <Text style={style}>
      {tokens.slice(0, visibleCount).map((token, index) => {
        const animValue = animatedValues.current[index];
        const isNewline = token === NEWLINE_TOKEN;
        const isLastToken = index === visibleCount - 1;
        const nextToken = tokens[index + 1];
        const nextIsNewline = nextToken === NEWLINE_TOKEN;

        // Render newlines directly (no animation needed)
        if (isNewline) {
          return '\n';
        }

        // Add space after word unless it's the last visible token or next is a newline
        const suffix = isLastToken || nextIsNewline ? '' : ' ';

        return (
          <Animated.Text
            key={index}
            style={{ opacity: animValue }}
          >
            {token}{suffix}
          </Animated.Text>
        );
      })}
    </Text>
  );
}
