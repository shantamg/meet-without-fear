import { useState, useEffect, useCallback } from 'react';
import { Session } from '../types';
import { api } from '../services/api';
import { useAblyConnection } from './useAblyConnection';

interface UseSessionsResult {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
}

/**
 * Hook for fetching and managing sessions list with real-time updates.
 */
export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const { sessions } = await api.getSessions();
      setSessions(sessions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to backend');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up Ably connection with session-created callback
  const { status: connectionStatus } = useAblyConnection({
    onSessionCreated: fetchSessions,
  });

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    refetch: fetchSessions,
    connectionStatus,
  };
}
