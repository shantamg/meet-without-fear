/**
 * Stage 4 Sub-chat Drawer (Phase 3).
 *
 * An ephemeral, anchor-scoped chat surface rendered above the main Stage 4
 * drawer. Three anchor kinds, each with its own action cluster:
 *   - NEEDS_BRAINSTORM     — accept new proposal drafts (linked to the anchor need)
 *   - PROPOSAL_REFINEMENT  — edit a single existing proposal in place
 *   - NO_OVERLAP           — accept new drafts and/or edit existing proposals
 *
 * The drafts list is user-driven in Phase 3 (Phase 6 will move to AI-surfaced
 * structured drafts). "Save & close" resolves the sub-chat with the structured
 * payload and triggers a Stage 4 inventory refresh.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Send, Plus, Trash2, Check } from 'lucide-react-native';
import {
  Stage4ProposalDraft,
  Stage4SubChatAnchor,
  Stage4SubChatDTO,
} from '@meet-without-fear/shared';
import { appWidthStyle, modalPageStyle, useAppAppearance } from '@/theme';

export interface Stage4SubChatDrawerProps {
  visible: boolean;
  subChat: Stage4SubChatDTO | null;
  /** Friendly label for the anchor (need label or proposal description). */
  anchorLabel?: string | null;
  /** Existing proposal text when anchor is PROPOSAL_REFINEMENT, used as initial edit value. */
  initialProposalText?: string | null;
  isSending?: boolean;
  isResolving?: boolean;
  onSendMessage: (content: string) => void;
  onResolve: (payload: {
    acceptedProposals: Stage4ProposalDraft[];
    updatedProposals: Stage4ProposalDraft[];
  }) => void;
  onClose: () => void;
  testID?: string;
}

function headerTitleForAnchor(anchor: Stage4SubChatAnchor, anchorLabel?: string | null): string {
  switch (anchor) {
    case Stage4SubChatAnchor.NEEDS_BRAINSTORM:
      return `Brainstorming for: ${anchorLabel ?? 'this need'}`;
    case Stage4SubChatAnchor.PROPOSAL_REFINEMENT:
      return `Refining: ${anchorLabel ?? 'this proposal'}`;
    case Stage4SubChatAnchor.NO_OVERLAP:
      return 'Refining together — keep going with MWF';
  }
}

export function Stage4SubChatDrawer({
  visible,
  subChat,
  anchorLabel,
  initialProposalText,
  isSending = false,
  isResolving = false,
  onSendMessage,
  onResolve,
  onClose,
  testID = 'stage4-subchat-drawer',
}: Stage4SubChatDrawerProps) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const anchor = subChat?.anchorKind ?? Stage4SubChatAnchor.NEEDS_BRAINSTORM;
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<Stage4ProposalDraft[]>([]);
  const [draftText, setDraftText] = useState('');
  const [proposalEdit, setProposalEdit] = useState<string>(initialProposalText ?? '');

  // Reset internal state when sub-chat changes.
  React.useEffect(() => {
    setInput('');
    setDrafts([]);
    setDraftText('');
    setProposalEdit(initialProposalText ?? '');
  }, [subChat?.id, initialProposalText]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  }, [input, onSendMessage]);

  const handleAddDraft = useCallback(() => {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    setDrafts((d) => [...d, { description: trimmed }]);
    setDraftText('');
  }, [draftText]);

  const handleRemoveDraft = useCallback((index: number) => {
    setDrafts((d) => d.filter((_, i) => i !== index));
  }, []);

  const handleResolve = useCallback(() => {
    const accepted: Stage4ProposalDraft[] = [];
    const updated: Stage4ProposalDraft[] = [];
    if (anchor === Stage4SubChatAnchor.NEEDS_BRAINSTORM) {
      accepted.push(...drafts);
    } else if (anchor === Stage4SubChatAnchor.PROPOSAL_REFINEMENT) {
      if (subChat?.anchorId && proposalEdit.trim()) {
        updated.push({ proposalId: subChat.anchorId, description: proposalEdit.trim() });
      }
    } else {
      accepted.push(...drafts);
      if (subChat?.anchorId && proposalEdit.trim()) {
        updated.push({ proposalId: subChat.anchorId, description: proposalEdit.trim() });
      }
    }
    onResolve({ acceptedProposals: accepted, updatedProposals: updated });
  }, [anchor, drafts, onResolve, proposalEdit, subChat?.anchorId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalPage}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
            <Text style={styles.headerTitle} numberOfLines={2} testID={`${testID}-header`}>
              {headerTitleForAnchor(anchor, anchorLabel)}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel="Close sub-chat"
            >
              <X color={palette.text} size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            testID={`${testID}-messages`}
          >
            {(subChat?.messages ?? []).length === 0 ? (
              <Text style={styles.emptyText}>
                Start with what you're noticing — MWF will stay scoped to this anchor.
              </Text>
            ) : (
              subChat!.messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageBubble,
                    String(m.role) === 'USER' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  <Text style={styles.messageText}>{m.content}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message"
              placeholderTextColor={palette.textFaint}
              testID={`${testID}-input`}
              editable={!isSending}
              multiline
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!input.trim() || isSending}
              style={[styles.sendButton, (!input.trim() || isSending) && styles.sendButtonDisabled]}
              testID={`${testID}-send`}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={palette.bg} />
              ) : (
                <Send size={18} color={palette.bg} />
              )}
            </TouchableOpacity>
          </View>

          {/* Anchor-specific action cluster */}
          <View style={styles.actionCluster} testID={`${testID}-actions`}>
            {anchor === Stage4SubChatAnchor.PROPOSAL_REFINEMENT ? (
              <View testID={`${testID}-proposal-edit`}>
                <Text style={styles.clusterTitle}>Edit this proposal</Text>
                <TextInput
                  style={styles.draftInput}
                  value={proposalEdit}
                  onChangeText={setProposalEdit}
                  placeholder="Reshape the proposal in your own words"
                  placeholderTextColor={palette.textFaint}
                  multiline
                  testID={`${testID}-proposal-input`}
                />
              </View>
            ) : null}

            {anchor === Stage4SubChatAnchor.NO_OVERLAP ? (
              <View testID={`${testID}-proposal-edit-optional`}>
                <Text style={styles.clusterTitle}>Optionally tweak an existing proposal</Text>
                <TextInput
                  style={styles.draftInput}
                  value={proposalEdit}
                  onChangeText={setProposalEdit}
                  placeholder="New wording (leave blank to skip)"
                  placeholderTextColor={palette.textFaint}
                  multiline
                  testID={`${testID}-proposal-input`}
                />
              </View>
            ) : null}

            {(anchor === Stage4SubChatAnchor.NEEDS_BRAINSTORM ||
              anchor === Stage4SubChatAnchor.NO_OVERLAP) && (
              <View testID={`${testID}-drafts`}>
                <Text style={styles.clusterTitle}>Accepted proposals to add</Text>
                {drafts.length === 0 ? (
                  <Text style={styles.emptyDrafts}>No accepted proposals yet.</Text>
                ) : (
                  drafts.map((d, i) => (
                    <View key={i} style={styles.draftRow} testID={`${testID}-draft-${i}`}>
                      <Check size={16} color={palette.accent} />
                      <Text style={styles.draftRowText} numberOfLines={3}>
                        {d.description}
                      </Text>
                      <Pressable
                        onPress={() => handleRemoveDraft(i)}
                        hitSlop={8}
                        testID={`${testID}-draft-${i}-remove`}
                        accessibilityRole="button"
                        accessibilityLabel="Discard draft"
                      >
                        <Trash2 size={16} color={palette.textMuted} />
                      </Pressable>
                    </View>
                  ))
                )}
                <View style={styles.draftAddRow}>
                  <TextInput
                    style={styles.draftInput}
                    value={draftText}
                    onChangeText={setDraftText}
                    placeholder="Describe a concrete experiment to add"
                    placeholderTextColor={palette.textFaint}
                    multiline
                    testID={`${testID}-draft-input`}
                  />
                  <TouchableOpacity
                    onPress={handleAddDraft}
                    disabled={!draftText.trim()}
                    style={[
                      styles.addDraftButton,
                      !draftText.trim() && styles.addDraftButtonDisabled,
                    ]}
                    testID={`${testID}-draft-accept`}
                    accessibilityRole="button"
                    accessibilityLabel="Accept this draft"
                  >
                    <Plus size={16} color={palette.bg} />
                    <Text style={styles.addDraftButtonText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={handleResolve}
              disabled={isResolving}
              style={[styles.saveButton, isResolving && styles.saveButtonDisabled]}
              testID={`${testID}-save`}
              accessibilityRole="button"
              accessibilityLabel="Save and close"
            >
              {isResolving ? (
                <ActivityIndicator size="small" color={palette.bg} />
              ) : (
                <Text style={styles.saveButtonText}>Save & close</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) =>
  StyleSheet.create({
    modalPage: { ...modalPageStyle },
    container: { flex: 1, backgroundColor: palette.bg, ...appWidthStyle },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 12,
    },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: palette.text },
    messageList: { flex: 1 },
    messageListContent: { padding: 16, gap: 8 },
    emptyText: { color: palette.textMuted, fontStyle: 'italic' },
    messageBubble: {
      maxWidth: '85%',
      padding: 10,
      borderRadius: 12,
    },
    userBubble: { alignSelf: 'flex-end', backgroundColor: palette.accent },
    aiBubble: { alignSelf: 'flex-start', backgroundColor: palette.bgElev },
    messageText: { color: palette.text, fontSize: 15, lineHeight: 21 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: palette.bgElev,
      color: palette.text,
      fontSize: 15,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.5 },
    actionCluster: {
      borderTopWidth: 1,
      borderTopColor: palette.border,
      padding: 12,
      gap: 10,
    },
    clusterTitle: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: 6,
    },
    emptyDrafts: { color: palette.textFaint, fontSize: 13 },
    draftRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    draftRowText: { flex: 1, color: palette.text, fontSize: 14 },
    draftAddRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
    draftInput: {
      flex: 1,
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: palette.bgElev,
      color: palette.text,
      fontSize: 14,
    },
    addDraftButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: palette.accent,
    },
    addDraftButtonDisabled: { opacity: 0.5 },
    addDraftButtonText: { color: palette.bg, fontWeight: '600' },
    saveButton: {
      marginTop: 6,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: palette.accent,
      alignItems: 'center',
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: palette.bg, fontWeight: '700', fontSize: 15 },
  });

export default Stage4SubChatDrawer;
