/**
 * New Session Screen
 *
 * Form to create a session by either:
 * 1. Picking an existing person from your relationships
 * 2. Entering a new person's name
 *
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
import { Send, User, UserPlus, Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateSession } from '@/src/hooks/useSessions';
import { usePeople } from '@/src/hooks/usePerson';
import { colors } from '@/src/theme';
import type { PersonSummaryDTO } from '@meet-without-fear/shared';

// ============================================================================
// Component
// ============================================================================

export default function NewSessionScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [selectedPerson, setSelectedPerson] = useState<PersonSummaryDTO | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const { mutateAsync: createSession, isPending } = useCreateSession();

  // Determine if we have people to pick from
  const hasPeople = people.length > 0;

  // Effective mode: if no people exist, treat as 'new' regardless of state
  const effectiveMode = hasPeople ? mode : 'new';

  const handleSubmit = async () => {
    if (effectiveMode === 'pick' && selectedPerson) {
      try {
        const response = await createSession({
          personId: selectedPerson.id,
        });
        router.replace(`/session/${response.session.id}`);
      } catch (error) {
        console.error('Failed to create session:', error);
        Alert.alert('Error', 'Failed to create session. Please try again.');
      }
    } else if (effectiveMode === 'new') {
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
        router.replace(`/session/${response.session.id}`);
      } catch (error) {
        console.error('Failed to create session:', error);
        Alert.alert('Error', 'Failed to create session. Please try again.');
      }
    }
  };

  const canSubmit = effectiveMode === 'pick' ? !!selectedPerson : !!firstName.trim();

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
              {hasPeople
                ? 'Pick someone you know or add a new person.'
                : "Enter their name and we'll create a session."}
            </Text>

            {/* Mode Tabs - only show if there are existing people */}
            {hasPeople && (
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, mode === 'pick' && styles.tabActive]}
                  onPress={() => setMode('pick')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'pick' }}
                >
                  <User
                    size={18}
                    color={mode === 'pick' ? colors.brandBlue : colors.textSecondary}
                  />
                  <Text
                    style={[styles.tabText, mode === 'pick' && styles.tabTextActive]}
                  >
                    Pick Someone
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, mode === 'new' && styles.tabActive]}
                  onPress={() => setMode('new')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'new' }}
                >
                  <UserPlus
                    size={18}
                    color={mode === 'new' ? colors.brandBlue : colors.textSecondary}
                  />
                  <Text
                    style={[styles.tabText, mode === 'new' && styles.tabTextActive]}
                  >
                    New Person
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* People Picker */}
            {effectiveMode === 'pick' && hasPeople && (
              <View style={styles.peopleList}>
                {peopleLoading ? (
                  <ActivityIndicator color={colors.brandBlue} />
                ) : (
                  people.map((person) => (
                    <TouchableOpacity
                      key={person.id}
                      style={[
                        styles.personCard,
                        selectedPerson?.id === person.id && styles.personCardSelected,
                      ]}
                      onPress={() => setSelectedPerson(person)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selectedPerson?.id === person.id }}
                    >
                      <View style={styles.personAvatar}>
                        <Text style={styles.personAvatarText}>{person.initials}</Text>
                      </View>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>{person.name}</Text>
                        {person.lastSession && (
                          <Text style={styles.personMeta}>
                            Last session: {formatRelativeTime(person.lastSession.updatedAt)}
                          </Text>
                        )}
                      </View>
                      {selectedPerson?.id === person.id && (
                        <View style={styles.checkIcon}>
                          <Check size={20} color={colors.brandBlue} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* New Person Form */}
            {effectiveMode === 'new' && (
              <>
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
              </>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!canSubmit || isPending) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || isPending}
              accessibilityRole="button"
              accessibilityLabel="Create session"
            >
              {isPending ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Create Session</Text>
                  <Send color={colors.textPrimary} size={20} />
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
// Helpers
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
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
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  tabActive: {
    backgroundColor: colors.bgPrimary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.brandBlue,
  },
  // People list
  peopleList: {
    gap: 12,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  personCardSelected: {
    borderColor: colors.brandBlue,
    backgroundColor: `${colors.brandBlue}10`,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  personInfo: {
    flex: 1,
    marginLeft: 12,
  },
  personName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  personMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkIcon: {
    marginLeft: 8,
  },
  // Input group
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
    backgroundColor: colors.brandBlue,
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
    color: colors.textPrimary,
  },
});
