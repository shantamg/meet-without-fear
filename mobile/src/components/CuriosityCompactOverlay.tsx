/**
 * CuriosityCompactOverlay Component
 *
 * Full-screen modal overlay for the Curiosity Compact that appears when
 * entering a session. User must scroll to see the sign button.
 * Cannot be dismissed, but user can navigate back to home.
 */

import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompactTerms } from './CompactTerms';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface CuriosityCompactOverlayProps {
  visible: boolean;
  onSign: () => void;
  onNavigateBack?: () => void;
  isPending?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function CuriosityCompactOverlay({
  visible,
  onSign,
  onNavigateBack,
  isPending = false,
}: CuriosityCompactOverlayProps) {
  const styles = useStyles();
  const [agreed, setAgreed] = useState(false);

  const handleSign = () => {
    onSign();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      testID="curiosity-compact-modal"
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header with back button */}
        <View style={styles.header}>
          {onNavigateBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onNavigateBack}
              testID="compact-back-button"
            >
              <Text style={styles.backButtonText}>← Back to home</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.title}>The Curiosity Compact</Text>
          <Text style={styles.subtitle}>
            Before we begin, please review and agree to these commitments
          </Text>

          <View style={styles.termsContainer}>
            <CompactTerms />
          </View>

          {/* Checkbox and sign button at the bottom */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              testID="agree-checkbox"
              style={styles.checkbox}
              onPress={() => setAgreed(!agreed)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
            >
              <View style={[styles.checkboxBox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>&#10003;</Text>}
              </View>
              <Text style={styles.checkboxLabel}>I agree to proceed with curiosity</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.signButton, !agreed && styles.signButtonDisabled]}
              onPress={handleSign}
              disabled={!agreed || isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: !agreed || isPending }}
              testID="sign-compact-button"
            >
              <Text style={styles.signButtonText}>
                {isPending ? 'Signing...' : 'Sign and Begin'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.questionsButton}>
              <Text style={styles.questionsText}>I have questions</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    backButton: {
      paddingVertical: 8,
    },
    backButtonText: {
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 24,
      paddingBottom: 48,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 12,
      color: t.colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: t.colors.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 24,
    },
    termsContainer: {
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      padding: 20,
      marginBottom: 32,
    },
    actionContainer: {
      marginTop: 16,
    },
    checkbox: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      paddingHorizontal: 4,
    },
    checkboxBox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: t.colors.accent,
      borderColor: t.colors.accent,
    },
    checkmark: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
    },
    checkboxLabel: {
      marginLeft: 14,
      fontSize: 16,
      color: t.colors.textPrimary,
      flex: 1,
    },
    signButton: {
      backgroundColor: t.colors.accent,
      padding: 18,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    signButtonDisabled: {
      backgroundColor: t.colors.textMuted,
    },
    signButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: '600',
    },
    questionsButton: {
      alignItems: 'center',
      padding: 12,
    },
    questionsText: {
      color: t.colors.accent,
      fontSize: 15,
    },
  }));

export default CuriosityCompactOverlay;
