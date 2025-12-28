import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';

import { useAuth } from '@/src/hooks/useAuth';

/**
 * Profile tab screen
 * User settings and account management
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { signOut: clerkSignOut } = useClerk();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Sign out from Clerk first (clears OAuth session)
              await clerkSignOut();
              // Then clear local auth state
              await signOut();
              router.replace('/(public)');
            } catch (error) {
              console.error('Sign out failed:', error);
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: Settings,
      label: 'Account Settings',
      onPress: () => {
        // TODO: Navigate to account settings
        Alert.alert('Coming Soon', 'Account settings will be available soon');
      },
    },
    {
      icon: Bell,
      label: 'Notifications',
      onPress: () => {
        // TODO: Navigate to notification settings
        Alert.alert('Coming Soon', 'Notification settings will be available soon');
      },
    },
    {
      icon: Shield,
      label: 'Privacy',
      onPress: () => {
        // TODO: Navigate to privacy settings
        Alert.alert('Coming Soon', 'Privacy settings will be available soon');
      },
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      onPress: () => {
        // TODO: Navigate to help
        Alert.alert('Coming Soon', 'Help & Support will be available soon');
      },
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <User color="#FFFFFF" size={40} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuItem,
                index === 0 && styles.menuItemFirst,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <item.icon color="#007AFF" size={22} />
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </View>
              <ChevronRight color="#C7C7CC" size={20} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out button */}
        <View style={styles.menuSection}>
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemFirst, styles.menuItemLast]}
            onPress={handleSignOut}
          >
            <View style={styles.menuItemLeft}>
              <LogOut color="#FF3B30" size={22} />
              <Text style={[styles.menuItemLabel, styles.signOutLabel]}>
                Sign Out
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App version */}
        <Text style={styles.version}>BeHeard v0.0.1</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  profileEmail: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 4,
  },
  menuSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  menuItemFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    fontSize: 17,
    color: '#000000',
  },
  signOutLabel: {
    color: '#FF3B30',
  },
  version: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
});
