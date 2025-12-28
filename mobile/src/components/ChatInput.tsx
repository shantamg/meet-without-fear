import { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { Send } from 'lucide-react-native';
import { createStyles } from '../theme/styled';
import { theme } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  showCharacterCount?: boolean;
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
  placeholder = 'Type a message...',
  maxLength = DEFAULT_MAX_LENGTH,
  showCharacterCount = false,
}: ChatInputProps) {
  const styles = useStyles();
  const [input, setInput] = useState('');

  const canSend = input.trim().length > 0 && !disabled;
  const characterRatio = input.length / maxLength;
  const showWarning = characterRatio >= CHARACTER_WARNING_THRESHOLD;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const message = input.trim();
    setInput('');
    onSend(message);
  }, [input, canSend, onSend]);

  const handleChangeText = useCallback((text: string) => {
    setInput(text);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={maxLength}
          editable={!disabled}
          testID="chat-input"
        />
        {showCharacterCount && (
          <Text style={[styles.characterCount, showWarning && styles.characterCountWarning]}>
            {input.length}/{maxLength}
          </Text>
        )}
      </View>
      <TouchableOpacity
        testID="send-button"
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.7}
      >
        <Send color={canSend ? theme.colors.textPrimary : theme.colors.textMuted} size={20} />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: t.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bgSecondary,
    },
    inputWrapper: {
      flex: 1,
      position: 'relative',
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    input: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: t.typography.fontSize.lg,
      maxHeight: 140,
      color: t.colors.textPrimary,
      backgroundColor: 'transparent',
    },
    characterCount: {
      position: 'absolute',
      right: t.spacing.md,
      bottom: -16,
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
    },
    characterCountWarning: {
      color: t.colors.warning,
    },
    sendButton: {
      width: 40,
      height: 40,
      marginLeft: t.spacing.sm,
      backgroundColor: t.colors.accent,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
      backgroundColor: t.colors.bgTertiary,
    },
  }));
