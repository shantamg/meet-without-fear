/**
 * EditSuggestionModal Component
 *
 * Modal for editing a memory suggestion before approving it.
 * Uses the same AI-assisted flow as the EditMemoryModal on the memories page.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { colors, spacing, radius } from '../theme';
import { useFormatMemory } from '../hooks/useMemories';
import type { MemorySuggestion, MemoryCategory } from '@meet-without-fear/shared';

// ============================================================================
// Category Labels
// ============================================================================

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  AI_NAME: 'AI Name',
  LANGUAGE: 'Language',
  COMMUNICATION: 'Communication Style',
  PERSONAL_INFO: 'Personal Info',
  RELATIONSHIP: 'Relationship',
  PREFERENCE: 'Preference',
};

// ============================================================================
// Types
// ============================================================================

interface EditSuggestionModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** The memory suggestion to edit */
  suggestion: MemorySuggestion;
  /** Callback when the modal is closed */
  onClose: () => void;
  /** Callback when the edited suggestion should be saved */
  onSave: (editedContent: string, category: MemoryCategory) => void;
  /** Test ID for testing */
  testID?: string;
}

interface FormattedSuggestion {
  content: string;
  category: MemoryCategory;
  reasoning?: string;
}

// ============================================================================
// Component
// ============================================================================

export function EditSuggestionModal({
  visible,
  suggestion,
  onClose,
  onSave,
  testID = 'edit-suggestion-modal',
}: EditSuggestionModalProps) {
  const [changeRequest, setChangeRequest] = useState('');
  const [editedSuggestion, setEditedSuggestion] = useState<FormattedSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatMemory = useFormatMemory();

  const handleRequestUpdate = async () => {
    if (!changeRequest.trim()) return;
    setError(null);
    setEditedSuggestion(null);

    try {
      // Combine the original suggestion with the change request for AI to reformat
      const combinedInput = `The current memory is: "${suggestion.suggestedContent}". Please modify it as follows: ${changeRequest.trim()}`;

      const result = await formatMemory.mutateAsync({ userInput: combinedInput });
      if (result.valid && result.suggestion) {
        setEditedSuggestion({
          content: result.suggestion.content,
          category: result.suggestion.category,
          reasoning: result.suggestion.reasoning,
        });
      } else {
        setError(result.rejectionReason || 'Unable to make this change.');
      }
    } catch (err) {
      console.error('Format memory failed:', err);
      setError('Something went wrong. Please try again.');
    }
  };

  const handleConfirmUpdate = () => {
    if (!editedSuggestion) return;
    onSave(editedSuggestion.content, editedSuggestion.category);
    handleClose();
  };

  const handleClose = () => {
    setChangeRequest('');
    setEditedSuggestion(null);
    setError(null);
    onClose();
  };

  const isProcessing = formatMemory.isPending;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Memory</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.modalCloseButton}
              testID={`${testID}-close`}
            >
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.currentMemoryContainer}>
            <Text style={styles.currentMemoryLabel}>Current memory:</Text>
            <Text style={styles.currentMemoryContent}>"{suggestion.suggestedContent}"</Text>
            <Text style={styles.memoryCategoryLabel}>
              {CATEGORY_LABELS[suggestion.category]}
            </Text>
          </View>

          <Text style={styles.modalDescription}>
            How would you like to change this?
          </Text>

          <TextInput
            style={styles.modalInput}
            value={changeRequest}
            onChangeText={(text) => {
              setChangeRequest(text);
              setEditedSuggestion(null);
              setError(null);
            }}
            placeholder="e.g., Make it more casual"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!isProcessing}
            testID={`${testID}-input`}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {editedSuggestion && (
            <View style={styles.suggestionContainer}>
              <Text style={styles.suggestionLabel}>Updated to:</Text>
              <Text style={styles.suggestionContent}>"{editedSuggestion.content}"</Text>
              {editedSuggestion.reasoning && (
                <Text style={styles.suggestionReasoning}>{editedSuggestion.reasoning}</Text>
              )}
            </View>
          )}

          <View style={styles.modalButtons}>
            {!editedSuggestion ? (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={handleClose}
                  disabled={isProcessing}
                  testID={`${testID}-cancel`}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSaveButton,
                    (!changeRequest.trim() || isProcessing) && styles.modalSaveButtonDisabled,
                  ]}
                  onPress={handleRequestUpdate}
                  disabled={!changeRequest.trim() || isProcessing}
                  testID={`${testID}-preview`}
                >
                  {formatMemory.isPending ? (
                    <ActivityIndicator color={colors.textOnAccent} size="small" />
                  ) : (
                    <Text style={styles.modalSaveButtonText}>Preview</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setEditedSuggestion(null);
                    setError(null);
                  }}
                  disabled={isProcessing}
                  testID={`${testID}-change`}
                >
                  <Text style={styles.modalCancelButtonText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveButton, isProcessing && styles.modalSaveButtonDisabled]}
                  onPress={handleConfirmUpdate}
                  disabled={isProcessing}
                  testID={`${testID}-save`}
                >
                  <Check color={colors.textOnAccent} size={18} />
                  <Text style={styles.modalSaveButtonText}>Save</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  currentMemoryContainer: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  currentMemoryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  currentMemoryContent: {
    fontSize: 15,
    color: colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  memoryCategoryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  errorContainer: {
    backgroundColor: colors.error + '20',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  suggestionContainer: {
    backgroundColor: colors.accent + '15',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  suggestionLabel: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  suggestionContent: {
    fontSize: 15,
    color: colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  suggestionReasoning: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
});

export default EditSuggestionModal;
