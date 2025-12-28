/**
 * Notification Settings Screen
 *
 * Allows users to manage their notification preferences.
 */

import { ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { NotificationSettings } from '@/src/components/NotificationSettings';
import { colors } from '@/src/theme';

// ============================================================================
// Component
// ============================================================================

export default function NotificationSettingsScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.bgPrimary,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.textPrimary,
          },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <NotificationSettings />
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
    backgroundColor: colors.bgPage,
  },
  content: {
    paddingBottom: 40,
  },
});
