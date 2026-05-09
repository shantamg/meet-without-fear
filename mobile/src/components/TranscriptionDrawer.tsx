/**
 * TranscriptionDrawer Component
 *
 * A slide-up overlay drawer for voice input. Shows the real-time transcript
 * text as the user speaks, with recording controls (Stop and Send / Cancel).
 *
 * Features:
 * - Slide-up animation using the project's Animated.Value spring pattern
 * - Semi-transparent black backdrop
 * - Real-time transcript display with auto-scroll to bottom
 * - Recording timer (M:SS format) with pulsing red dot indicator
 * - "Connecting..." and "Start speaking..." placeholder states
 * - Stop and Send / Cancel buttons
 * - Safe area insets for bottom padding
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appWidthStyle, useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface TranscriptionDrawerProps {
  visible: boolean;
  displayTranscript: string;
  phase: 'idle' | 'connecting' | 'recording' | 'stopping';
  elapsedSeconds: number;
  error: string | null;
  onStopAndSend: () => void;
  onCancel: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

// ============================================================================
// Component
// ============================================================================

export function TranscriptionDrawer({
  visible,
  displayTranscript,
  phase,
  elapsedSeconds,
  error,
  onStopAndSend,
  onCancel,
}: TranscriptionDrawerProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ---- Slide-up animation --------------------------------------------------
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, sheetAnim]);

  // ---- Pulsing red dot animation -------------------------------------------
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (phase === 'recording') {
      // Start pulsing loop
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulseRef.current.start();
    } else {
      // Stop pulsing
      if (pulseRef.current) {
        pulseRef.current.stop();
        pulseRef.current = null;
      }
      pulseAnim.setValue(phase === 'stopping' ? 0.5 : 0);
    }
    return () => {
      if (pulseRef.current) {
        pulseRef.current.stop();
        pulseRef.current = null;
      }
    };
  }, [phase, pulseAnim]);

  // ---- Auto-scroll to bottom on transcript update --------------------------
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (displayTranscript) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [displayTranscript]);

  // ---- Button disabled state -----------------------------------------------
  const isStopAndSendDisabled =
    phase === 'connecting' || phase === 'stopping' || !displayTranscript.trim();

  // ---- Backdrop press to cancel --------------------------------------------
  const handleBackdropPress = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Don't render at all when not visible and fully animated out
  if (!visible && phase === 'idle') {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'box-none' : 'none'}>
      {/* Semi-transparent backdrop — tap to cancel */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: sheetAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.5],
            }),
          },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.backdropTouchable}
          onPress={handleBackdropPress}
          activeOpacity={1}
          accessibilityLabel="Close voice input"
        />
      </Animated.View>

      {/* Slide-up drawer */}
      <Animated.View
        style={[
          styles.sheet,
          appWidthStyle,
          {
            paddingBottom: insets.bottom + 16,
            transform: [
              {
                translateY: sheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [windowHeight, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Header row: title, recording dot + timer */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Voice Input</Text>

          {phase === 'recording' && (
            <View style={styles.timerRow}>
              <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
              <Text style={styles.timerText}>{formatTimer(elapsedSeconds)}</Text>
            </View>
          )}

          {phase === 'stopping' && (
            <Text style={styles.processingText}>Processing...</Text>
          )}
        </View>

        {/* Transcript area */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : displayTranscript ? (
            <Text style={styles.transcriptText}>{displayTranscript}</Text>
          ) : phase === 'connecting' ? (
            <Text style={styles.placeholderText}>Connecting...</Text>
          ) : (
            <Text style={styles.placeholderText}>Start speaking...</Text>
          )}
        </ScrollView>

        {/* Button row */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel voice input"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stopAndSendButton, isStopAndSendDisabled && styles.stopAndSendButtonDisabled]}
            onPress={onStopAndSend}
            disabled={isStopAndSendDisabled}
            accessibilityRole="button"
            accessibilityLabel="Stop recording and send transcript"
          >
            <Text style={[styles.stopAndSendButtonText, isStopAndSendDisabled && styles.stopAndSendButtonTextDisabled]}>
              Stop and Send
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const TEXT_ON_ACCENT = '#0d0f12';

const makeStyles = (palette: Palette) => StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 300,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.scrim,
    },
    backdropTouchable: {
      flex: 1,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      // ~60% of screen height
      height: '60%',
      backgroundColor: palette.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.borderStrong,
      backgroundColor: palette.bgElev,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.text,
    },
    timerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.danger,
    },
    timerText: {
      fontSize: 14,
      fontWeight: '500',
      color: palette.textMuted,
      fontVariant: ['tabular-nums'],
    },
    processingText: {
      fontSize: 13,
      color: palette.textFaint,
      fontStyle: 'italic',
    },
    transcriptScroll: {
      flex: 1,
    },
    transcriptContent: {
      flexGrow: 1,
      padding: 24,
    },
    transcriptText: {
      fontSize: 17,
      lineHeight: 26,
      color: palette.text,
    },
    placeholderText: {
      fontSize: 17,
      lineHeight: 26,
      color: palette.textFaint,
      fontStyle: 'italic',
    },
    errorText: {
      fontSize: 17,
      lineHeight: 26,
      color: palette.danger,
    },
    buttonRow: {
      flexDirection: 'row',
      paddingHorizontal: 24,
      paddingTop: 16,
      gap: 16,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: palette.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.textMuted,
    },
    stopAndSendButton: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopAndSendButtonDisabled: {
      opacity: 0.4,
    },
    stopAndSendButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: TEXT_ON_ACCENT,
    },
    stopAndSendButtonTextDisabled: {
      color: TEXT_ON_ACCENT,
    },
  });
