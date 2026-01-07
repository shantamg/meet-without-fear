/**
 * useNotificationChannel Hook
 *
 * Subscribes to the user's notification channel via Ably to receive
 * real-time notification updates. When a notification is created,
 * it directly updates the React Query cache to immediately reflect
 * the new notification in the UI, even when the user is on other screens.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import Ably from 'ably';
import { REALTIME_CHANNELS, NotificationDTO, NotificationListResponseDTO } from '@meet-without-fear/shared';
import { useAblyToken } from './useProfile';
import { useAuth } from './useAuth';
import { notificationKeys } from './useNotifications';
import { NotificationItem } from '@/src/components/NotificationInbox';

export function useNotificationChannel(): void {
  const { user } = useAuth();
  const { data: tokenData } = useAblyToken();
  const queryClient = useQueryClient();
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id || !tokenData?.tokenRequest) {
      return;
    }

    let ably: Ably.Realtime | null = null;
    let channel: Ably.RealtimeChannel | null = null;

    const connect = async () => {
      try {
        // Create Ably client
        ably = new Ably.Realtime({
          authCallback: async (_, callback) => {
            callback(null, tokenData.tokenRequest);
          },
        });

        ablyRef.current = ably;

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          ably!.connection.once('connected', () => {
            clearTimeout(timeout);
            resolve();
          });

          ably!.connection.once('failed', (stateChange) => {
            clearTimeout(timeout);
            reject(new Error(stateChange.reason?.message || 'Connection failed'));
          });
        });

        // Subscribe to user notification channel
        const channelName = REALTIME_CHANNELS.user(user.id);
        console.log('[NotificationChannel] Subscribing to:', channelName);
        channel = ably.channels.get(channelName);
        channelRef.current = channel;

        // Listen for notification.created events
        channel.subscribe('notification.created', (message: Ably.Message) => {
          console.log('[NotificationChannel] Notification created:', message.data);
          
          const data = message.data as { notification: NotificationDTO; unreadCount: number };
          const { notification, unreadCount } = data;

          // Directly update the cache to immediately show the new notification
          queryClient.setQueryData<InfiniteData<NotificationListResponseDTO>>(
            notificationKeys.list(),
            (oldData) => {
              if (!oldData) {
                // If no existing data, create a new page with the notification
                return {
                  pages: [
                    {
                      notifications: [notification as NotificationItem],
                      nextCursor: null,
                      unreadCount,
                    },
                  ],
                  pageParams: [undefined],
                };
              }

              // Prepend the new notification to the first page
              const firstPage = oldData.pages[0];
              const updatedFirstPage: NotificationListResponseDTO = {
                ...firstPage,
                notifications: [notification as NotificationItem, ...firstPage.notifications],
                unreadCount,
              };

              // Update unread count in all pages
              const updatedPages = oldData.pages.map((page, index) => {
                if (index === 0) {
                  return updatedFirstPage;
                }
                return {
                  ...page,
                  unreadCount,
                };
              });

              return {
                ...oldData,
                pages: updatedPages,
              };
            }
          );

          // Also refetch to ensure consistency (but the direct update makes it appear immediately)
          queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
        });

        console.log('[NotificationChannel] Subscribed successfully');
      } catch (error) {
        console.error('[NotificationChannel] Failed to connect:', error);
      }
    };

    connect();

    // Cleanup on unmount or when user/token changes
    return () => {
      if (channel) {
        channel.unsubscribe();
        channel.detach();
      }
      if (ably) {
        ably.connection.close();
      }
      ablyRef.current = null;
      channelRef.current = null;
    };
  }, [user?.id, tokenData?.tokenRequest, queryClient]);
}

