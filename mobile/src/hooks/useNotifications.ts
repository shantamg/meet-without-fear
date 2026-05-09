import { useCallback, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';

import {
  getNotificationPermissionStatus,
  registerForPushNotifications,
  requestAndRegisterForPushNotifications,
} from '@/src/services/notifications';

function normalizeParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function useNotifications() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string | string[] }>();
  const currentSessionId = pathname.startsWith('/session/')
    ? normalizeParam(params.id)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    getNotificationPermissionStatus()
      .then((status) => {
        if (cancelled || status !== 'granted') {
          return;
        }
        return registerForPushNotifications();
      })
      .catch((error) => {
        console.warn('[notifications] Failed to register existing push permission:', error);
      });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : undefined;
      const screen = typeof data?.screen === 'string' ? data.screen : undefined;

      if (sessionId) {
        const sessionPath = `/session/${sessionId}` as const;
        if (sessionId === currentSessionId) {
          router.replace(sessionPath);
        } else {
          router.push(sessionPath);
        }
      } else if (screen === 'home') {
        router.push('/(auth)/(tabs)');
      }
    });

    return () => {
      cancelled = true;
      responseSubscription.remove();
    };
  }, [currentSessionId]);

  const shouldAskForSessionNotifications = useCallback(async () => {
    const status = await getNotificationPermissionStatus();
    return status === 'undetermined';
  }, []);

  const requestSessionNotifications = useCallback(async () => {
    try {
      return await requestAndRegisterForPushNotifications();
    } catch (error) {
      console.warn('[notifications] Failed to request push notifications:', error);
      return false;
    }
  }, []);

  return {
    shouldAskForSessionNotifications,
    requestSessionNotifications,
  };
}
