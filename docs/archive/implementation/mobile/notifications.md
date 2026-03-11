# Push Notifications Implementation

## Source Documentation

- [Notifications UX](../../docs/mvp-planning/plans/wireframes/notifications.md)
- [Push Notifications](../../docs/mvp-planning/plans/deployment/push-notifications.md)

## Prerequisites

- [ ] `mobile/auth-flow.md` complete
- [ ] `mobile/api-client.md` complete
- [ ] `backend/realtime.md` complete

## External Services Required

> **User action needed:** Configure Expo Push Notifications

1. **Get Expo project ID:**
   - Create project at https://expo.dev
   - Copy project ID from project settings

2. **Update app.json:**
   ```json
   {
     "expo": {
       "extra": {
         "eas": {
           "projectId": "your-project-id"
         }
       }
     }
   }
   ```

3. **For iOS:** Configure Apple Push Notification service (APNs) in Expo dashboard

## Scope

Implement push notification registration, handling, and display.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/hooks/__tests__/useNotifications.test.ts`:

```typescript
describe('useNotifications', () => {
  it('requests permission on mount', async () => {
    const mockRequestPermissions = jest.fn().mockResolvedValue({ status: 'granted' });
    renderHook(() => useNotifications());
    expect(mockRequestPermissions).toHaveBeenCalled();
  });

  it('registers push token with backend', async () => {
    const mockUpdateToken = jest.fn();
    renderHook(() => useNotifications());
    await waitFor(() => expect(mockUpdateToken).toHaveBeenCalledWith(expect.any(String)));
  });

  it('handles notification tap with deep link', async () => {
    const mockNavigate = jest.fn();
    const notification = { data: { screen: '/session/123' } };
    // Simulate notification tap
    expect(mockNavigate).toHaveBeenCalledWith('/session/123');
  });
});
```

### 2. Create notification service

Create `mobile/src/services/notifications.ts`:

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

export function setupAndroidChannel() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}
```

### 3. Create notifications hook

Create `mobile/src/hooks/useNotifications.ts`:

```typescript
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import {
  getExpoPushToken,
  setupAndroidChannel,
} from '../services/notifications';
import { useUpdatePushToken } from './useProfile';

export function useNotifications() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { mutate: updatePushToken } = useUpdatePushToken();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!isSignedIn) return;

    setupAndroidChannel();

    // Register for push notifications
    getExpoPushToken().then((token) => {
      if (token) {
        updatePushToken(token);
      }
    });

    // Handle notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
      }
    );

    // Handle notification tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.screen) {
          router.push(data.screen as string);
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isSignedIn]);
}
```

### 4. Create in-app toast component

Create `mobile/src/components/Toast.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react-native';

interface Props {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ title, body, action, onDismiss, duration = 6000 }: Props) {
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    // Slide in
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss
    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 200,
      useNativeDriver: true,
    }).start(onDismiss);
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {body && <Text style={styles.body}>{body}</Text>}
      </View>

      {action && (
        <TouchableOpacity style={styles.action} onPress={action.onPress}>
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.close} onPress={dismiss}>
        <X color="#6B7280" size={20} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  content: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  body: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    marginHorizontal: 8,
  },
  actionText: { color: 'white', fontSize: 14, fontWeight: '600' },
  close: { padding: 4 },
});
```

### 5. Create toast context

Create `mobile/src/contexts/ToastContext.tsx`:

```typescript
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '../components/Toast';

interface ToastData {
  id: string;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  showToast: (data: Omit<ToastData, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((data: Omit<ToastData, 'id'>) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...data, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          title={toast.title}
          body={toast.body}
          action={toast.action}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
```

### 6. Create notification inbox

Create `mobile/src/components/NotificationInbox.tsx`:

```typescript
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Users, MessageCircle, Calendar } from 'lucide-react-native';

interface Notification {
  id: string;
  type: 'invite' | 'stage' | 'followup';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  deepLink?: string;
}

interface Props {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
}

const ICONS = {
  invite: Mail,
  stage: Users,
  followup: Calendar,
};

export function NotificationInbox({ notifications, onMarkRead }: Props) {
  const router = useRouter();

  const handlePress = (notification: Notification) => {
    onMarkRead(notification.id);
    if (notification.deepLink) {
      router.push(notification.deepLink);
    }
  };

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const Icon = ICONS[item.type] || MessageCircle;
        return (
          <TouchableOpacity
            style={[styles.item, !item.read && styles.unread]}
            onPress={() => handlePress(item)}
          >
            <View style={styles.icon}>
              <Icon color="#4F46E5" size={20} />
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{item.timestamp}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No notifications</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  unread: {
    backgroundColor: '#EEF2FF',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 14, color: '#6B7280' },
  time: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    alignSelf: 'center',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
```

### 7. Install dependencies

```bash
npx expo install expo-notifications expo-device expo-constants
```

### 8. Update app layout

Update `mobile/app/_layout.tsx` to use notifications:

```typescript
import { useNotifications } from '../src/hooks/useNotifications';
import { ToastProvider } from '../src/contexts/ToastContext';

export default function RootLayout() {
  useNotifications();

  return (
    <ToastProvider>
      {/* existing providers and layout */}
    </ToastProvider>
  );
}
```

### 9. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Permission request shows on first launch
- [ ] Push token registered with backend
- [ ] Notifications appear when app foregrounded
- [ ] Tapping notification navigates to correct screen
- [ ] In-app toast shows and auto-dismisses
- [ ] Notification inbox displays history
- [ ] Badge count updates correctly
- [ ] `npm run check` passes
- [ ] `npm run test` passes
