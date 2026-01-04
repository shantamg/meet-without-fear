/**
 * usePushNotifications Hook for Meet Without Fear Mobile
 *
 * Manages push notification permissions, token registration,
 * and notification event listeners.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from './useAuth';
import { useUpdatePushToken } from './useProfile';
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  getExpoPushToken,
  parseNotificationData,
  configureNotificationHandler,
  setupAndroidChannel,
  getDevicePlatform,
  NotificationPermissionStatus,
} from '../services/notifications';

// ============================================================================
// Types
// ============================================================================

export interface UsePushNotificationsReturn {
  /** Current notification permission status */
  permissionStatus: NotificationPermissionStatus;
  /** Whether push token is registered with backend */
  isRegistered: boolean;
  /** Whether registration is in progress */
  isRegistering: boolean;
  /** Request push notification permissions */
  requestPermission: () => Promise<boolean>;
  /** The current push token (if registered) */
  pushToken: string | null;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to manage push notification permissions and registration.
 *
 * Handles:
 * - Checking permission status
 * - Requesting permissions
 * - Registering push token with backend
 * - Setting up notification listeners
 *
 * @example
 * ```tsx
 * function NotificationSettings() {
 *   const { permissionStatus, requestPermission, isRegistered } = usePushNotifications();
 *
 *   const handleEnable = async () => {
 *     const granted = await requestPermission();
 *     if (granted) {
 *       console.log('Push notifications enabled!');
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Text>Status: {permissionStatus}</Text>
 *       {permissionStatus !== 'granted' && (
 *         <Button onPress={handleEnable} title="Enable Notifications" />
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { mutate: updatePushToken, isPending: isRegistering } = useUpdatePushToken();

  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>('undetermined');
  const [isRegistered, setIsRegistered] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const hasConfigured = useRef(false);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  // Configure notification handler on mount
  useEffect(() => {
    if (!hasConfigured.current) {
      configureNotificationHandler();
      setupAndroidChannel();
      hasConfigured.current = true;
    }
  }, []);

  // Check permission status on mount and auth changes
  useEffect(() => {
    const checkPermission = async () => {
      const status = await getNotificationPermissionStatus();
      setPermissionStatus(status);
    };
    checkPermission();
  }, [isAuthenticated]);

  // Register push token when authenticated and permission granted
  useEffect(() => {
    const registerToken = async () => {
      if (!isAuthenticated || permissionStatus !== 'granted') {
        setIsRegistered(false);
        return;
      }

      try {
        const token = await getExpoPushToken();
        if (token) {
          setPushToken(token);
          const platform = getDevicePlatform();
          updatePushToken(
            { pushToken: token, platform },
            {
              onSuccess: () => {
                setIsRegistered(true);
                console.log('[PushNotifications] Token registered with backend');
              },
              onError: (error) => {
                console.error('[PushNotifications] Failed to register token:', error);
                setIsRegistered(false);
              },
            }
          );
        }
      } catch (error) {
        console.error('[PushNotifications] Failed to get push token:', error);
      }
    };

    registerToken();
  }, [isAuthenticated, permissionStatus, updatePushToken]);

  // Set up notification listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    // Listener for when notification is received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[PushNotifications] Notification received:', notification);
    });

    // Listener for when user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = parseNotificationData(response);
      console.log('[PushNotifications] Notification tapped:', data);

      // Navigate to the appropriate screen
      if (data.screen) {
        router.push(data.screen as any);
      } else if (data.sessionId) {
        router.push(`/session/${data.sessionId}` as any);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, router]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestNotificationPermissions();
    const status = await getNotificationPermissionStatus();
    setPermissionStatus(status);
    return granted;
  }, []);

  return {
    permissionStatus,
    isRegistered,
    isRegistering,
    requestPermission,
    pushToken,
  };
}
