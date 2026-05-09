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
import { designFonts, useAppAppearance } from '@/theme';

function BackButton() {
  const router = useRouter();
  const { palette } = useAppAppearance();
  return (
    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: -8, padding: 8 }}>
      <ChevronLeft color={palette.text} size={28} />
    </TouchableOpacity>
  );
}

export default function SettingsLayout() {
  const { palette } = useAppAppearance();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerTransparent: true,
        headerStyle: {
          backgroundColor: 'transparent',
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
