/**
 * ViewEmpathyStatementDrawer Component
 *
 * A full-screen drawer that displays the full empathy statement.
 * For longer statements that are truncated in the inline card,
 * users can tap to open this drawer and see the complete text.
 * To refine, they close the drawer and type instructions in chat.
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Send } from 'lucide-react-native';
import { colors } from '@/theme';

export interface ViewEmpathyStatementDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The empathy statement content */
  statement: string;
  /** Partner's name */
  partnerName?: string;
  /** Callback when "Share" is tapped */
  onShare: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

export function ViewEmpathyStatementDrawer({
  visible,
  statement,
  partnerName = 'your partner',
  onShare,
  onClose,
}: ViewEmpathyStatementDrawerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="view-empathy-statement-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.title}>Your understanding</Text>
          <Text style={styles.subtitle}>
            This is what you'll share with {partnerName} to show you understand their perspective.
            {'\n\n'}
            To make changes, close this and tell me what you'd like to adjust.
          </Text>

          {/* Scrollable empathy statement */}
          <View style={styles.messageContainer}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.messageText}>{statement}</Text>
            </ScrollView>
          </View>
        </View>

        {/* Footer with close and share buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.closeFooterButton}
            onPress={onClose}
            testID="close-empathy-button"
            activeOpacity={0.8}
          >
            <Text style={styles.closeFooterText}>Close</Text>
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
      </SafeAreaView>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
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
    flex: 1,
    backgroundColor: '#3D3500', // Dark yellow/amber background
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800', // Bright amber accent
    marginBottom: 24,
    maxHeight: 300,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  messageText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#FFE082', // Light amber for text
    lineHeight: 28,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  closeFooterButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  closeFooterText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default ViewEmpathyStatementDrawer;
