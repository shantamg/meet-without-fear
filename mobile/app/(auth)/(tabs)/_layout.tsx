import { Tabs } from 'expo-router';
import { Home, MessageSquare, User } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

/**
 * Tab bar configuration
 * Three main tabs: Home, Sessions, Profile
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          headerTitle: 'BeHeard',
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => (
            <MessageSquare color={color} size={size} />
          ),
          headerTitle: 'My Sessions',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          headerTitle: 'Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgSecondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
    paddingBottom: 4,
    height: 60,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  header: {
    backgroundColor: colors.bgSecondary,
    shadowColor: 'transparent',
    elevation: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontWeight: '600',
    fontSize: 17,
    color: colors.textPrimary,
  },
});
