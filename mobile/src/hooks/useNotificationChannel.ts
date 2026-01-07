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
  const { refetch: refetchToken } = useAblyToken();
  const queryClient = useQueryClient();
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const isConnectingRef = useRef(false);

  // Keep a ref to refetchToken so we can use it in authCallback without adding it to dependencies
  const refetchTokenRef = useRef(refetchToken);
  useEffect(() => {
    refetchTokenRef.current = refetchToken;
  }, [refetchToken]);

  useEffect(() => {
    // FIX: Only wait for user.id. Do NOT wait for tokenData.
    // The authCallback will handle getting the token when needed.
    if (!user?.id) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      return;
    }

    // If already connected, skip
    if (ablyRef.current?.connection?.state === 'connected') {
      return;
    }

    let ably: Ably.Realtime | null = null;
    let channel: Ably.RealtimeChannel | null = null;

    const connect = async () => {
      isConnectingRef.current = true;
      console.log('[NotificationChannel] Connecting as user:', user.id);

      try {
        // Create Ably client with token-based authentication
        // Note: Don't set clientId here - Ably will use the clientId from the token
        // Setting it explicitly can cause mismatch errors if the token is cached
        ably = new Ably.Realtime({
          authCallback: async (_, callback) => {
            console.log('[NotificationChannel] Auth callback triggered, fetching token...');
            try {
              // Use the ref to call refetchToken to avoid dependency cycles
              const { data } = await refetchTokenRef.current();
              if (data?.tokenRequest) {
                console.log('[NotificationChannel] Token received, clientId:', data.tokenRequest.clientId);
                callback(null, data.tokenRequest);
              } else {
                console.error('[NotificationChannel] No token in response');
                callback('Failed to get token', null);
              }
            } catch (err) {
              console.error('[NotificationChannel] Token fetch error:', err);
              callback(err instanceof Error ? err.message : 'Token fetch failed', null);
            }
          },
          autoConnect: true,
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

        isConnectingRef.current = false;

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
        isConnectingRef.current = false;
        // Only log error if we aren't unmounting/cleaning up
        if (ablyRef.current) {
          console.error('[NotificationChannel] Failed to connect:', error);
        }
        
        if (channel) {
          channel.unsubscribe();
          channel.detach();
        }
        if (ably) {
          ably.connection.close();
        }
        ablyRef.current = null;
        channelRef.current = null;
      }
    };

    connect();

    // Cleanup
    return () => {
      isConnectingRef.current = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current.detach();
        channelRef.current = null;
      }
      if (ablyRef.current) {
        ablyRef.current.connection.close();
        ablyRef.current = null;
      }
    };
  // Dependency array now ONLY contains user.id and queryClient
  }, [user?.id, queryClient]);
}

