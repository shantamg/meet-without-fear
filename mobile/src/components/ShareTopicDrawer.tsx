/**
 * ShareTopicDrawer Component
 *
 * A full-screen drawer that shows the suggested topic to share about
 * and lets the user choose to accept or decline.
 *
 * This is Phase 1 of the two-phase share flow:
 * 1. Shows intro text explaining the reconciler reviewed the empathy guess
 * 2. Displays the suggestedShareFocus topic
 * 3. User chooses "Yes, help me share" or "No thanks"
 *
 * Language and styling differ based on action:
 * - OFFER_SHARING: Strong language, orange/amber icon
 * - OFFER_OPTIONAL: Soft language, blue icon
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
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
  /** The guesser's name (the person trying to understand the subject) */
  guesserName: string;
  /** The suggested topic/area to share about */
  suggestedShareFocus: string;
  /** Reconciler action type - affects language and styling */
  action: 'OFFER_SHARING' | 'OFFER_OPTIONAL';
  /** Callback when user taps "Yes, help me share" */
  onAccept: () => void;
  /** Callback when user confirms decline */
  onDecline: () => void;
  /** Callback when drawer is closed without decision */
  onClose: () => void;
  /** Whether accept action is loading (generating draft) */
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ShareTopicDrawer({
  visible,
  guesserName,
  suggestedShareFocus,
  action,
  onAccept,
  onDecline,
  onClose,
  isLoading = false,
}: ShareTopicDrawerProps) {
  // Differentiate language based on action (US-2)
  const actionSuffix = action === 'OFFER_SHARING'
    ? 'you share more about:'
    : 'you might consider sharing about:';

  // Use orange for OFFER_SHARING (significant gaps), blue for OFFER_OPTIONAL (moderate gaps)
  const iconColor = action === 'OFFER_SHARING' ? colors.warning : colors.brandBlue;

  const handleDeclinePress = () => {
    // Show confirmation dialog (US-4)
    Alert.alert(
      'Are you sure?',
      `Sharing this could help ${guesserName} understand you better.`,
      [
        {
          text: 'Go back',
          style: 'cancel',
        },
        {
          text: 'Skip sharing',
          style: 'destructive',
          onPress: () => {
            onDecline();
            onClose();
          },
        },
      ]
    );
  };

  const handleAccept = () => {
    // Only call onAccept - the caller handles closing the drawer after async operation completes
    // This allows the drawer to stay open with loading state while draft is being generated
    onAccept();
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
            {/* Lightbulb icon */}
            <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
              <Lightbulb color={iconColor} size={32} />
            </View>

            {/* Intro text */}
            <Text style={styles.introText}>
              Our internal reconciler has reviewed what {guesserName} is imagining you are feeling,
              noted some of the things you have talked about, and has suggested that {actionSuffix}
            </Text>

            {/* Topic container */}
            <View style={[styles.topicContainer, { borderLeftColor: iconColor }]}>
              <Text style={styles.topicLabel}>SUGGESTED FOCUS</Text>
              <Text style={styles.topicText}>{suggestedShareFocus}</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDeclinePress}
                testID="share-topic-decline"
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={[styles.declineButtonText, isLoading && styles.disabledText]}>No thanks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, isLoading && styles.acceptButtonLoading]}
                onPress={handleAccept}
                testID="share-topic-accept"
                activeOpacity={0.8}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.acceptButtonText}>Yes, help me share</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  introText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  topicContainer: {
    width: '100%',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 20,
    marginBottom: 32,
  },
  topicLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  topicText: {
    fontSize: 17,
    color: colors.textPrimary,
    lineHeight: 26,
  },
  footer: {
    width: '100%',
    gap: 12,
  },
  declineButton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 24,
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  acceptButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBlue,
    borderRadius: 24,
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  acceptButtonLoading: {
    opacity: 0.7,
  },
  disabledText: {
    opacity: 0.5,
  },
});

export default ShareTopicDrawer;
