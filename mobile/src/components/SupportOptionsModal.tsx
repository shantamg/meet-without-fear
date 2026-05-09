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

import { View, Text, TouchableOpacity, Pressable, StyleSheet, Modal } from 'react-native';
import { designFonts, useAppAppearance } from '@/theme';

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
  const { palette } = useAppAppearance();
  const styles = makeStyles(palette);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      testID="support-options-modal"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            It's okay to pause and take care of yourself. What would help right now?
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: palette.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
    color: palette.text,
    marginBottom: 16,
    fontFamily: designFonts.sans,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: palette.bgPane,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 2,
    fontFamily: designFonts.sans,
  },
  optionDescription: {
    fontSize: 12,
    color: palette.textMuted,
    fontFamily: designFonts.sans,
  },
});

export default SupportOptionsModal;
