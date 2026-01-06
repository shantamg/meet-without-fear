/**
 * MemorySuggestionCard Component
 *
 * An inline card shown in chat when the AI detects a memory request.
 * Allows users to approve, edit, or dismiss memory suggestions.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Star, Check, Edit3, X } from 'lucide-react-native';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';
import { useApproveMemory, useRejectMemory } from '../hooks/useMemories';
import type { MemorySuggestion } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

interface MemorySuggestionCardProps {
  /** The memory suggestion from AI analysis */
  suggestion: MemorySuggestion;
  /** Session ID for session-scoped memories */
  sessionId?: string;
  /** Callback when the card is dismissed */
  onDismiss: () => void;
  /** Callback when a memory is approved */
  onApproved?: () => void;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function MemorySuggestionCard({
  suggestion,
  sessionId,
  onDismiss,
  onApproved,
  testID = 'memory-suggestion-card',
}: MemorySuggestionCardProps) {
  const styles = useStyles();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(suggestion.suggestedContent);

  // Animation for smooth appearance
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const approveMemory = useApproveMemory();
  const rejectMemory = useRejectMemory();

  const isLoading = approveMemory.isPending || rejectMemory.isPending;

  // Animate in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const animateOut = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(callback);
  };

  const handleApprove = async () => {
    try {
      await approveMemory.mutateAsync({
        suggestedContent: suggestion.suggestedContent,
        category: suggestion.category,
        sessionId: suggestion.scope === 'session' ? sessionId : undefined,
        editedContent:
          editedContent !== suggestion.suggestedContent ? editedContent : undefined,
      });
      animateOut(() => {
        onApproved?.();
        onDismiss();
      });
    } catch {
      // Error handling is done by the mutation
    }
  };

  const handleReject = async () => {
    try {
      await rejectMemory.mutateAsync({
        suggestedContent: suggestion.suggestedContent,
        category: suggestion.category,
      });
      animateOut(onDismiss);
    } catch {
      // Error handling is done by the mutation
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedContent(suggestion.suggestedContent);
    setIsEditing(false);
  };

  const getConfidenceLabel = (confidence: 'high' | 'medium' | 'low'): string => {
    switch (confidence) {
      case 'high':
        return 'High confidence';
      case 'medium':
        return 'Medium confidence';
      case 'low':
        return 'Low confidence';
    }
  };

  const getConfidenceStyle = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return styles.confidenceHigh;
      case 'medium':
        return styles.confidenceMedium;
      case 'low':
        return styles.confidenceLow;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      testID={testID}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Star size={16} color={colors.accent} fill={colors.accent} />
          <Text style={styles.headerText}>Remember this?</Text>
        </View>
        <Text style={[styles.confidenceBadge, getConfidenceStyle(suggestion.confidence)]}>
          {getConfidenceLabel(suggestion.confidence)}
        </Text>
      </View>

      {/* Content */}
      {isEditing ? (
        <View style={styles.editContainer}>
          <TextInput
            style={styles.editInput}
            value={editedContent}
            onChangeText={setEditedContent}
            multiline
            autoFocus
            placeholder="Edit memory..."
            placeholderTextColor={colors.textMuted}
            testID={`${testID}-edit-input`}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.editCancelButton}
              onPress={handleCancelEdit}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              testID={`${testID}-cancel-edit`}
            >
              <Text style={styles.editCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editSaveButton, isLoading && styles.buttonDisabled]}
              onPress={handleApprove}
              disabled={isLoading || !editedContent.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save memory"
              testID={`${testID}-save-edit`}
            >
              {approveMemory.isPending ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <Text style={styles.editSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.contentText}>"{suggestion.suggestedContent}"</Text>
      )}

      {/* Actions - only show when not editing */}
      {!isEditing && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, isLoading && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Approve memory"
            testID={`${testID}-approve`}
          >
            {approveMemory.isPending ? (
              <ActivityIndicator size="small" color={colors.textOnAccent} />
            ) : (
              <>
                <Check size={16} color={colors.textOnAccent} />
                <Text style={styles.approveText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.editButton, isLoading && styles.buttonDisabled]}
            onPress={handleEdit}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Edit memory"
            testID={`${testID}-edit`}
          >
            <Edit3 size={16} color={colors.textPrimary} />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.dismissButton, isLoading && styles.buttonDisabled]}
            onPress={handleReject}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Dismiss memory suggestion"
            testID={`${testID}-dismiss`}
          >
            {rejectMemory.isPending ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <X size={16} color={colors.textSecondary} />
                <Text style={styles.dismissText}>Not now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      padding: t.spacing.lg,
      marginVertical: t.spacing.md,
      marginHorizontal: t.spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.spacing.md,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    headerText: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
      color: colors.accent,
    },
    confidenceBadge: {
      fontSize: t.typography.fontSize.xs,
      paddingHorizontal: t.spacing.sm,
      paddingVertical: 2,
      borderRadius: t.radius.sm,
      overflow: 'hidden',
    },
    confidenceHigh: {
      backgroundColor: 'rgba(16, 163, 127, 0.2)',
      color: colors.success,
    },
    confidenceMedium: {
      backgroundColor: 'rgba(245, 166, 35, 0.2)',
      color: colors.accent,
    },
    confidenceLow: {
      backgroundColor: 'rgba(148, 163, 184, 0.2)',
      color: t.colors.textSecondary,
    },
    contentText: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
      fontStyle: 'italic',
      marginBottom: t.spacing.lg,
    },
    actions: {
      flexDirection: 'row',
      gap: t.spacing.sm,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.xs,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.sm,
      minHeight: 40,
    },
    approveButton: {
      backgroundColor: colors.accent,
      flex: 1,
    },
    approveText: {
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600',
      color: colors.textOnAccent,
    },
    editButton: {
      backgroundColor: t.colors.bgTertiary,
    },
    editButtonText: {
      fontSize: t.typography.fontSize.sm,
      fontWeight: '500',
      color: t.colors.textPrimary,
    },
    dismissButton: {
      backgroundColor: 'transparent',
    },
    dismissText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    // Edit mode styles
    editContainer: {
      marginBottom: t.spacing.md,
    },
    editInput: {
      backgroundColor: t.colors.bgTertiary,
      borderRadius: t.radius.sm,
      padding: t.spacing.md,
      fontSize: t.typography.fontSize.md,
      color: t.colors.textPrimary,
      minHeight: 60,
      textAlignVertical: 'top',
      marginBottom: t.spacing.md,
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: t.spacing.sm,
    },
    editCancelButton: {
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
    },
    editCancelText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
    editSaveButton: {
      backgroundColor: colors.accent,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      borderRadius: t.radius.sm,
      minWidth: 70,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editSaveText: {
      fontSize: t.typography.fontSize.sm,
      fontWeight: '600',
      color: colors.textOnAccent,
    },
  }));

export default MemorySuggestionCard;
