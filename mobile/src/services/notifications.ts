import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { post } from '@/src/lib/api';
import type { UpdatePushTokenRequest, UpdatePushTokenResponse } from '@meet-without-fear/shared';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationPermissionStatus = Notifications.PermissionStatus | 'unavailable';

export function canUsePushNotifications(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!canUsePushNotifications() || !Device.isDevice) {
    return 'unavailable';
  }

  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!canUsePushNotifications() || !Device.isDevice) {
    return false;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function registerForPushNotifications(): Promise<boolean> {
  if (!canUsePushNotifications() || !Device.isDevice) {
    return false;
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const platform = Platform.OS === 'android' ? 'android' : 'ios';

  const response = await post<UpdatePushTokenResponse, UpdatePushTokenRequest>(
    '/auth/push-token',
    {
      pushToken: token.data,
      platform,
    }
  );

  return response.registered;
}

export async function requestAndRegisterForPushNotifications(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    return false;
  }

  return registerForPushNotifications();
}
