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
import { designFonts, useAppAppearance } from '@/theme';
import { HeaderBackButton } from '@/src/components/HeaderBackButton';

function BackButton() {
  const router = useRouter();
  return <HeaderBackButton onPress={() => router.back()} />;
}

export default function SettingsLayout() {
  const { palette } = useAppAppearance();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStyle: {
          backgroundColor: palette.bg,
        },
        headerTintColor: palette.text,
        headerTitleStyle: {
          color: palette.text,
          fontFamily: designFonts.sans,
          fontWeight: '700',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: palette.bg,
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
