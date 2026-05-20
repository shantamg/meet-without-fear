import { useState, useCallback, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, Platform, type TextInput as TextInputType } from 'react-native';
import { ArrowUp, Mic } from 'lucide-react-native';
import { createStyles } from '../theme/styled';
import { designFonts, useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface ChatInputProps {
  onSend: (message: string) => void;
  /** Disables sending. The text field can remain editable to avoid keyboard jumps. */
  disabled?: boolean;
  /** Disables editing the text field itself. */
  inputDisabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  showCharacterCount?: boolean;
  /** Optional voice press handler -- when provided, renders a mic button */
  onVoicePress?: () => void;
  /** Content of a failed message to restore to the input field */
  failedMessage?: string | null;
  /** Pre-fill the input with provided text and focus it (e.g. Stage 4 brainstorm seed). */
  prefillText?: string | null;
  /** Callback invoked once a prefill has been applied (so caller can clear). */
  onPrefillConsumed?: () => void;
  /** Whether the software keyboard is currently visible. */
  keyboardVisible?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_LENGTH = 2000;
const CHARACTER_WARNING_THRESHOLD = 0.8;

// ============================================================================
// Component
// ============================================================================

export function ChatInput({
  onSend,
  disabled = false,
  inputDisabled = false,
  placeholder = 'Type a message...',
  maxLength = DEFAULT_MAX_LENGTH,
  showCharacterCount = false,
  onVoicePress,
  failedMessage,
  prefillText,
  onPrefillConsumed,
  keyboardVisible = false,
}: ChatInputProps) {
  const styles = useStyles(keyboardVisible);
  const { palette } = useAppAppearance();
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInputType>(null);
  // Flag to ignore onChangeText events right after sending (prevents autocorrect race condition)
  const justSentRef = useRef(false);

  // Restore text from a failed send attempt
  useEffect(() => {
    if (failedMessage && input.length === 0) {
      justSentRef.current = false;
      setInput(failedMessage);
    }
  }, [failedMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from external trigger (Stage 4 brainstorm stub).
  useEffect(() => {
    if (prefillText && prefillText.length > 0) {
      justSentRef.current = false;
      setInput(prefillText);
      inputRef.current?.focus();
      onPrefillConsumed?.();
    }
  }, [prefillText]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = input.trim().length > 0 && !disabled;
  const characterRatio = input.length / maxLength;
  const showWarning = characterRatio >= CHARACTER_WARNING_THRESHOLD;
  // Voice recording is not supported on web; hide the mic regardless of caller.
  const showVoiceButton = !!onVoicePress && Platform.OS !== 'web';

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const message = input.trim();
    // Set flag to ignore autocorrect events that fire after clearing
    justSentRef.current = true;
    // Clear both React state and native TextInput to ensure sync
    setInput('');
    inputRef.current?.clear();
    try {
      onSend(message);
    } finally {
      if (Platform.OS === 'web') {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      // Reset flag after a short delay to allow autocorrect events to be ignored.
      // Must be in finally block so the flag is always cleared even if onSend throws.
      setTimeout(() => {
        justSentRef.current = false;
      }, 500);
    }
  }, [input, canSend, onSend]);

  const handleChangeText = useCallback((text: string) => {
    // Ignore autocorrect events that fire right after sending
    if (justSentRef.current) return;
    setInput(text);
  }, []);

  const handleKeyPress = useCallback((e: any) => {
    // Web only: Enter sends message, Shift+Enter adds newline
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={handleChangeText}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor={palette.textFaint}
          multiline
          maxLength={maxLength}
          editable={!inputDisabled}
          testID="chat-input"
        />
        {showCharacterCount && (
          <Text style={[styles.characterCount, showWarning && styles.characterCountWarning]}>
            {input.length}/{maxLength}
          </Text>
        )}
      </View>
      {showVoiceButton && (
        <TouchableOpacity
          style={styles.micButton}
          onPress={onVoicePress}
          accessibilityRole="button"
          accessibilityLabel="Voice input"
          testID="voice-input-button"
        >
          <Mic color={palette.textMuted} size={20} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        testID="send-button"
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.7}
      >
        <ArrowUp color={canSend ? palette.bg : palette.textFaint} size={18} />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = (keyboardVisible: boolean) => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: keyboardVisible ? t.spacing.sm : t.spacing.xl,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.bg,
    },
    inputWrapper: {
      flex: 1,
      position: 'relative',
      backgroundColor: palette.bgElev,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    input: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.md,
      fontSize: 14,
      maxHeight: 140,
      color: palette.text,
      backgroundColor: 'transparent',
      fontFamily: designFonts.sans,
    },
    characterCount: {
      position: 'absolute',
      right: t.spacing.md,
      bottom: -16,
      fontSize: t.typography.fontSize.xs,
      color: palette.textMuted,
    },
    characterCountWarning: {
      color: palette.accent,
    },
    micButton: {
      width: 40,
      height: 40,
      marginLeft: t.spacing.xs,
      backgroundColor: 'transparent',
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButton: {
      width: 40,
      height: 40,
      marginLeft: t.spacing.sm,
      backgroundColor: palette.accent,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: palette.chipBg,
    },
  }));
};
