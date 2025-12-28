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
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCreateSession } from '@/src/hooks/useSessions';

/**
 * New session screen
 * Allows user to start a new session
 */
export default function NewSessionScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [personName, setPersonName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const { mutateAsync: createSession, isPending } = useCreateSession();

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title for your session');
      return;
    }

    const context = [title.trim(), description.trim()].filter(Boolean).join('\n\n');

    try {
      const response = await createSession({
        context,
        inviteName: personName.trim() || undefined,
        inviteEmail: inviteEmail.trim() || undefined,
      });

      router.replace(`/session/${response.session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to create session. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>What do you want to talk about?</Text>
              <TextInput
                style={styles.input}
                placeholder="Give your session a title..."
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Share more details (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe what you're feeling or experiencing..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Who do you want to share with? (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter their name..."
                value={personName}
                onChangeText={setPersonName}
                maxLength={50}
              />
              <Text style={styles.hint}>
                You can invite them after creating the session
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Invite by email (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="name@email.com"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                If provided, we will send an invitation link automatically.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
            style={[
              styles.submitButton,
              (!title.trim() || isPending) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!title.trim() || isPending}
          >
            <Text style={styles.submitButtonText}>
              {isPending ? 'Creating...' : 'Start Session'}
            </Text>
            <Send color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  hint: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
