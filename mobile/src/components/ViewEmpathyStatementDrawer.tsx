/**
 * ViewEmpathyStatementDrawer Component
 *
 * A scrollable drawer that displays the full empathy statement.
 * Users can tap to open this drawer and see the complete text.
 * Two actions: Share (sends to partner) or Refine Further (open inline composer).
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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Send, MessageCircle } from 'lucide-react-native';
import { colors } from '@/theme';

export interface ViewEmpathyStatementDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The empathy statement content */
  statement: string;
  /** Partner's name */
  partnerName?: string;
  /** Whether user is revising after receiving shared context from partner */
  isRevising?: boolean;
  /** Callback when "Share" is tapped */
  onShare: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
  /** Callback when user sends a refinement request from the drawer */
  onSendRefinement?: (message: string) => void;
}

export function ViewEmpathyStatementDrawer({
  visible,
  statement,
  partnerName = 'your partner',
  isRevising = false,
  onShare,
  onClose,
  onSendRefinement,
}: ViewEmpathyStatementDrawerProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // When the refinement composer opens (and keyboard comes up), ensure we scroll the input into view.
  useEffect(() => {
    if (!isRefining) return;

    // Run a couple times to handle layout + keyboard timing differences across iOS/Android.
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
  }, [isRefining]);

  const handleSendRefinement = () => {
    const trimmed = refinementText.trim();
    if (!trimmed) return;

    onSendRefinement?.(trimmed);
    setRefinementText('');
    setIsRefining(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="view-empathy-statement-drawer"
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
              testID="view-empathy-close"
              accessibilityLabel="Close"
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          {/* Scrollable content - entire drawer scrolls */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {isRevising ? 'Revisit your understanding' : 'What you\'ll share'}
            </Text>
            <Text style={styles.subtitle}>
              {isRevising
                ? `${partnerName} shared some additional context to help you understand their experience better. Take a moment to consider if you'd like to update what you'll share with them.`
                : `This is what you'll share with ${partnerName} to show you understand their perspective.`}
            </Text>

            {/* Empathy statement - styled subtly */}
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{statement}</Text>
            </View>

            {isRefining ? (
              <View style={styles.refineComposer}>
                <View style={styles.refineComposerHeader}>
                  <Text style={styles.refineComposerTitle}>How would you like to tweak this?</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsRefining(false);
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
                  placeholder="Tell the AI what to change or add..."
                  placeholderTextColor={colors.textMuted}
                  value={refinementText}
                  onChangeText={setRefinementText}
                  autoFocus
                  onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                  testID="refine-empathy-input"
                />
                <TouchableOpacity
                  style={[
                    styles.sendRefineButton,
                    !refinementText.trim() && styles.sendRefineButtonDisabled,
                  ]}
                  onPress={handleSendRefinement}
                  disabled={!refinementText.trim()}
                  activeOpacity={0.8}
                  testID="send-refine-empathy-button"
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
                  onPress={() => setIsRefining(true)}
                  testID="refine-empathy-button"
                  activeOpacity={0.8}
                >
                  <MessageCircle color={colors.textSecondary} size={20} />
                  <Text style={styles.refineButtonText}>Refine further</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={onShare}
                  testID="share-empathy-button"
                  activeOpacity={0.8}
                >
                  <Send color="white" size={20} />
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>
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
  messageText: {
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  footer: {
    flexDirection: 'row',
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
    flex: 1,
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
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBlue,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
});

export default ViewEmpathyStatementDrawer;
