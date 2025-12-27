/**
 * Notification Settings Screen
 *
 * Allows users to manage their notification preferences.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Bell, MessageCircle, Users, Calendar, Settings, ChevronRight } from 'lucide-react-native';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useUnregisterPushToken } from '@/src/hooks/useProfile';

// ============================================================================
// Types
// ============================================================================

interface NotificationCategory {
  id: string;
  title: string;
  description: string;
  icon: typeof Bell;
  enabled: boolean;
}

// ============================================================================
// Component
// ============================================================================

export default function NotificationSettingsScreen() {
  const { permissionStatus, requestPermission, isRegistered } = useNotifications();
  const { mutate: unregisterToken, isPending: isUnregistering } = useUnregisterPushToken();

  // Local state for notification categories (in a real app, these would be persisted)
  const [categories, setCategories] = useState<NotificationCategory[]>([
    {
      id: 'session_invites',
      title: 'Session Invites',
      description: 'When someone invites you to a session',
      icon: MessageCircle,
      enabled: true,
    },
    {
      id: 'partner_responses',
      title: 'Partner Responses',
      description: 'When your partner responds in a session',
      icon: Users,
      enabled: true,
    },
    {
      id: 'stage_progress',
      title: 'Stage Progress',
      description: 'When a session advances to a new stage',
      icon: Users,
      enabled: true,
    },
    {
      id: 'followups',
      title: 'Follow-up Reminders',
      description: 'Reminders to check in on your agreements',
      icon: Calendar,
      enabled: true,
    },
  ]);

  const allNotificationsEnabled = permissionStatus === 'granted' && isRegistered;

  const toggleCategory = useCallback((id: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, enabled: !cat.enabled } : cat))
    );
  }, []);

  const handleEnableNotifications = async () => {
    if (permissionStatus === 'denied') {
      // On iOS, we need to direct user to Settings
      Alert.alert(
        'Notifications Disabled',
        'To enable notifications, please go to Settings and enable them for BeHeard.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    } else {
      await requestPermission();
    }
  };

  const handleDisableAllNotifications = () => {
    Alert.alert(
      'Disable Notifications',
      'Are you sure you want to disable all notifications? You will not receive updates about your sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            unregisterToken();
          },
        },
      ]
    );
  };

  const renderPermissionSection = () => {
    if (permissionStatus === 'granted' && isRegistered) {
      return (
        <View style={styles.section}>
          <View style={[styles.statusBanner, styles.enabledBanner]}>
            <Bell color="#10B981" size={20} />
            <Text style={styles.statusText}>Notifications are enabled</Text>
          </View>
        </View>
      );
    }

    if (permissionStatus === 'denied') {
      return (
        <View style={styles.section}>
          <View style={[styles.statusBanner, styles.disabledBanner]}>
            <Bell color="#EF4444" size={20} />
            <View style={styles.statusContent}>
              <Text style={[styles.statusText, styles.disabledText]}>Notifications are disabled</Text>
              <Text style={styles.statusDescription}>
                Enable in your device settings to receive updates
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.enableButton} onPress={handleEnableNotifications}>
            <Settings color="#FFFFFF" size={20} />
            <Text style={styles.enableButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <View style={[styles.statusBanner, styles.pendingBanner]}>
          <Bell color="#6B7280" size={20} />
          <Text style={styles.statusText}>Notifications not set up</Text>
        </View>
        <TouchableOpacity style={styles.enableButton} onPress={handleEnableNotifications}>
          <Bell color="#FFFFFF" size={20} />
          <Text style={styles.enableButtonText}>Enable Notifications</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCategoryItem = (category: NotificationCategory) => {
    const Icon = category.icon;

    return (
      <View key={category.id} style={styles.categoryItem}>
        <View style={styles.categoryIcon}>
          <Icon color="#4F46E5" size={20} />
        </View>
        <View style={styles.categoryContent}>
          <Text style={styles.categoryTitle}>{category.title}</Text>
          <Text style={styles.categoryDescription}>{category.description}</Text>
        </View>
        <Switch
          value={allNotificationsEnabled && category.enabled}
          onValueChange={() => toggleCategory(category.id)}
          disabled={!allNotificationsEnabled}
          trackColor={{ false: '#E5E7EB', true: '#A5B4FC' }}
          thumbColor={category.enabled ? '#4F46E5' : '#9CA3AF'}
        />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {renderPermissionSection()}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Types</Text>
          <View style={styles.categoryList}>
            {categories.map(renderCategoryItem)}
          </View>
        </View>

        {allNotificationsEnabled && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleDisableAllNotifications}
              disabled={isUnregistering}
            >
              <Text style={styles.dangerButtonText}>
                {isUnregistering ? 'Disabling...' : 'Disable All Notifications'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.infoText}>
            Notifications help you stay connected with your mediation sessions. You can customize
            which types of notifications you receive above.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  enabledBanner: {
    backgroundColor: '#D1FAE5',
  },
  disabledBanner: {
    backgroundColor: '#FEE2E2',
  },
  pendingBanner: {
    backgroundColor: '#F3F4F6',
  },
  statusContent: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  disabledText: {
    color: '#991B1B',
  },
  statusDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryContent: {
    flex: 1,
    marginRight: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  categoryDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  dangerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#FFFFFF',
  },
  dangerButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    textAlign: 'center',
  },
});
