/**
 * ShareSuggestionCard Component
 *
 * Displays a share suggestion from the reconciler with Accept/Edit/Decline actions.
 * Includes inline refinement mode for editing the suggestion.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Send, MessageCircle, X } from 'lucide-react-native';
import { colors } from '@/theme';
import { ShareSuggestionDTO } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface ShareSuggestionCardProps {
  /** The share suggestion data */
  suggestion: ShareSuggestionDTO;
  /** Partner's name (the guesser) */
  partnerName: string;
  /** Callback when "Share this" is tapped */
  onShare: () => void;
  /** Callback when "No thanks" is tapped */
  onDecline: () => void;
  /** Callback when user sends a refinement request */
  onRefine: (message: string) => void;
  /** Whether a refinement is in progress */
  isRefining?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ShareSuggestionCard({
  suggestion,
  partnerName,
  onShare,
  onDecline,
  onRefine,
  isRefining = false,
  style,
  testID = 'share-suggestion-card',
}: ShareSuggestionCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleEditPress = () => {
    setEditMode(true);
    // Focus the input after render
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setRefinementText('');
  };

  const handleSendRefinement = () => {
    const trimmed = refinementText.trim();
    if (!trimmed) return;

    // Prepend context to the message
    const refinementMessage = `Regarding what I'll share with ${partnerName}: ${trimmed}`;
    onRefine(refinementMessage);
    setRefinementText('');
    setEditMode(false);
  };

  // Determine header text based on action type
  const getHeaderText = () => {
    if (suggestion.action === 'OFFER_SHARING') {
      return `Help ${partnerName} understand you better`;
    }
    return 'Share something to build understanding';
  };

  return (
    <View style={[styles.card, style]} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{getHeaderText()}</Text>
        {suggestion.action === 'OFFER_SHARING' && (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentText}>Recommended</Text>
          </View>
        )}
      </View>

      {/* Context */}
      <Text style={styles.contextText}>
        Based on the conversation so far, here's a draft of something you could share.
      </Text>

      {/* Suggested content */}
      <View style={styles.suggestionContainer}>
        <Text style={styles.suggestionLabel}>SUGGESTED TO SHARE</Text>
        <Text style={styles.suggestionContent}>"{suggestion.suggestedContent}"</Text>
      </View>

      {/* Reason (if provided) */}
      {suggestion.reason && (
        <Text style={styles.reasonText}>{suggestion.reason}</Text>
      )}

      {/* Edit mode */}
      {editMode ? (
        <View style={styles.refineSection}>
          <View style={styles.refineHeader}>
            <Text style={styles.refineTitle}>How would you like to change this?</Text>
            <TouchableOpacity
              onPress={handleCancelEdit}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID={`${testID}-cancel-edit`}
            >
              <X color={colors.textSecondary} size={20} />
            </TouchableOpacity>
          </View>

          <TextInput
            ref={inputRef}
            style={styles.refineInput}
            multiline
            placeholder="Tell the AI what to change or add..."
            placeholderTextColor={colors.textMuted}
            value={refinementText}
            onChangeText={setRefinementText}
            editable={!isRefining}
            testID={`${testID}-refine-input`}
          />

          <TouchableOpacity
            style={[
              styles.sendRefineButton,
              (!refinementText.trim() || isRefining) && styles.sendRefineButtonDisabled,
            ]}
            onPress={handleSendRefinement}
            disabled={!refinementText.trim() || isRefining}
            activeOpacity={0.8}
            testID={`${testID}-send-refine`}
          >
            {isRefining ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Send
                color={refinementText.trim() ? 'white' : colors.textMuted}
                size={18}
              />
            )}
            <Text
              style={[
                styles.sendRefineButtonText,
                (!refinementText.trim() || isRefining) && styles.sendRefineButtonTextDisabled,
              ]}
            >
              {isRefining ? 'Updating...' : 'Send and update'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Action buttons */
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={onDecline}
            activeOpacity={0.7}
            testID={`${testID}-decline`}
          >
            <Text style={styles.declineButtonText}>No thanks</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditPress}
            activeOpacity={0.7}
            testID={`${testID}-edit`}
          >
            <MessageCircle color={colors.textSecondary} size={18} />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={onShare}
            activeOpacity={0.8}
            testID={`${testID}-share`}
          >
            <Send color="white" size={18} />
            <Text style={styles.shareButtonText}>Share this</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  urgentBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  urgentText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textOnAccent,
    textTransform: 'uppercase',
  },
  contextText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  suggestionContainer: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandBlue,
    padding: 12,
    marginBottom: 12,
  },
  suggestionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  suggestionContent: {
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  reasonText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  declineButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.bgTertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.brandBlue,
    borderRadius: 20,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  refineSection: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    gap: 12,
  },
  refineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  refineInput: {
    minHeight: 80,
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendRefineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.brandBlue,
    borderRadius: 20,
  },
  sendRefineButtonDisabled: {
    backgroundColor: colors.bgSecondary,
  },
  sendRefineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  sendRefineButtonTextDisabled: {
    color: colors.textMuted,
  },
});

export default ShareSuggestionCard;
