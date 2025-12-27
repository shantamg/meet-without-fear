/**
 * CuriosityCompact Component
 *
 * Stage 0 onboarding component where users review and agree to
 * the Curiosity Compact before beginning a session.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { CompactTerms } from './CompactTerms';
import { useSignCompact } from '../hooks/useStages';

// ============================================================================
// Types
// ============================================================================

interface CuriosityCompactProps {
  sessionId: string;
  onSign: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CuriosityCompact({ sessionId, onSign }: CuriosityCompactProps) {
  const [agreed, setAgreed] = useState(false);
  const { mutate: signCompact, isPending } = useSignCompact();

  const handleSign = () => {
    signCompact(
      { sessionId },
      {
        onSuccess: () => {
          onSign();
        },
      }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Curiosity Compact</Text>
      <Text style={styles.subtitle}>
        Before we begin, please review and agree to these commitments
      </Text>

      <View style={styles.termsContainer}>
        <CompactTerms />
      </View>

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
      >
        <Text style={styles.signButtonText}>
          {isPending ? 'Signing...' : 'Sign and Begin'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.questionsButton}>
        <Text style={styles.questionsText}>I have questions</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  termsContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    marginLeft: 12,
    fontSize: 16,
    color: '#374151',
  },
  signButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  signButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  signButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  questionsButton: {
    alignItems: 'center',
    padding: 12,
  },
  questionsText: {
    color: '#4F46E5',
    fontSize: 14,
  },
});

export default CuriosityCompact;
