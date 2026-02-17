/**
 * ShareTopicDrawer Component
 *
 * A full-screen drawer that displays the reconciler's topic suggestion
 * for the subject to share additional context with their partner.
 *
 * This is Phase 1 of the two-phase share flow:
 * 1. ShareTopicPanel shows topic → User taps → Opens ShareTopicDrawer
 * 2. If user accepts → AI generates draft via chat → Opens ShareSuggestionDrawer
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Lightbulb } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface ShareTopicDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** Reconciler action type - affects language and styling */
  action: 'OFFER_SHARING' | 'OFFER_OPTIONAL';
  /** Partner's name */
  partnerName: string;
  /** The reconciler's suggested focus topic */
  suggestedShareFocus: string;
  /** Callback when "Yes, help me share" is tapped */
  onAccept: () => void;
  /** Callback when "No thanks" is confirmed */
  onDecline: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ShareTopicDrawer({
  visible,
  action,
  partnerName,
  suggestedShareFocus,
  onAccept,
  onDecline,
  onClose,
}: ShareTopicDrawerProps) {
  // Use orange for OFFER_SHARING (significant gaps), blue for OFFER_OPTIONAL (moderate gaps)
  const iconColor = action === 'OFFER_SHARING' ? colors.warning : colors.brandBlue;
  const actionTextColor = action === 'OFFER_SHARING' ? colors.warning : colors.brandBlue;

  // Action-specific suffix text
  const actionSuffix = action === 'OFFER_SHARING'
    ? 'you share more about:'
    : 'you might consider sharing about:';

  const handleDecline = () => {
    // Show confirmation dialog before declining
    Alert.alert(
      'Are you sure?',
      `Sharing this could help ${partnerName} understand you better.`,
      [
        {
          text: 'Go back',
          style: 'cancel',
        },
        {
          text: 'Continue without sharing',
          style: 'destructive',
          onPress: onDecline,
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="share-topic-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {/* Header with close button */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              testID="share-topic-close"
              accessibilityLabel="Close"
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Lightbulb color={iconColor} size={48} />
            </View>

            {/* Title */}
            <Text style={styles.title}>Share suggestion</Text>

            {/* Intro text */}
            <Text style={styles.intro}>
              Our internal reconciler has reviewed what {partnerName} is imagining you are feeling,
              noted some of the things you have talked about, and has suggested that{' '}
              <Text style={[styles.actionText, { color: actionTextColor }]}>
                {actionSuffix}
              </Text>
            </Text>

            {/* Suggested Focus label */}
            <Text style={styles.focusLabel}>SUGGESTED FOCUS</Text>

            {/* Topic container */}
            <View style={styles.topicContainer}>
              <Text style={styles.topicText}>{suggestedShareFocus}</Text>
            </View>
          </ScrollView>

          {/* Action buttons - fixed at bottom */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              testID="share-topic-accept"
            >
              <Text style={styles.acceptButtonText}>Yes, help me share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.declineButton}
              onPress={handleDecline}
              testID="share-topic-decline"
            >
              <Text style={styles.declineButtonText}>No thanks</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  intro: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  actionText: {
    fontWeight: '600',
  },
  focusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  topicContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  acceptButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});

export default ShareTopicDrawer;
