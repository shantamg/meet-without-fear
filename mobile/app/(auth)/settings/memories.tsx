/**
 * Memories Settings Screen
 *
 * Allows users to view, request edits, and delete their "Things to Remember" memories.
 * Users can add new memories via a plus button, and request AI-assisted edits.
 * Direct editing is not allowed - all changes go through AI validation.
 */

import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Plus, Trash2, Edit3, X, Star, User, Check, MessageSquare } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, spacing, radius } from '@/src/theme';
import {
  useMemories,
  useDeleteMemory,
  useFormatMemory,
  useConfirmMemory,
  useUpdateMemoryAI,
  useConfirmMemoryUpdate,
} from '@/src/hooks/useMemories';
import type { UserMemoryDTO, MemoryCategory, FormattedMemorySuggestion, UpdateMemoryAIResponse } from '@meet-without-fear/shared';

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
// Memory Item Component
// ============================================================================

interface MemoryItemProps {
  memory: UserMemoryDTO;
  onRequestEdit: (memory: UserMemoryDTO) => void;
  onDelete: (memory: UserMemoryDTO) => void;
  swipeableRef: (ref: Swipeable | null) => void;
}

function MemoryItem({ memory, onRequestEdit, onDelete, swipeableRef }: MemoryItemProps) {
  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => onDelete(memory)}
          accessibilityRole="button"
          accessibilityLabel="Delete memory"
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Trash2 color="#FFFFFF" size={24} />
          </Animated.View>
          <Animated.Text style={[styles.deleteActionText, { transform: [{ scale }] }]}>
            Delete
          </Animated.Text>
        </TouchableOpacity>
      );
    },
    [memory, onDelete]
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      <TouchableOpacity
        style={styles.memoryItem}
        onPress={() => onRequestEdit(memory)}
        activeOpacity={0.7}
      >
        <View style={styles.memoryContent}>
          <Text style={styles.memoryText}>{memory.content}</Text>
          <Text style={styles.memoryCategoryLabel}>
            {CATEGORY_LABELS[memory.category]}
          </Text>
        </View>
        <MessageSquare color={colors.textMuted} size={18} />
      </TouchableOpacity>
    </Swipeable>
  );
}

// ============================================================================
// Create Memory Modal
// ============================================================================

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
}

function CreateMemoryModal({ visible, onClose }: CreateModalProps) {
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<FormattedMemorySuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatMemory = useFormatMemory();
  const confirmMemory = useConfirmMemory();

  const handleFormat = async () => {
    if (!input.trim()) return;
    setError(null);
    setSuggestion(null);

    try {
      const result = await formatMemory.mutateAsync({ userInput: input.trim() });
      if (result.valid && result.suggestion) {
        setSuggestion(result.suggestion);
      } else {
        setError(result.rejectionReason || 'Unable to create this memory.');
      }
    } catch (err) {
      console.error('Format memory failed:', err);
      setError('Something went wrong. Please try again.');
    }
  };

  const handleConfirm = async () => {
    if (!suggestion) return;

    try {
      await confirmMemory.mutateAsync({
        content: suggestion.content,
        category: suggestion.category,
      });
      handleClose();
    } catch (err) {
      console.error('Confirm memory failed:', err);
      setError('Failed to save memory. Please try again.');
    }
  };

  const handleClose = () => {
    setInput('');
    setSuggestion(null);
    setError(null);
    onClose();
  };

  const isProcessing = formatMemory.isPending || confirmMemory.isPending;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Memory</Text>
            <TouchableOpacity onPress={handleClose} style={styles.modalCloseButton}>
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalDescription}>
            Tell me what you'd like me to remember. I'll format it appropriately.
          </Text>

          <TextInput
            style={styles.modalInput}
            value={input}
            onChangeText={(text) => {
              setInput(text);
              setSuggestion(null);
              setError(null);
            }}
            placeholder="e.g., Talk to me like a surfer would"
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
            editable={!isProcessing}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {suggestion && (
            <View style={styles.suggestionContainer}>
              <Text style={styles.suggestionLabel}>I'll remember:</Text>
              <Text style={styles.suggestionContent}>"{suggestion.content}"</Text>
              <Text style={styles.suggestionCategory}>
                Category: {CATEGORY_LABELS[suggestion.category]}
              </Text>
              {suggestion.reasoning && (
                <Text style={styles.suggestionReasoning}>{suggestion.reasoning}</Text>
              )}
            </View>
          )}

          <View style={styles.modalButtons}>
            {!suggestion ? (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={handleClose}
                  disabled={isProcessing}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSaveButton,
                    (!input.trim() || isProcessing) && styles.modalSaveButtonDisabled,
                  ]}
                  onPress={handleFormat}
                  disabled={!input.trim() || isProcessing}
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
                    setSuggestion(null);
                    setError(null);
                  }}
                  disabled={isProcessing}
                >
                  <Text style={styles.modalCancelButtonText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveButton, isProcessing && styles.modalSaveButtonDisabled]}
                  onPress={handleConfirm}
                  disabled={isProcessing}
                >
                  {confirmMemory.isPending ? (
                    <ActivityIndicator color={colors.textOnAccent} size="small" />
                  ) : (
                    <>
                      <Check color={colors.textOnAccent} size={18} />
                      <Text style={styles.modalSaveButtonText}>Save</Text>
                    </>
                  )}
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
// Edit Memory Modal (AI-assisted)
// ============================================================================

interface EditModalProps {
  visible: boolean;
  memory: UserMemoryDTO | null;
  onClose: () => void;
}

function EditMemoryModal({ visible, memory, onClose }: EditModalProps) {
  const [changeRequest, setChangeRequest] = useState('');
  const [suggestion, setSuggestion] = useState<UpdateMemoryAIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateMemoryAI = useUpdateMemoryAI();
  const confirmMemoryUpdate = useConfirmMemoryUpdate();

  const handleRequestUpdate = async () => {
    if (!memory || !changeRequest.trim()) return;
    setError(null);
    setSuggestion(null);

    try {
      const result = await updateMemoryAI.mutateAsync({
        memoryId: memory.id,
        changeRequest: changeRequest.trim(),
      });
      if (result.valid && result.updatedContent) {
        setSuggestion(result);
      } else {
        setError(result.rejectionReason || 'Unable to make this change.');
      }
    } catch (err) {
      console.error('Update memory AI failed:', err);
      setError('Something went wrong. Please try again.');
    }
  };

  const handleConfirmUpdate = async () => {
    if (!memory || !suggestion?.updatedContent) return;

    try {
      await confirmMemoryUpdate.mutateAsync({
        memoryId: memory.id,
        content: suggestion.updatedContent,
        category: suggestion.updatedCategory || memory.category,
      });
      handleClose();
    } catch (err) {
      console.error('Confirm memory update failed:', err);
      setError('Failed to save changes. Please try again.');
    }
  };

  const handleClose = () => {
    setChangeRequest('');
    setSuggestion(null);
    setError(null);
    onClose();
  };

  const isProcessing = updateMemoryAI.isPending || confirmMemoryUpdate.isPending;

  if (!memory) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Memory</Text>
            <TouchableOpacity onPress={handleClose} style={styles.modalCloseButton}>
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.currentMemoryContainer}>
            <Text style={styles.currentMemoryLabel}>Current memory:</Text>
            <Text style={styles.currentMemoryContent}>"{memory.content}"</Text>
            <Text style={styles.memoryCategoryLabel}>
              {CATEGORY_LABELS[memory.category]}
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
              setSuggestion(null);
              setError(null);
            }}
            placeholder="e.g., Make it more casual"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!isProcessing}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {suggestion && suggestion.updatedContent && (
            <View style={styles.suggestionContainer}>
              <Text style={styles.suggestionLabel}>Updated to:</Text>
              <Text style={styles.suggestionContent}>"{suggestion.updatedContent}"</Text>
              {suggestion.changesSummary && (
                <Text style={styles.suggestionReasoning}>{suggestion.changesSummary}</Text>
              )}
            </View>
          )}

          <View style={styles.modalButtons}>
            {!suggestion ? (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={handleClose}
                  disabled={isProcessing}
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
                >
                  {updateMemoryAI.isPending ? (
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
                    setSuggestion(null);
                    setError(null);
                  }}
                  disabled={isProcessing}
                >
                  <Text style={styles.modalCancelButtonText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveButton, isProcessing && styles.modalSaveButtonDisabled]}
                  onPress={handleConfirmUpdate}
                  disabled={isProcessing}
                >
                  {confirmMemoryUpdate.isPending ? (
                    <ActivityIndicator color={colors.textOnAccent} size="small" />
                  ) : (
                    <>
                      <Check color={colors.textOnAccent} size={18} />
                      <Text style={styles.modalSaveButtonText}>Save</Text>
                    </>
                  )}
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
// Main Screen Component
// ============================================================================

export default function MemoriesScreen() {
  const router = useRouter();
  const { data: memories, isLoading } = useMemories();
  const deleteMemory = useDeleteMemory();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMemory, setEditingMemory] = useState<UserMemoryDTO | null>(null);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Group session memories by partner name
  const sessionMemoriesByPartner = memories?.session
    ? Object.entries(memories.session).reduce(
        (acc, [sessionId, sessionMemories]) => {
          sessionMemories.forEach((memory) => {
            const partnerName = memory.sessionPartnerName || 'Unknown Partner';
            if (!acc[partnerName]) {
              acc[partnerName] = [];
            }
            acc[partnerName].push(memory);
          });
          return acc;
        },
        {} as Record<string, UserMemoryDTO[]>
      )
    : {};

  const handleRequestEdit = useCallback((memory: UserMemoryDTO) => {
    setEditingMemory(memory);
  }, []);

  const handleDelete = useCallback(
    (memory: UserMemoryDTO) => {
      // Close the swipeable
      swipeableRefs.current.get(memory.id)?.close();

      Alert.alert(
        'Delete Memory',
        `Are you sure you want to delete this memory?\n\n"${memory.content}"`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMemory.mutateAsync(memory.id);
              } catch (error) {
                console.error('Failed to delete memory:', error);
                Alert.alert('Error', 'Failed to delete memory. Please try again.');
              }
            },
          },
        ]
      );
    },
    [deleteMemory]
  );

  const globalMemories = memories?.global ?? [];
  const hasAnyMemories =
    globalMemories.length > 0 || Object.keys(sessionMemoriesByPartner).length > 0;

  // Render loading state
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Things to Remember',
            headerShown: true,
            headerBackTitle: 'Back',
            headerStyle: {
              backgroundColor: colors.bgPrimary,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: '600',
              color: colors.textPrimary,
            },
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading memories...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Things to Remember',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.bgPrimary,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.textPrimary,
          },
        }}
      />

      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {!hasAnyMemories ? (
            // Empty state
            <View style={styles.emptyState}>
              <Star color={colors.accent} size={48} />
              <Text style={styles.emptyTitle}>No Memories Yet</Text>
              <Text style={styles.emptyDescription}>
                Tap the + button to add things you'd like me to remember, like your
                preferred name, communication style, or important context.
              </Text>
            </View>
          ) : (
            <>
              {/* Global Memories Section */}
              {globalMemories.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Star color={colors.accent} size={18} />
                    <Text style={styles.sectionTitle}>Global Memories</Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    These apply to all your sessions
                  </Text>
                  <View style={styles.memoryList}>
                    {globalMemories.map((memory) => (
                      <MemoryItem
                        key={memory.id}
                        memory={memory}
                        onRequestEdit={handleRequestEdit}
                        onDelete={handleDelete}
                        swipeableRef={(ref) => {
                          if (ref) {
                            swipeableRefs.current.set(memory.id, ref);
                          } else {
                            swipeableRefs.current.delete(memory.id);
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Session Memories Sections */}
              {Object.entries(sessionMemoriesByPartner).map(([partnerName, partnerMemories]) => (
                <View key={partnerName} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <User color={colors.brandBlue} size={18} />
                    <Text style={styles.sectionTitle}>{partnerName}</Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    Specific to sessions with this partner
                  </Text>
                  <View style={styles.memoryList}>
                    {partnerMemories.map((memory) => (
                      <MemoryItem
                        key={memory.id}
                        memory={memory}
                        onRequestEdit={handleRequestEdit}
                        onDelete={handleDelete}
                        swipeableRef={(ref) => {
                          if (ref) {
                            swipeableRefs.current.set(memory.id, ref);
                          } else {
                            swipeableRefs.current.delete(memory.id);
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Floating Action Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowCreateModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Add new memory"
        >
          <Plus color={colors.textOnAccent} size={28} />
        </TouchableOpacity>
      </View>

      {/* Create Memory Modal */}
      <CreateMemoryModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Edit Memory Modal */}
      <EditMemoryModal
        visible={editingMemory !== null}
        memory={editingMemory}
        onClose={() => setEditingMemory(null)}
      />
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100, // Space for FAB
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgPage,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Section
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginLeft: 26,
  },
  memoryList: {
    gap: spacing.sm,
  },

  // Memory item
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  memoryContent: {
    flex: 1,
    gap: spacing.xs,
  },
  memoryText: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  memoryCategoryLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Delete action
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Modal
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

  // Current memory (in edit modal)
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

  // Error
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

  // Suggestion preview
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
  suggestionCategory: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  suggestionReasoning: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },

  // Modal buttons
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
