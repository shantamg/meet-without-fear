import { useEffect, useState, useRef, useCallback } from 'react';
import Ably from 'ably';
import { ABLY_CHANNELS, AblyConnectionStatus } from '../constants/ably';

const ablyKey = import.meta.env.VITE_ABLY_KEY;

type EventCallback = (data: any) => void;

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
  isConnected: boolean;
  subscribe: (event: string, callback: EventCallback) => void;
  unsubscribe: (event: string) => void;
}

/**
 * Hook for managing Ably real-time connection and subscriptions.
 * Eliminates duplication of Ably setup logic across components.
 */
export function useAblyConnection(options: UseAblyConnectionOptions = {}): UseAblyConnectionResult {
  const { channel = ABLY_CHANNELS.AI_AUDIT_STREAM } = options;
  const [status, setStatus] = useState<AblyConnectionStatus>('disconnected');
  const clientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const sessionChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const subscriptionsRef = useRef<Map<string, EventCallback>>(new Map());

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

  useEffect(() => {
    if (!ablyKey) {
      console.warn('VITE_ABLY_KEY not set - live updates disabled');
      setStatus('error');
      return;
    }

    const client = new Ably.Realtime(ablyKey);
    clientRef.current = client;

    const ablyChannel = client.channels.get(channel);
    channelRef.current = ablyChannel;

    client.connection.on('connecting', () => setStatus('connecting'));
    client.connection.on('connected', () => setStatus('connected'));
    client.connection.on('disconnected', () => setStatus('disconnected'));
    client.connection.on('failed', () => setStatus('error'));

    // Set up subscriptions that use refs (so callbacks can be updated)
    ablyChannel.subscribe('session-created', () => callbacksRef.current.onSessionCreated?.());
    ablyChannel.subscribe('brain-activity', (msg) => callbacksRef.current.onBrainActivity?.(msg.data));
    ablyChannel.subscribe('new-message', (msg) => callbacksRef.current.onNewMessage?.(msg.data));

    // Session-specific channel subscriptions
    if (options.sessionId) {
      const sessionChannelName = `meetwithoutfear:session:${options.sessionId}`;
      const sessionChannel = client.channels.get(sessionChannelName);
      sessionChannelRef.current = sessionChannel;

      // Subscribe to context.updated events
      sessionChannel.subscribe('context.updated', (msg) => {
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
  }, [channel, options.sessionId]); // Reconnect if channel or sessionId changes

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

  return {
    status,
    isConnected: status === 'connected',
    subscribe,
    unsubscribe,
  };
}
