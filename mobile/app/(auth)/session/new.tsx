/**
 * New Session Screen
 *
 * Simple form to create a session by entering the partner's name.
 * After creation, shows a share button to send the invitation link
 * via the native share sheet.
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
  Share,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Send, Share2, Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateSession } from '@/src/hooks/useSessions';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

type ScreenState = 'form' | 'success';

// ============================================================================
// Component
// ============================================================================

export default function NewSessionScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

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

      setInvitationUrl(response.invitationUrl);
      setSessionId(response.session.id);
      setScreenState('success');
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to create session. Please try again.');
    }
  };

  const handleShare = async () => {
    if (!invitationUrl) return;

    const partnerName = lastName.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();

    try {
      await Share.share({
        message: `I'd like to have a meaningful conversation with you. Join me on Meet Without Fear: ${invitationUrl}`,
        title: `Invitation for ${partnerName}`,
        url: invitationUrl,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const handleStartSession = () => {
    if (sessionId) {
      router.replace(`/session/${sessionId}`);
    }
  };

  // Success state - show share option
  if (screenState === 'success') {
    const partnerName = lastName.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContainer}>
          <View style={styles.successContent}>
            <View style={styles.successIconContainer}>
              <Check color={colors.success} size={48} />
            </View>
            <Text style={styles.successTitle}>Session Created</Text>
            <Text style={styles.successSubtitle}>
              Share the invitation link with {partnerName} so they can join.
            </Text>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share invitation"
            >
              <Share2 color="#FFFFFF" size={20} />
              <Text style={styles.shareButtonText}>Share Invitation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartSession}
              accessibilityRole="button"
              accessibilityLabel="Start session"
            >
              <Text style={styles.startButtonText}>Start Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
              Enter their name and we'll create a session. You can then share
              the invitation link with them.
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

  // Success state
  successContainer: {
    flex: 1,
    padding: 16,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 320,
    alignSelf: 'center',
  },
  successIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.successBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
    width: '100%',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  shareButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  startButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
});
