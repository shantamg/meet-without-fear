/**
 * Profile Settings Screen
 *
 * Allows users to manage their profile: edit profile, export data, delete account.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { User, Trash2, Save } from 'lucide-react-native';
import { useClerk } from '@clerk/clerk-expo';
import { designFonts, useAppAppearance } from '@/src/theme';
import { useProfile, useUpdateProfile, useDeleteAccount } from '@/src/hooks/useProfile';
import { useAuth } from '@/src/hooks/useAuth';

export default function AccountSettingsScreen() {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { data: profileData } = useProfile();
  const user = profileData?.user;
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const { signOut } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const router = useRouter();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isEditing, setIsEditing] = useState(false);

  // Sync name state when profile data changes (e.g., after save)
  useEffect(() => {
    if (!isEditing) {
      setFirstName(user?.firstName || '');
      setLastName(user?.lastName || '');
    }
  }, [user?.firstName, user?.lastName, isEditing]);

  const handleSaveProfile = async () => {
    if (!firstName.trim()) {
      Alert.alert('Error', 'First name cannot be empty');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data, sessions, and connections will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Second confirmation with email input
            Alert.prompt(
              'Confirm Deletion',
              `Type your email (${user?.email}) to confirm account deletion:`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async (inputEmail?: string) => {
                    if (inputEmail?.toLowerCase() !== user?.email?.toLowerCase()) {
                      Alert.alert('Error', 'Email does not match. Account not deleted.');
                      return;
                    }

                    try {
                      await deleteAccount.mutateAsync();
                      // Sign out from Clerk first (clears OAuth session)
                      await clerkSignOut();
                      // Then clear local auth state
                      await signOut();
                      router.replace('/(public)');
                    } catch {
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    }
                  },
                },
              ],
              'plain-text',
              '',
              'email-address'
            );
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: palette.bg,
          },
          headerTintColor: palette.text,
          headerTitleStyle: {
            fontWeight: '600',
            color: palette.text,
            fontFamily: designFonts.sans,
          },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.avatarContainer}>
              <User color={palette.bg} size={32} />
            </View>
            <View style={styles.profileInfo}>
              {isEditing ? (
                <>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor={palette.textFaint}
                    autoFocus
                  />
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name (optional)"
                    placeholderTextColor={palette.textFaint}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Name</Text>
                  <Text style={styles.value}>
                    {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Not set'}
                  </Text>
                </>
              )}
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email}</Text>
            </View>
          </View>
          {isEditing ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setFirstName(user?.firstName || '');
                  setLastName(user?.lastName || '');
                  setIsEditing(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <ActivityIndicator color={palette.bg} size="small" />
                ) : (
                  <>
                    <Save color={palette.bg} size={18} />
                    <Text style={styles.saveButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <TouchableOpacity
            style={[styles.menuItem, styles.dangerItem]}
            onPress={handleDeleteAccount}
          >
            <View style={styles.menuItemLeft}>
              <Trash2 color={palette.danger} size={22} />
              <View>
                <Text style={[styles.menuItemLabel, styles.dangerLabel]}>
                  Delete Account
                </Text>
                <Text style={styles.menuItemDescription}>
                  Permanently delete your account and all data
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
    fontFamily: designFonts.sans,
  },
  dangerTitle: {
    color: palette.danger,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 8,
    fontFamily: designFonts.sans,
  },
  value: {
    fontSize: 16,
    color: palette.text,
    fontFamily: designFonts.sans,
  },
  input: {
    fontSize: 16,
    color: palette.text,
    backgroundColor: palette.bgPane,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    fontFamily: designFonts.sans,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    backgroundColor: palette.bgElev,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  editButtonText: {
    fontSize: 16,
    color: palette.accentText,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: palette.bgElev,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  cancelButtonText: {
    fontSize: 16,
    color: palette.textMuted,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    color: palette.bg,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: palette.danger,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 17,
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  dangerLabel: {
    color: palette.danger,
  },
  menuItemDescription: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    fontFamily: designFonts.sans,
  },
});
