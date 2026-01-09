import { Tabs } from 'expo-router';
import { Home, FolderOpen, Settings } from 'lucide-react-native';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '@/src/theme';
import { useUnreadSessionCount } from '@/src/hooks/useUnreadSessionCount';

/**
 * Sessions tab icon with unread badge
 */
function SessionsTabIcon({ color, size }: { color: string; size: number }) {
  const { count } = useUnreadSessionCount();

  return (
    <View style={styles.iconContainer}>
      <FolderOpen color={color} size={size} />
      {count > 0 && (
        <View style={styles.badge} testID="sessions-badge">
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Tab bar configuration
 * Three main tabs: Home (main), Sessions (list), Settings
 *
 * Home is the main landing page with greeting and quick actions.
 * Sessions provides a list view of all sessions for quick access.
 * Settings provides access to user settings and account management.
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
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Home color={color} size={size} />
          ),
          headerTitle: 'Meet Without Fear',
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <SessionsTabIcon color={color} size={size} />
          ),
          headerTitle: 'My Sessions',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Settings color={color} size={size} />
          ),
          headerTitle: 'Settings',
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
    paddingTop: 8,
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
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
