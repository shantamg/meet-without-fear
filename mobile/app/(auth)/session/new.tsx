/**
 * New Session Screen
 *
 * Simple form to create a session by entering the partner's name.
 * After creation, navigates directly to the session where the AI
 * will help craft an invitation message.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateSession } from '@/src/hooks/useSessions';
import { colors } from '@/src/theme';

// ============================================================================
// Component
// ============================================================================

export default function NewSessionScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const { mutateAsync: createSession, isPending } = useCreateSession();

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Name Required', 'Please enter their first name');
      return;
    }

    const inviteName = lastName.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();

    try {
      const response = await createSession({
        inviteName,
      });

      // Navigate directly to the session for invitation crafting
      router.replace(`/session/${response.session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to create session. Please try again.');
    }
  };

  // Form state
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <Text style={styles.heading}>Who do you want to connect with?</Text>
            <Text style={styles.subheading}>
              Enter their name and we'll create a session. Then I'll help you craft an invitation message.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>First Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter their first name"
                placeholderTextColor={colors.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Last Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter their last name"
                placeholderTextColor={colors.textMuted}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!firstName.trim() || isPending) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!firstName.trim() || isPending}
              accessibilityRole="button"
              accessibilityLabel="Create session"
            >
              {isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Create Session</Text>
                  <Send color="#FFFFFF" size={20} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  form: {
    padding: 16,
    gap: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 8,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: colors.bgTertiary,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
