import { useEffect, useRef, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

interface TypewriterTextProps {
  /** The text content to animate. It may grow while streaming. */
  text: string;
  style?: StyleProp<TextStyle>;
  /** Approximate delay between word starts. */
  wordDelay?: number;
  /** Kept for API compatibility; character reveal does not fade tokens. */
  fadeDuration?: number;
  skipAnimation?: boolean;
  onComplete?: () => void;
  /** Whether catching up to the current text should finish the whole animation. */
  completeWhenCaughtUp?: boolean;
  onProgress?: () => void;
}

const MIN_CHARACTER_DELAY_MS = 10;

function getNextChunk(text: string, startIndex: number): string {
  const remaining = text.slice(startIndex);
  if (!remaining) return '';

  const match = remaining.match(/^(\s+|\S+\s*)/);
  return match?.[0] || remaining[0];
}

function getCommonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;

  while (index < max && a[index] === b[index]) {
    index += 1;
  }

  return index;
}

export function TypewriterText({
  text,
  style,
  wordDelay = 50,
  skipAnimation = false,
  onComplete,
  completeWhenCaughtUp = true,
  onProgress,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState(skipAnimation ? text : '');
  const displayedTextRef = useRef(skipAnimation ? text : '');
  const targetTextRef = useRef(text);
  const isMountedRef = useRef(true);
  const isAnimatingRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const completeWhenCaughtUpRef = useRef(completeWhenCaughtUp);

  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;
  completeWhenCaughtUpRef.current = completeWhenCaughtUp;

  useEffect(() => {
    targetTextRef.current = text;
    completionNotifiedRef.current = false;

    if (skipAnimation) {
      displayedTextRef.current = text;
      setDisplayedText(text);
      if (completeWhenCaughtUp) onCompleteRef.current?.();
      return;
    }

    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      scheduleNextTick(0);
    }
    // scheduleNextTick is intentionally a local function below; its refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, skipAnimation, completeWhenCaughtUp]);

  useEffect(() => {
    if (
      completeWhenCaughtUp &&
      !isAnimatingRef.current &&
      displayedTextRef.current === targetTextRef.current &&
      targetTextRef.current.length > 0 &&
      !completionNotifiedRef.current
    ) {
      completionNotifiedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [completeWhenCaughtUp, text]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleNextTick = (delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      const target = targetTextRef.current;
      const current = displayedTextRef.current;

      if (current === target) {
        isAnimatingRef.current = false;
        if (completeWhenCaughtUpRef.current && target.length > 0 && !completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }

      if (!target.startsWith(current)) {
        const commonPrefixLength = getCommonPrefixLength(current, target);
        const stableText = current.slice(0, commonPrefixLength);

        displayedTextRef.current = stableText;
        setDisplayedText(stableText);
        onProgressRef.current?.();

        scheduleNextTick(0);
        return;
      }

      const chunk = getNextChunk(target, current.length);
      const nextText = target.slice(0, current.length + chunk.length);
      displayedTextRef.current = nextText;
      setDisplayedText(nextText);
      onProgressRef.current?.();

      const characterDelay = Math.max(
        MIN_CHARACTER_DELAY_MS,
        Math.floor(wordDelay / Math.max(1, chunk.trim().length)),
      );
      scheduleNextTick(characterDelay * Math.max(1, chunk.length));
    }, delay);
  };

  return <Text style={style}>{skipAnimation ? text : displayedText}</Text>;
}
