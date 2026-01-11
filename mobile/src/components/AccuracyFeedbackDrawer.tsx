/**
 * AccuracyFeedbackDrawer Component
 *
 * A drawer that displays the partner's empathy statement and allows
 * the user to provide feedback on its accuracy. Follows the same
 * pattern as ViewEmpathyStatementDrawer for consistency.
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, Minus, XCircle } from 'lucide-react-native';
import { colors } from '@/theme';

export interface AccuracyFeedbackDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The partner's empathy statement */
  statement: string;
  /** Partner's name */
  partnerName: string;
  /** Callback when "Accurate" is tapped */
  onAccurate: () => void;
  /** Callback when "Partially accurate" is tapped */
  onPartiallyAccurate: () => void;
  /** Callback when "Not quite" is tapped */
  onInaccurate: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

export function AccuracyFeedbackDrawer({
  visible,
  statement,
  partnerName,
  onAccurate,
  onPartiallyAccurate,
  onInaccurate,
  onClose,
}: AccuracyFeedbackDrawerProps) {
  const handleAccurate = () => {
    onAccurate();
    onClose();
  };

  const handlePartiallyAccurate = () => {
    onPartiallyAccurate();
    onClose();
  };

  const handleInaccurate = () => {
    onInaccurate();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="accuracy-feedback-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {/* Header with close button */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              testID="accuracy-feedback-close"
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
            <Text style={styles.title}>
              {partnerName}'s understanding
            </Text>
            <Text style={styles.subtitle}>
              {partnerName} shared this to show they understand your perspective. How well does it capture your experience?
            </Text>

            {/* Partner's empathy statement */}
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{statement}</Text>
            </View>

            {/* Feedback buttons */}
            <View style={styles.feedbackSection}>
              <Text style={styles.feedbackQuestion}>How accurate is this?</Text>

              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={handleAccurate}
                testID="accuracy-accurate-button"
                activeOpacity={0.8}
              >
                <View style={[styles.feedbackIcon, styles.accurateIcon]}>
                  <Check color="white" size={18} />
                </View>
                <View style={styles.feedbackTextContainer}>
                  <Text style={styles.feedbackButtonTitle}>Accurate</Text>
                  <Text style={styles.feedbackButtonDesc}>This captures my perspective well</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={handlePartiallyAccurate}
                testID="accuracy-partial-button"
                activeOpacity={0.8}
              >
                <View style={[styles.feedbackIcon, styles.partialIcon]}>
                  <Minus color="white" size={18} />
                </View>
                <View style={styles.feedbackTextContainer}>
                  <Text style={styles.feedbackButtonTitle}>Partially accurate</Text>
                  <Text style={styles.feedbackButtonDesc}>Some parts are right, but not all</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={handleInaccurate}
                testID="accuracy-inaccurate-button"
                activeOpacity={0.8}
              >
                <View style={[styles.feedbackIcon, styles.inaccurateIcon]}>
                  <XCircle color="white" size={18} />
                </View>
                <View style={styles.feedbackTextContainer}>
                  <Text style={styles.feedbackButtonTitle}>Not quite</Text>
                  <Text style={styles.feedbackButtonDesc}>This doesn't capture my perspective</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  feedbackSection: {
    gap: 12,
  },
  feedbackQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  feedbackIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accurateIcon: {
    backgroundColor: colors.success,
  },
  partialIcon: {
    backgroundColor: colors.warning,
  },
  inaccurateIcon: {
    backgroundColor: colors.error,
  },
  feedbackTextContainer: {
    flex: 1,
  },
  feedbackButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  feedbackButtonDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

export default AccuracyFeedbackDrawer;
