import { useEffect, useRef, useState, useCallback } from 'react';
import { Text, Animated, StyleProp, TextStyle } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface TypewriterTextProps {
  /** The text content to animate (can grow over time for streaming) */
  text: string;
  /** Text style to apply */
  style?: StyleProp<TextStyle>;
  /** Delay between each word appearing (ms) */
  wordDelay?: number;
  /** Duration of the fade-in animation for each word (ms) */
  fadeDuration?: number;
  /** Skip animation and show full text immediately */
  skipAnimation?: boolean;
  /** Callback when all current text has been animated */
  onComplete?: () => void;
  /** Callback during animation progress (for scrolling) */
  onProgress?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

// Special token to represent newlines
const NEWLINE_TOKEN = '\n';

/**
 * Tokenize text into words and newlines
 */
function tokenize(text: string): string[] {
  const result: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    const words = line.split(/\s+/).filter(word => word.length > 0);
    result.push(...words);
    if (lineIndex < lines.length - 1) {
      result.push(NEWLINE_TOKEN);
    }
  });
  return result;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders text with a word-by-word fade-in typewriter effect.
 * Supports streaming: as text grows, new words are animated in sequence.
 * If text arrives faster than animation, words queue up and animate at wordDelay pace.
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
  // Current tokens from text
  const tokens = tokenize(text);

  // Animation state stored in refs to persist across renders
  const animatedValuesRef = useRef<Animated.Value[]>([]);
  const animationIndexRef = useRef(0); // Next token to animate
  const isAnimatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;

  // Force re-render when we need to show more tokens
  const [, forceUpdate] = useState(0);

  // Animate the next token in queue
  const animateNext = useCallback(() => {
    if (!isMountedRef.current) return;

    const idx = animationIndexRef.current;
    const values = animatedValuesRef.current;

    // Check if we've caught up to all available tokens
    if (idx >= values.length) {
      isAnimatingRef.current = false;
      // Check if we've animated all tokens and text is complete
      // (onComplete is called when animation catches up)
      onCompleteRef.current?.();
      return;
    }

    // Animate this token
    const animValue = values[idx];
    if (animValue) {
      Animated.timing(animValue, {
        toValue: 1,
        duration: fadeDuration,
        useNativeDriver: true,
      }).start();
    }

    // Update visible count
    animationIndexRef.current = idx + 1;
    forceUpdate(n => n + 1);

    // Call progress callback periodically
    if (idx % 3 === 0) {
      onProgressRef.current?.();
    }

    // Determine delay for next token
    const currentToken = tokens[idx];
    const nextDelay = currentToken === NEWLINE_TOKEN ? 0 : wordDelay;

    // Schedule next animation
    timerRef.current = setTimeout(animateNext, nextDelay);
  }, [wordDelay, fadeDuration, tokens]);

  // Start animation loop if not already running
  const startAnimation = useCallback(() => {
    if (isAnimatingRef.current || skipAnimation) return;
    isAnimatingRef.current = true;
    animateNext();
  }, [animateNext, skipAnimation]);

  // Handle new tokens arriving
  useEffect(() => {
    const currentCount = animatedValuesRef.current.length;
    const newCount = tokens.length;

    if (newCount > currentCount) {
      // Add animated values for new tokens
      for (let i = currentCount; i < newCount; i++) {
        animatedValuesRef.current.push(new Animated.Value(skipAnimation ? 1 : 0));
      }

      // If skipping animation, update animation index to match
      if (skipAnimation) {
        animationIndexRef.current = newCount;
        forceUpdate(n => n + 1);
      } else {
        // Start animation if not already running
        startAnimation();
      }
    }
  }, [tokens.length, skipAnimation, startAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // If skipping animation, render plain text
  if (skipAnimation) {
    return <Text style={style}>{text}</Text>;
  }

  // Render animated tokens
  const visibleCount = animationIndexRef.current;

  return (
    <Text style={style}>
      {tokens.slice(0, visibleCount).map((token, index) => {
        const animValue = animatedValuesRef.current[index];
        const isNewline = token === NEWLINE_TOKEN;
        const isLastToken = index === visibleCount - 1;
        const nextToken = tokens[index + 1];
        const nextIsNewline = nextToken === NEWLINE_TOKEN;

        // Render newlines directly
        if (isNewline) {
          return '\n';
        }

        // Add space after word unless it's the last visible or next is newline
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
