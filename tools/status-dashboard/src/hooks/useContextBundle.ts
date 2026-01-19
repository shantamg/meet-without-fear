import { useState, useEffect, useCallback } from 'react';
import { ContextResponse } from '../types';
import { api } from '../services/api';
import { useAblyConnection } from './useAblyConnection';

interface UseContextBundleResult {
  contextData: ContextResponse | null;
  loading: boolean;
  error: string | null;
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching and managing session context with real-time updates.
 * The context is refetched when a 'context.updated' event is received.
 */
export function useContextBundle(sessionId: string | undefined): UseContextBundleResult {
  const [contextData, setContextData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const data = await api.getSessionContext(sessionId);
      setContextData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load context');
      console.error('[useContextBundle] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Handle context.updated events for real-time updates
  const handleContextUpdated = useCallback((event: { sessionId: string; userId: string; assembledAt: string }) => {
    if (event.sessionId !== sessionId) return;
    console.log('[useContextBundle] Context updated event received, refetching...');
    fetchContext();
  }, [sessionId, fetchContext]);

  // Set up Ably connection for real-time updates
  const { status: connectionStatus } = useAblyConnection({
    onContextUpdated: handleContextUpdated,
    sessionId,
  });

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return {
    contextData,
    loading,
    error,
    connectionStatus,
    refetch: fetchContext,
  };
}
