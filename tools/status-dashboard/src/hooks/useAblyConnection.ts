import { useEffect, useState, useRef, useCallback } from 'react';
import Ably from 'ably';
import { ABLY_CHANNELS, AblyConnectionStatus } from '../constants/ably';
import { api } from '../services/api';

const ablyKey = import.meta.env.VITE_ABLY_KEY as string | undefined;
const apiBase = import.meta.env.VITE_API_URL || '';

type EventCallback = (data: any) => void;

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

interface UseAblyConnectionOptions {
  channel?: string;
  /** Session ID for subscribing to session-specific channels */
  sessionId?: string;
  onSessionCreated?: () => void;
  onBrainActivity?: EventCallback;
  onNewMessage?: EventCallback;
  /** Called when context.updated event is received on session channel */
  onContextUpdated?: EventCallback;
}

interface UseAblyConnectionResult {
  status: AblyConnectionStatus;
  connectionState: ConnectionState;
  isConnected: boolean;
  reconnect: () => void;
  subscribe: (event: string, callback: EventCallback) => void;
  unsubscribe: (event: string) => void;
  missedEventCount: number;
  clearMissedCount: () => void;
}

/**
 * Hook for managing Ably real-time connection and subscriptions.
 * Includes recovery logic: reconnection state tracking, manual reconnect,
 * and gap recovery that fetches missed events after disconnection.
 */
export function useAblyConnection(options: UseAblyConnectionOptions = {}): UseAblyConnectionResult {
  const { channel = ABLY_CHANNELS.AI_AUDIT_STREAM } = options;
  const [status, setStatus] = useState<AblyConnectionStatus>('disconnected');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [missedEventCount, setMissedEventCount] = useState(0);
  const clientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const sessionChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const subscriptionsRef = useRef<Map<string, EventCallback>>(new Map());
  const lastEventTimestampRef = useRef<number>(Date.now());
  const wasDisconnectedRef = useRef(false);
  const recoveringRef = useRef(false);

  // Store callbacks in refs so they can be updated without reconnecting
  const callbacksRef = useRef({
    onSessionCreated: options.onSessionCreated,
    onBrainActivity: options.onBrainActivity,
    onNewMessage: options.onNewMessage,
    onContextUpdated: options.onContextUpdated,
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onSessionCreated: options.onSessionCreated,
      onBrainActivity: options.onBrainActivity,
      onNewMessage: options.onNewMessage,
      onContextUpdated: options.onContextUpdated,
    };
  }, [options.onSessionCreated, options.onBrainActivity, options.onNewMessage, options.onContextUpdated]);

  // Track last event timestamp for recovery
  const trackEvent = useCallback(() => {
    lastEventTimestampRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Use token auth via backend when no direct API key is set
    const ablyOptions: Ably.ClientOptions = ablyKey
      ? { key: ablyKey }
      : {
          authCallback: async (_params, callback) => {
            try {
              const { getAuthHeaders } = await import('../services/api');
              const headers = await getAuthHeaders();
              const res = await fetch(`${apiBase}/api/brain/ably-token`, { headers });
              if (!res.ok) throw new Error(`Ably token request failed: ${res.status}`);
              const json = await res.json();
              callback(null, json.data);
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              callback({ message, code: 40000, statusCode: 401 } as Ably.ErrorInfo, null);
            }
          },
        };

    if (!ablyKey && !apiBase) {
      console.warn('Neither VITE_ABLY_KEY nor VITE_API_URL set - live updates disabled');
      setStatus('error');
      setConnectionState('disconnected');
      return;
    }

    const client = new Ably.Realtime(ablyOptions);
    clientRef.current = client;

    const ablyChannel = client.channels.get(channel);
    channelRef.current = ablyChannel;

    // Recovery: fetch events that occurred during the disconnection gap
    async function recoverMissedEvents() {
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      const since = lastEventTimestampRef.current;

      try {
        const { sessions } = await api.getSessions();
        const seenIds = new Set<string>();
        let recoveredCount = 0;

        for (const session of sessions.slice(0, 20)) {
          try {
            const { activities } = await api.getSessionActivity(session.id);
            for (const activity of activities) {
              const ts = new Date(activity.createdAt).getTime();
              if (ts > since && !seenIds.has(activity.id)) {
                seenIds.add(activity.id);
                callbacksRef.current.onBrainActivity?.(activity);
                recoveredCount++;
              }
            }
          } catch {
            // Skip failed session fetches
          }
        }

        if (recoveredCount > 0) {
          setMissedEventCount(recoveredCount);
        }
      } catch {
        // Recovery failed silently
      } finally {
        recoveringRef.current = false;
      }
    }

    client.connection.on('connecting', () => {
      setStatus('connecting');
      setConnectionState('reconnecting');
    });
    client.connection.on('connected', () => {
      setStatus('connected');
      setConnectionState('connected');
      // Trigger gap recovery if we were previously disconnected
      if (wasDisconnectedRef.current && !recoveringRef.current) {
        wasDisconnectedRef.current = false;
        recoverMissedEvents();
      }
    });
    client.connection.on('disconnected', () => {
      setStatus('disconnected');
      setConnectionState('reconnecting');
      wasDisconnectedRef.current = true;
    });
    client.connection.on('failed', () => {
      setStatus('error');
      setConnectionState('disconnected');
      wasDisconnectedRef.current = true;
    });
    client.connection.on('suspended', () => {
      setStatus('disconnected');
      setConnectionState('disconnected');
      wasDisconnectedRef.current = true;
    });

    // Set up subscriptions that use refs (so callbacks can be updated)
    ablyChannel.subscribe('session-created', () => {
      trackEvent();
      callbacksRef.current.onSessionCreated?.();
    });
    ablyChannel.subscribe('brain-activity', (msg) => {
      trackEvent();
      callbacksRef.current.onBrainActivity?.(msg.data);
    });
    ablyChannel.subscribe('new-message', (msg) => {
      trackEvent();
      callbacksRef.current.onNewMessage?.(msg.data);
    });

    // Session-specific channel subscriptions
    if (options.sessionId) {
      const sessionChannelName = `meetwithoutfear:session:${options.sessionId}`;
      const sessionChannel = client.channels.get(sessionChannelName);
      sessionChannelRef.current = sessionChannel;

      // Subscribe to context.updated events
      sessionChannel.subscribe('context.updated', (msg) => {
        trackEvent();
        console.log('[useAblyConnection] context.updated event received:', msg.data);
        callbacksRef.current.onContextUpdated?.(msg.data);
      });
    }

    return () => {
      subscriptionsRef.current.clear();
      ablyChannel.unsubscribe();
      if (sessionChannelRef.current) {
        sessionChannelRef.current.unsubscribe();
        sessionChannelRef.current = null;
      }
      client.close();
      clientRef.current = null;
      channelRef.current = null;
    };
  }, [channel, options.sessionId, trackEvent]); // Reconnect if channel or sessionId changes

  const reconnect = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;

    setConnectionState('reconnecting');
    client.connection.once('connected', () => {
      setConnectionState('connected');
    });
    client.connect();
  }, []);

  const subscribe = useCallback((event: string, callback: EventCallback) => {
    if (channelRef.current) {
      channelRef.current.subscribe(event, (msg) => callback(msg.data));
      subscriptionsRef.current.set(event, callback);
    }
  }, []);

  const unsubscribe = useCallback((event: string) => {
    if (channelRef.current) {
      channelRef.current.unsubscribe(event);
      subscriptionsRef.current.delete(event);
    }
  }, []);

  const clearMissedCount = useCallback(() => {
    setMissedEventCount(0);
  }, []);

  return {
    status,
    connectionState,
    isConnected: status === 'connected',
    reconnect,
    subscribe,
    unsubscribe,
    missedEventCount,
    clearMissedCount,
  };
}
