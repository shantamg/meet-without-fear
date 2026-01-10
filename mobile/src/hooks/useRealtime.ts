/**
 * useRealtime Hook for Meet Without Fear Mobile
 *
 * Provides WebSocket connection management, event subscriptions,
 * and reconnection logic using Ably for real-time functionality.
 *
 * IMPORTANT: This hook uses a singleton Ably client that exists outside
 * the React component lifecycle. This ensures connections survive Fast
 * Refresh/Live Reload during development.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Ably from 'ably';
import {
  ConnectionStatus,
  ConnectionState,
  SessionEventType,
  SessionEventData,
  PresenceStatus,
  REALTIME_CHANNELS,
  UserEventType,
  UserEventData,
  MessageAIResponsePayload,
  MessageErrorPayload,
} from '@meet-without-fear/shared';
import { useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from './useSessions';
import { useAuth } from './useAuth';
import {
  getAblyClient,
  getAblyClientSync,
  reconnectAbly,
  getAblyConnectionState,
  refreshAblyToken,
} from '../lib/ably';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeConfig {
  /** Session ID to subscribe to */
  sessionId: string;
  /** Whether to enable presence tracking */
  enablePresence?: boolean;
  /** Callback when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;
  /** Callback when partner presence changes */
  onPresenceChange?: (userId: string, status: PresenceStatus) => void;
  /** Callback when partner starts/stops typing */
  onTypingChange?: (userId: string, isTyping: boolean) => void;
  /** Callback for session events */
  onSessionEvent?: (event: SessionEventType, data: SessionEventData) => void;
  /** Callback for stage progress updates */
  onStageProgress?: (userId: string, stage: number, status: string) => void;
  /** Callback when AI response arrives (fire-and-forget pattern) */
  onAIResponse?: (payload: MessageAIResponsePayload) => void;
  /** Callback when AI processing fails (fire-and-forget pattern) */
  onAIError?: (payload: MessageErrorPayload) => void;
}

export interface RealtimeState {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Whether the partner is online */
  partnerOnline: boolean;
  /** Whether the partner is typing */
  partnerTyping: boolean;
  /** Partner's current stage (if known) */
  partnerStage?: number;
  /** Last error message */
  error?: string;
}

export interface RealtimeActions {
  /** Send typing indicator */
  sendTyping: (isTyping: boolean) => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect from realtime */
  disconnect: () => void;
}

// ============================================================================
// Ably Types
// ============================================================================

type AblyRealtimeChannel = Ably.RealtimeChannel;

// ============================================================================
// Connection State Mapping
// ============================================================================

function mapAblyState(state: string): ConnectionStatus {
  switch (state) {
    case 'initialized':
    case 'connecting':
      return ConnectionStatus.CONNECTING;
    case 'connected':
      return ConnectionStatus.CONNECTED;
    case 'disconnected':
    case 'closing':
    case 'closed':
      return ConnectionStatus.DISCONNECTED;
    case 'suspended':
      return ConnectionStatus.SUSPENDED;
    case 'failed':
      return ConnectionStatus.FAILED;
    default:
      return ConnectionStatus.DISCONNECTED;
  }
}

// ============================================================================
// useRealtime Hook
// ============================================================================

/**
 * Hook for managing real-time WebSocket connections and subscriptions.
 * Uses a singleton Ably client that survives component remounts and live reload.
 *
 * @param config - Configuration options for the realtime connection
 * @returns Current state and actions for real-time functionality
 */
export function useRealtime(config: RealtimeConfig): RealtimeState & RealtimeActions {
  const {
    sessionId,
    enablePresence = true,
    onConnectionChange,
    onPresenceChange,
    onTypingChange,
    onSessionEvent,
    onStageProgress,
    onAIResponse,
    onAIError,
  } = config;

  const { user } = useAuth();

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => {
    // Initialize from singleton state
    return mapAblyState(getAblyConnectionState());
  });
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerStage, setPartnerStage] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Refs for channel and subscription management
  const channelRef = useRef<AblyRealtimeChannel | null>(null);
  const connectionListenerRef = useRef<((stateChange: Ably.ConnectionStateChange) => void) | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);

  // Store callbacks in refs to avoid stale closures
  const callbacksRef = useRef({
    onConnectionChange,
    onPresenceChange,
    onTypingChange,
    onSessionEvent,
    onStageProgress,
    onAIResponse,
    onAIError,
  });
  callbacksRef.current = {
    onConnectionChange,
    onPresenceChange,
    onTypingChange,
    onSessionEvent,
    onStageProgress,
    onAIResponse,
    onAIError,
  };

  // ============================================================================
  // Connection State Handler
  // ============================================================================

  const handleConnectionStateChange = useCallback(
    (stateChange: { current: string; reason?: { message: string } }) => {
      if (!isMountedRef.current) return;

      const status = mapAblyState(stateChange.current);
      setConnectionStatus(status);

      const state: ConnectionState = {
        status,
        error: stateChange.reason?.message,
        lastConnected: status === ConnectionStatus.CONNECTED ? Date.now() : undefined,
        reconnectAttempts: reconnectAttemptsRef.current,
      };

      if (status === ConnectionStatus.CONNECTED) {
        reconnectAttemptsRef.current = 0;
        setError(undefined);
      } else if (status === ConnectionStatus.FAILED) {
        setError(stateChange.reason?.message || 'Connection failed');
      }

      callbacksRef.current.onConnectionChange?.(state);
    },
    []
  );

  // ============================================================================
  // Message Handler
  // ============================================================================

  const handleMessage = useCallback(
    (message: Ably.Message) => {
      if (!isMountedRef.current) return;

      const eventName = message.name as SessionEventType;
      const eventData = message.data as SessionEventData;

      // Skip events from ourselves
      if (eventData.excludeUserId === user?.id) {
        return;
      }

      // Handle specific events
      switch (eventName) {
        case 'typing.start':
          setPartnerTyping(true);
          callbacksRef.current.onTypingChange?.(eventData.userId || '', true);
          break;

        case 'typing.stop':
          setPartnerTyping(false);
          callbacksRef.current.onTypingChange?.(eventData.userId || '', false);
          break;

        case 'presence.online':
          setPartnerOnline(true);
          callbacksRef.current.onPresenceChange?.(eventData.userId || '', PresenceStatus.ONLINE);
          break;

        case 'presence.offline':
          setPartnerOnline(false);
          setPartnerTyping(false);
          callbacksRef.current.onPresenceChange?.(eventData.userId || '', PresenceStatus.OFFLINE);
          break;

        case 'presence.away':
          callbacksRef.current.onPresenceChange?.(eventData.userId || '', PresenceStatus.AWAY);
          break;

        case 'stage.progress':
        case 'stage.waiting':
          if (eventData.stage !== undefined) {
            setPartnerStage(eventData.stage);
            callbacksRef.current.onStageProgress?.(
              eventData.userId || '',
              eventData.stage,
              (eventData as Record<string, unknown>).status as string || 'unknown'
            );
          }
          break;

        // Fire-and-forget message events
        case 'message.ai_response':
          if (callbacksRef.current.onAIResponse) {
            const aiPayload = eventData as unknown as MessageAIResponsePayload;
            // Only handle if this message is for the current user
            if (aiPayload.forUserId === user?.id) {
              console.log('[Realtime] AI response received:', aiPayload.message?.id);
              callbacksRef.current.onAIResponse(aiPayload);
            }
          }
          break;

        case 'message.error':
          if (callbacksRef.current.onAIError) {
            const errorPayload = eventData as unknown as MessageErrorPayload;
            // Only handle if this error is for the current user
            if (errorPayload.forUserId === user?.id) {
              console.log('[Realtime] AI error received:', errorPayload.error);
              callbacksRef.current.onAIError(errorPayload);
            }
          }
          break;

        default:
          // Generic session event
          callbacksRef.current.onSessionEvent?.(eventName, eventData);
          break;
      }
    },
    [user?.id]
  );

  // ============================================================================
  // Subscription Setup
  // ============================================================================

  useEffect(() => {
    if (!sessionId || !user?.id) return;

    let isCleanedUp = false;
    let channel: AblyRealtimeChannel | null = null;
    let hasTriedTokenRefresh = false;

    const setupSubscription = async () => {
      try {
        console.log('[Realtime] Setting up subscription for session:', sessionId);

        // Get the singleton client
        const ably = await getAblyClient();

        if (isCleanedUp) {
          console.log('[Realtime] Cleanup already called, aborting setup');
          return;
        }

        // Subscribe to connection state changes
        const connectionListener = (stateChange: Ably.ConnectionStateChange) => {
          console.log('[Realtime] Connection state:', stateChange.current, stateChange.reason?.message || '');
          handleConnectionStateChange({
            current: stateChange.current,
            reason: stateChange.reason ? { message: stateChange.reason.message || 'Unknown error' } : undefined,
          });
        };
        ably.connection.on(connectionListener);
        connectionListenerRef.current = connectionListener;

        // Update initial connection status
        handleConnectionStateChange({ current: ably.connection.state });

        // Get the session channel
        const channelName = REALTIME_CHANNELS.session(sessionId);
        console.log('[Realtime] Subscribing to channel:', channelName);
        channel = ably.channels.get(channelName);
        channelRef.current = channel;

        // Subscribe to all events
        await channel.subscribe(handleMessage);

        // Set up presence if enabled
        if (enablePresence) {
          console.log('[Realtime] Entering presence...');
          await channel.presence.enter({ name: user.name });
          console.log('[Realtime] Presence entered successfully');

          // Subscribe to presence events
          channel.presence.subscribe('enter', (member: Ably.PresenceMessage) => {
            if (isCleanedUp || !isMountedRef.current) return;
            console.log('[Realtime] Presence enter event:', member.clientId);
            if (member.clientId !== user.id) {
              setPartnerOnline(true);
              callbacksRef.current.onPresenceChange?.(member.clientId || '', PresenceStatus.ONLINE);
            }
          });

          channel.presence.subscribe('leave', (member: Ably.PresenceMessage) => {
            if (isCleanedUp || !isMountedRef.current) return;
            console.log('[Realtime] Presence leave event:', member.clientId);
            if (member.clientId !== user.id) {
              setPartnerOnline(false);
              setPartnerTyping(false);
              callbacksRef.current.onPresenceChange?.(member.clientId || '', PresenceStatus.OFFLINE);
            }
          });

          // Check current presence
          const members = await channel.presence.get();
          console.log('[Realtime] Current presence members:', members.map(m => m.clientId));
          const partnerPresent = members.some((m: Ably.PresenceMessage) => m.clientId !== user.id);
          console.log('[Realtime] Partner present:', partnerPresent);
          if (isMountedRef.current && !isCleanedUp) {
            setPartnerOnline(partnerPresent);
          }
        }

        console.log('[Realtime] Subscription setup complete');
      } catch (err) {
        console.error('[Realtime] Subscription setup error:', err);

        // Check if this is a capability/access denied error or channel failed state
        // This can happen when connecting to a new session before the token was refreshed
        // Also check error.cause since Ably wraps the root cause
        const errorMessage = err instanceof Error ? err.message : String(err);
        const causeMessage = (err as { cause?: Error })?.cause?.message || '';
        const fullErrorText = `${errorMessage} ${causeMessage}`.toLowerCase();
        
        const isCapabilityError =
          fullErrorText.includes('denied access') ||
          fullErrorText.includes('capability') ||
          fullErrorText.includes('channel denied') ||
          fullErrorText.includes('channel state is failed');

        if (isCapabilityError && !hasTriedTokenRefresh && !isCleanedUp) {
          console.log('[Realtime] Capability error detected, refreshing token and retrying...');
          console.log('[Realtime] Error message:', errorMessage);
          console.log('[Realtime] Cause message:', causeMessage);
          hasTriedTokenRefresh = true;

          try {
            const ably = await getAblyClient();
            const channelName = REALTIME_CHANNELS.session(sessionId);

            // Release the failed channel so we get a fresh one on retry
            // This is crucial - Ably caches channel objects and a failed channel stays failed
            console.log('[Realtime] Releasing failed channel:', channelName);
            ably.channels.release(channelName);
            channel = null;
            channelRef.current = null;

            // Refresh the token to get updated capabilities including the new session
            await refreshAblyToken();

            // Retry the subscription setup
            if (!isCleanedUp) {
              console.log('[Realtime] Token refreshed, retrying subscription...');
              await setupSubscription();
              return;
            }
          } catch (refreshErr) {
            console.error('[Realtime] Token refresh failed:', refreshErr);
          }
        }

        if (isMountedRef.current && !isCleanedUp) {
          setError(err instanceof Error ? err.message : 'Connection failed');
          setConnectionStatus(ConnectionStatus.FAILED);
        }
      }
    };

    setupSubscription();

    // Cleanup function - this is crucial for surviving live reload
    return () => {
      console.log('[Realtime] Cleaning up subscriptions for session:', sessionId);
      isCleanedUp = true;

      // Remove connection listener from singleton (don't close the client!)
      const ably = getAblyClientSync();
      if (ably && connectionListenerRef.current) {
        ably.connection.off(connectionListenerRef.current);
        connectionListenerRef.current = null;
      }

      // Unsubscribe from channel
      if (channel) {
        try {
          channel.unsubscribe();
          channel.presence.unsubscribe();
          // Leave presence (fire and forget)
          channel.presence.leave().catch((err) => {
            console.warn('[Realtime] Error leaving presence:', err);
          });
        } catch (err) {
          console.warn('[Realtime] Error during channel cleanup:', err);
        }
      }

      channelRef.current = null;

      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [sessionId, user?.id, user?.name, enablePresence, handleMessage, handleConnectionStateChange]);

  // ============================================================================
  // Track Mounted State
  // ============================================================================

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // App State Handling
  // ============================================================================

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - re-enter presence
        if (channelRef.current && enablePresence && user?.id) {
          console.log('[Realtime] App active - re-entering presence');
          try {
            await channelRef.current.presence.enter({ name: user.name });
          } catch (err) {
            console.warn('[Realtime] Failed to re-enter presence:', err);
          }
        }

        // Check if we need to reconnect
        const currentState = getAblyConnectionState();
        if (currentState !== 'connected' && currentState !== 'connecting') {
          console.log('[Realtime] App active - triggering reconnect');
          reconnectAbly();
        }
      } else if (nextAppState === 'background') {
        // App went to background - leave presence so partner sees offline immediately
        if (channelRef.current && enablePresence) {
          console.log('[Realtime] App background - leaving presence');
          channelRef.current.presence.leave().catch((err) => {
            console.warn('[Realtime] Failed to leave presence:', err);
          });
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [enablePresence, user]);

  // ============================================================================
  // Actions
  // ============================================================================

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !user?.id) return;

      // Debounce typing events
      if (lastTypingRef.current === isTyping) return;
      lastTypingRef.current = isTyping;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      const event = isTyping ? 'typing.start' : 'typing.stop';
      channelRef.current.publish(event, {
        userId: user.id,
        sessionId,
        isTyping,
        timestamp: Date.now(),
      });

      // Auto-stop typing after 5 seconds of no input
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          sendTyping(false);
        }, 5000);
      }
    },
    [sessionId, user]
  );

  const reconnect = useCallback(() => {
    console.log('[Realtime] Manual reconnect requested');
    reconnectAttemptsRef.current += 1;
    reconnectAbly();
  }, []);

  const disconnect = useCallback(() => {
    // For the singleton pattern, we don't actually disconnect the client
    // We just leave presence and clear local state
    console.log('[Realtime] Disconnect requested (clearing local state)');

    if (channelRef.current && enablePresence) {
      channelRef.current.presence.leave().catch((err) => {
        console.warn('[Realtime] Error leaving presence:', err);
      });
    }

    if (isMountedRef.current) {
      setPartnerOnline(false);
      setPartnerTyping(false);
    }
  }, [enablePresence]);

  // ============================================================================
  // Return Value
  // ============================================================================

  return {
    // State
    connectionStatus,
    partnerOnline,
    partnerTyping,
    partnerStage,
    error,
    // Actions
    sendTyping,
    reconnect,
    disconnect,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for subscribing to typing indicators only.
 */
export function usePartnerTyping(sessionId: string): boolean {
  const { partnerTyping } = useRealtime({
    sessionId,
    enablePresence: false,
  });
  return partnerTyping;
}

/**
 * Hook for subscribing to partner presence only.
 */
export function usePartnerPresence(sessionId: string): {
  isOnline: boolean;
  status: ConnectionStatus;
} {
  const { partnerOnline, connectionStatus } = useRealtime({
    sessionId,
    enablePresence: true,
  });
  return { isOnline: partnerOnline, status: connectionStatus };
}

/**
 * Hook for session event subscriptions.
 */
export function useSessionEvents(
  sessionId: string,
  onEvent: (event: SessionEventType, data: SessionEventData) => void
): { connectionStatus: ConnectionStatus } {
  const { connectionStatus } = useRealtime({
    sessionId,
    enablePresence: false,
    onSessionEvent: onEvent,
  });
  return { connectionStatus };
}

// ============================================================================
// User-Level Session Updates Hook
// ============================================================================

/**
 * Configuration for user session updates hook
 */
interface UseUserSessionUpdatesConfig {
  /** Callback when a memory suggestion is received */
  onMemorySuggestion?: (suggestion: {
    id: string;
    suggestedContent: string;
    category: string;
    confidence: string;
    sessionId: string;
  }) => void;
}

/**
 * Hook for subscribing to user-level session updates.
 * Automatically invalidates session queries when events are received.
 * Use this on the home screen or sessions list to get real-time updates.
 * Also receives memory suggestions targeted to this specific user.
 */
export function useUserSessionUpdates(
  config?: UseUserSessionUpdatesConfig
): { connectionStatus: ConnectionStatus } {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Store callback in ref to avoid stale closures
  const onMemorySuggestionRef = useRef(config?.onMemorySuggestion);
  onMemorySuggestionRef.current = config?.onMemorySuggestion;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => {
    return mapAblyState(getAblyConnectionState());
  });

  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const connectionListenerRef = useRef<((stateChange: Ably.ConnectionStateChange) => void) | null>(null);
  const isMountedRef = useRef(true);

  const handleEvent = useCallback(
    (eventName: UserEventType, _data: UserEventData) => {
      console.log('[UserSessionUpdates] Received event:', eventName, _data);

      // Handle memory suggestions targeted to this specific user
      if (eventName === 'memory.suggested') {
        const suggestion = (_data as { suggestion?: { id: string; suggestedContent: string; category: string; confidence: string } }).suggestion;
        if (suggestion && onMemorySuggestionRef.current) {
          console.log('[UserSessionUpdates] Memory suggestion received:', suggestion);
          onMemorySuggestionRef.current({
            ...suggestion,
            sessionId: _data.sessionId,
          });
        }
        return; // Don't refetch queries for memory suggestions
      }

      console.log('[UserSessionUpdates] Refetching queries...');

      // Use refetchQueries to force immediate refetch (not just mark stale)
      queryClient.refetchQueries({ queryKey: sessionKeys.lists() })
        .then(() => console.log('[UserSessionUpdates] Lists refetch complete'))
        .catch((err) => console.warn('[UserSessionUpdates] Lists refetch failed:', err));

      queryClient.refetchQueries({ queryKey: sessionKeys.unreadCount() })
        .then(() => console.log('[UserSessionUpdates] Unread count refetch complete'))
        .catch((err) => console.warn('[UserSessionUpdates] Unread count refetch failed:', err));

      // If event includes a sessionId, also refetch that specific session's state
      if (_data.sessionId) {
        queryClient.refetchQueries({ queryKey: sessionKeys.state(_data.sessionId) })
          .then(() => console.log('[UserSessionUpdates] Session state refetch complete'))
          .catch((err) => console.warn('[UserSessionUpdates] Session state refetch failed:', err));
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!user?.id) return;

    let isCleanedUp = false;
    let channel: Ably.RealtimeChannel | null = null;

    const setupSubscription = async () => {
      try {
        console.log('[UserSessionUpdates] Setting up subscription for user:', user.id);

        const ably = await getAblyClient();

        if (isCleanedUp) return;

        // Listen for connection state changes
        const connectionListener = (stateChange: Ably.ConnectionStateChange) => {
          if (isMountedRef.current && !isCleanedUp) {
            setConnectionStatus(mapAblyState(stateChange.current));
          }
        };
        ably.connection.on(connectionListener);
        connectionListenerRef.current = connectionListener;

        // Update initial status
        if (isMountedRef.current) {
          setConnectionStatus(mapAblyState(ably.connection.state));
        }

        // Subscribe to user channel
        const channelName = REALTIME_CHANNELS.user(user.id);
        channel = ably.channels.get(channelName);
        channelRef.current = channel;

        await channel.subscribe((message: Ably.Message) => {
          if (isCleanedUp || !isMountedRef.current) return;
          const eventName = message.name as UserEventType;
          const eventData = message.data as UserEventData;
          handleEvent(eventName, eventData);
        });

        console.log('[UserSessionUpdates] Subscription setup complete');
      } catch (err) {
        console.error('[UserSessionUpdates] Subscription error:', err);
        if (isMountedRef.current && !isCleanedUp) {
          setConnectionStatus(ConnectionStatus.FAILED);
        }
      }
    };

    setupSubscription();

    return () => {
      console.log('[UserSessionUpdates] Cleaning up subscription');
      isCleanedUp = true;

      const ably = getAblyClientSync();
      if (ably && connectionListenerRef.current) {
        ably.connection.off(connectionListenerRef.current);
        connectionListenerRef.current = null;
      }

      if (channel) {
        try {
          channel.unsubscribe();
        } catch (err) {
          console.warn('[UserSessionUpdates] Error during cleanup:', err);
        }
      }

      channelRef.current = null;
    };
  }, [user?.id, handleEvent]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const currentState = getAblyConnectionState();
        if (currentState !== 'connected' && currentState !== 'connecting') {
          reconnectAbly();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return { connectionStatus };
}
