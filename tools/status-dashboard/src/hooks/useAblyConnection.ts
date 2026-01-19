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
  const subscriptionsRef = useRef<Map<string, EventCallback>>(new Map());

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

    // Set up initial subscriptions from options
    if (options.onSessionCreated) {
      ablyChannel.subscribe('session-created', () => options.onSessionCreated?.());
    }
    if (options.onBrainActivity) {
      ablyChannel.subscribe('brain-activity', (msg) => options.onBrainActivity?.(msg.data));
    }
    if (options.onNewMessage) {
      ablyChannel.subscribe('new-message', (msg) => options.onNewMessage?.(msg.data));
    }

    // Session-specific channel subscriptions
    let sessionChannel: Ably.RealtimeChannel | null = null;
    if (options.sessionId) {
      const sessionChannelName = `meetwithoutfear:session:${options.sessionId}`;
      sessionChannel = client.channels.get(sessionChannelName);

      // Subscribe to context.updated events
      if (options.onContextUpdated) {
        sessionChannel.subscribe('context.updated', (msg) => options.onContextUpdated?.(msg.data));
      }
    }

    return () => {
      subscriptionsRef.current.clear();
      ablyChannel.unsubscribe();
      if (sessionChannel) {
        sessionChannel.unsubscribe();
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
