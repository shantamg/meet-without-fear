/**
 * EditSuggestionModal Component
 *
 * Modal for editing a memory suggestion before approving it.
 * Uses the same AI-assisted flow as the EditMemoryModal on the memories page.
 */

import React, { useMemo, useState } from 'react';
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
import { useAppAppearance } from '../theme';
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

const TEXT_ON_ACCENT = '#0d0f12';

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
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
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
              <X color={palette.textMuted} size={24} />
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
            placeholderTextColor={palette.textFaint}
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
                    <ActivityIndicator color={TEXT_ON_ACCENT} size="small" />
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
                  <Check color={TEXT_ON_ACCENT} size={18} />
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

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const makeStyles = (palette: Palette) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: palette.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: palette.bgElev,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalDescription: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: palette.bgPane,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    padding: 16,
    fontSize: 16,
    color: palette.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  currentMemoryContainer: {
    backgroundColor: palette.bgPane,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  currentMemoryLabel: {
    fontSize: 12,
    color: palette.textFaint,
    marginBottom: 4,
  },
  currentMemoryContent: {
    fontSize: 15,
    color: palette.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  memoryCategoryLabel: {
    fontSize: 12,
    color: palette.textFaint,
    marginTop: 4,
  },
  errorContainer: {
    backgroundColor: palette.dangerSoft,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: palette.danger,
    textAlign: 'center',
  },
  suggestionContainer: {
    backgroundColor: palette.accentSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: 16,
    marginBottom: 16,
  },
  suggestionLabel: {
    fontSize: 12,
    color: palette.accentText,
    fontWeight: '600',
    marginBottom: 4,
  },
  suggestionContent: {
    fontSize: 15,
    color: palette.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  suggestionReasoning: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: palette.bgPane,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: palette.textMuted,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveButtonText: {
    fontSize: 16,
    color: TEXT_ON_ACCENT,
    fontWeight: '600',
  },
});

export default EditSuggestionModal;
