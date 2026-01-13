/**
 * Settings Layout
 *
 * Stack navigator for settings screens:
 * - Main settings (index)
 * - Account settings
 * - Voice settings
 * - Memories
 * - Privacy
 * - Help & Support
 */

import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/theme';

function BackButton() {
  const router = useRouter();
  return (
    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: -8, padding: 8 }}>
      <ChevronLeft color={colors.textPrimary} size={28} />
    </TouchableOpacity>
  );
}

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStyle: {
          backgroundColor: colors.bgSecondary,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          color: colors.textPrimary,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.bgPrimary,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: 'Settings',
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          headerTitle: 'Profile',
        }}
      />
      <Stack.Screen
        name="voice"
        options={{
          headerTitle: 'Voice Settings',
        }}
      />
      <Stack.Screen
        name="memories"
        options={{
          headerTitle: 'Things to Remember',
        }}
      />
      <Stack.Screen
        name="privacy"
        options={{
          headerTitle: 'Privacy',
        }}
      />
      <Stack.Screen
        name="help"
        options={{
          headerTitle: 'Help & Support',
        }}
      />
    </Stack>
  );
}
