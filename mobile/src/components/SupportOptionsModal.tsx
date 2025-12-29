/**
 * SupportOptionsModal Component
 *
 * A modal that appears when users report intense emotions (>= 8-9 on the slider).
 * Offers 5 support options matching the demo:
 * 1. Keep sharing - continue the conversation
 * 2. Breathing exercise - 4-7-8 guided breathing
 * 3. Grounding exercise - 5-4-3-2-1 senses check
 * 4. Body scan - check in with physical sensations
 * 5. Take a break - pause the session
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { colors } from '@/theme';

export type SupportOption =
  | 'keep-sharing'
  | 'breathing'
  | 'grounding'
  | 'body-scan'
  | 'break';

interface SupportOptionItem {
  id: SupportOption;
  title: string;
  description: string;
}

const SUPPORT_OPTIONS: SupportOptionItem[] = [
  {
    id: 'keep-sharing',
    title: 'Keep sharing',
    description: 'Getting it out is helping',
  },
  {
    id: 'breathing',
    title: 'Breathing exercise',
    description: '2 minute guided breathing',
  },
  {
    id: 'grounding',
    title: 'Grounding exercise',
    description: '5-4-3-2-1 senses check',
  },
  {
    id: 'body-scan',
    title: 'Body scan',
    description: 'Check in with physical sensations',
  },
  {
    id: 'break',
    title: 'Take a break',
    description: 'Come back when ready',
  },
];

export interface SupportOptionsModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when an option is selected */
  onSelectOption: (option: SupportOption) => void;
  /** Callback when modal is dismissed */
  onClose: () => void;
}

export function SupportOptionsModal({
  visible,
  onSelectOption,
  onClose,
}: SupportOptionsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      testID="support-options-modal"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            I can feel how intense this is. That makes complete sense given what
            you're working through.
          </Text>

          <View style={styles.optionsContainer}>
            {SUPPORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.optionButton}
                onPress={() => onSelectOption(option.id)}
                testID={`support-option-${option.id}`}
                activeOpacity={0.7}
              >
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

export default SupportOptionsModal;
