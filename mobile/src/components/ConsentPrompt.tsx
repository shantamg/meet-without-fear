/**
 * ConsentPrompt Component
 *
 * Asks for explicit consent before sharing sensitive information.
 * Supports two modes:
 * - Simplified: Simple consent/decline (2 options)
 * - Full: 4 granular sharing options: full, summary, theme, or private
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export type SharingOption = 'full' | 'summary' | 'theme' | 'private';

interface SharingOptionConfig {
  id: SharingOption;
  title: string;
  description: string;
}

interface ConsentPromptProps {
  title: string;
  description: string;
  onSelect: (option: SharingOption) => void;
  insight?: string;
  style?: ViewStyle;
  testID?: string;
  /** When true, shows simplified consent/decline options instead of 4 granular options */
  simplified?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SHARING_OPTIONS: SharingOptionConfig[] = [
  {
    id: 'full',
    title: 'Share full reflection',
    description: 'Partner sees exactly what you wrote',
  },
  {
    id: 'summary',
    title: 'Share summary only',
    description: 'Brief AI-generated version',
  },
  {
    id: 'theme',
    title: 'Share just the theme',
    description: 'Only the core need identified',
  },
  {
    id: 'private',
    title: 'Keep private',
    description: 'Stays between you and AI',
  },
];

const SIMPLIFIED_OPTIONS: SharingOptionConfig[] = [
  {
    id: 'full',
    title: 'Share with partner',
    description: 'Your partner will see your attempt',
  },
  {
    id: 'private',
    title: 'Keep editing',
    description: 'Continue working on your understanding',
  },
];

// ============================================================================
// Component
// ============================================================================

export function ConsentPrompt({
  title,
  description,
  onSelect,
  insight,
  style,
  testID,
  simplified = false,
}: ConsentPromptProps) {
  const [selectedOption, setSelectedOption] = useState<SharingOption | null>(null);

  const handleConfirm = () => {
    if (selectedOption) {
      onSelect(selectedOption);
    }
  };

  // Use simplified options when in simplified mode
  const options = simplified ? SIMPLIFIED_OPTIONS : SHARING_OPTIONS;

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {insight && (
        <View style={styles.insightContainer}>
          <Text style={styles.insightLabel}>Your reflection:</Text>
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      )}

      <View style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = selectedOption === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected,
              ]}
              onPress={() => setSelectedOption(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
            >
              <View style={styles.radioContainer}>
                <View
                  style={[
                    styles.radioOuter,
                    isSelected && styles.radioOuterSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedOption && (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={handleConfirm}
          accessibilityRole="button"
        >
          <Text style={styles.confirmText}>Confirm choice</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.textPrimary,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  insightContainer: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  insightLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  optionCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
  },
  radioContainer: {
    marginRight: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
  },
  optionContent: {
    flex: 1,
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
  confirmButton: {
    marginTop: 16,
    padding: 14,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ConsentPrompt;
