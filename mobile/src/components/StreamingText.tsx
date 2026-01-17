import { useEffect, useRef, memo } from 'react';
import { Text, Animated, StyleProp, TextStyle } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface StreamingTextProps {
  /** The text content (can grow over time for streaming) */
  text: string;
  /** Text style to apply */
  style?: StyleProp<TextStyle>;
  /** Duration of the fade-in animation for new content (ms) */
  fadeDuration?: number;
  /** Callback when text has been fully rendered */
  onComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders text that fades in new content as it arrives.
 *
 * For streaming messages:
 * - Old text stays fully visible
 * - New text fades in smoothly
 *
 * Much simpler than TypewriterText - no word-by-word delays.
 * The streaming itself provides the "appearing" effect.
 */
export const StreamingText = memo(function StreamingText({
  text,
  style,
  fadeDuration = 200,
  onComplete,
}: StreamingTextProps) {
  // Track the length of text that has been "shown" (at full opacity)
  const shownLengthRef = useRef(0);

  // Animated value for the new content
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Track previous text to detect when it changes
  const prevTextRef = useRef(text);

  // Store callback in ref
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const prevText = prevTextRef.current;
    prevTextRef.current = text;

    // Text grew - new content arrived
    if (text.length > prevText.length) {
      // Start fade from 0
      fadeAnim.setValue(0);

      // Animate to full opacity
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: fadeDuration,
        useNativeDriver: true,
      }).start(() => {
        // Update shown length after animation completes
        shownLengthRef.current = text.length;
      });
    } else if (text.length === prevText.length && text !== prevText) {
      // Text replaced entirely (e.g., message ID changed) - reset
      shownLengthRef.current = 0;
      fadeAnim.setValue(1);
    }
  }, [text, fadeDuration, fadeAnim]);

  // Notify completion when we have text and aren't animating
  useEffect(() => {
    if (text.length > 0) {
      // Call onComplete after a short delay to account for final fade
      const timer = setTimeout(() => {
        onCompleteRef.current?.();
      }, fadeDuration + 50);
      return () => clearTimeout(timer);
    }
  }, [text, fadeDuration]);

  // Split text into "shown" (old) and "new" portions
  const shownLength = shownLengthRef.current;
  const shownText = text.slice(0, shownLength);
  const newText = text.slice(shownLength);

  // If no new text, just render everything
  if (!newText) {
    return <Text style={style}>{text}</Text>;
  }

  // Render old text at full opacity, new text with fade animation
  return (
    <Text style={style}>
      {shownText}
      <Animated.Text style={{ opacity: fadeAnim }}>{newText}</Animated.Text>
    </Text>
  );
});
