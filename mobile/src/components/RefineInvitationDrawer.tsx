/**
 * RefineInvitationDrawer Component
 *
 * A full-screen drawer that allows users to refine and resend their
 * invitation message. Features inline refinement input similar to
 * the empathy statement drawer.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Send, MessageCircle } from 'lucide-react-native';
import { colors } from '@/theme';
import { InvitationShareButton } from './InvitationShareButton';

export interface RefineInvitationDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The current invitation message */
  invitationMessage: string;
  /** The invitation URL */
  invitationUrl: string;
  /** Partner's name */
  partnerName?: string;
  /** Sender's name (current user) */
  senderName?: string;
  /** Whether a refinement is in progress */
  isRefining?: boolean;
  /** Callback when user sends a refinement request */
  onSendRefinement?: (message: string) => void;
  /** Callback when share is successful */
  onShareSuccess?: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

export function RefineInvitationDrawer({
  visible,
  invitationMessage,
  invitationUrl,
  partnerName,
  senderName,
  isRefining: isRefiningProp = false,
  onSendRefinement,
  onShareSuccess,
  onClose,
}: RefineInvitationDrawerProps) {
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset state when drawer closes
  useEffect(() => {
    if (!visible) {
      setShowRefineInput(false);
      setRefinementText('');
    }
  }, [visible]);

  // Scroll to bottom when refine input opens
  useEffect(() => {
    if (!showRefineInput) return;

    const raf = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    const t = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [showRefineInput]);

  const handleSendRefinement = () => {
    const trimmed = refinementText.trim();
    if (!trimmed || !onSendRefinement) return;

    onSendRefinement(trimmed);
    setRefinementText('');
    setShowRefineInput(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="refine-invitation-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {/* Header with close button */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                testID="refine-invitation-close"
                accessibilityLabel="Close"
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {/* Scrollable content */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.title}>Would you like to resend the invitation?</Text>
              <Text style={styles.subtitle}>
                I can help you refine the message now that we've had more time to
                process what you're feeling.
              </Text>

              {/* Current invitation message */}
              <View style={styles.messageContainer}>
                <Text style={styles.messageLabel}>Current invitation:</Text>
                {isRefiningProp ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.loadingText}>Refining your invitation...</Text>
                  </View>
                ) : (
                  <Text style={styles.messageText}>"{invitationMessage}"</Text>
                )}
              </View>

              {showRefineInput ? (
                <View style={styles.refineComposer}>
                  <View style={styles.refineComposerHeader}>
                    <Text style={styles.refineComposerTitle}>How would you like to change it?</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowRefineInput(false);
                        setRefinementText('');
                      }}
                      accessibilityLabel="Close refinement"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      testID="close-refine-composer"
                    >
                      <X color={colors.textSecondary} size={20} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.refineInput}
                    multiline
                    placeholder="Tell the AI what to change (e.g., 'make it warmer' or 'focus more on wanting to understand')..."
                    placeholderTextColor={colors.textMuted}
                    value={refinementText}
                    onChangeText={setRefinementText}
                    autoFocus
                    onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    testID="refine-invitation-input"
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendRefineButton,
                      !refinementText.trim() && styles.sendRefineButtonDisabled,
                    ]}
                    onPress={handleSendRefinement}
                    disabled={!refinementText.trim()}
                    activeOpacity={0.8}
                    testID="send-refine-invitation-button"
                  >
                    <Send color={refinementText.trim() ? 'white' : colors.textMuted} size={20} />
                    <Text
                      style={[
                        styles.sendRefineButtonText,
                        !refinementText.trim() && styles.sendRefineButtonTextDisabled,
                      ]}
                    >
                      Send and update
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.refineButton}
                    onPress={() => setShowRefineInput(true)}
                    testID="refine-invitation-button"
                    activeOpacity={0.8}
                    disabled={isRefiningProp}
                  >
                    <MessageCircle color={colors.textSecondary} size={20} />
                    <Text style={styles.refineButtonText}>Refine invitation</Text>
                  </TouchableOpacity>
                  <View style={styles.shareButtonWrapper}>
                    <InvitationShareButton
                      invitationMessage={invitationMessage}
                      invitationUrl={invitationUrl}
                      partnerName={partnerName}
                      senderName={senderName}
                      onShareSuccess={onShareSuccess}
                      testID="refine-invitation-share"
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeButton: {
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  messageContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandBlue,
    padding: 20,
    marginBottom: 32,
  },
  messageLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  footer: {
    gap: 12,
  },
  refineComposer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  refineComposerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refineComposerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  refineInput: {
    minHeight: 100,
    backgroundColor: colors.bgPrimary,
    borderRadius: 12,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendRefineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBlue,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 8,
  },
  sendRefineButtonDisabled: {
    backgroundColor: colors.bgSecondary,
  },
  sendRefineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  sendRefineButtonTextDisabled: {
    color: colors.textMuted,
  },
  refineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  refineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  shareButtonWrapper: {
    marginHorizontal: -16, // Offset the padding to make share button full width
  },
});
