import { useState, useEffect, useCallback } from 'react';
import { Session } from '../types';
import { api } from '../services/api';
import { useAblyConnection } from './useAblyConnection';

interface UseSessionsResult {
  sessions: Session[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
}

/**
 * Hook for fetching and managing sessions list with real-time updates and infinite scroll.
 */
export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Initial fetch
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSessions();
      setSessions(data.sessions);
      setNextCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to backend');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load more pages
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;

    try {
      setLoadingMore(true);
      const data = await api.getSessions(nextCursor);

      setSessions(prev => {
        // Prevent duplicates
        const existingIds = new Set(prev.map(s => s.id));
        const newSessions = data.sessions.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSessions];
      });

      setNextCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor]);

  // Set up Ably connection with session-created callback
  const { status: connectionStatus } = useAblyConnection({
    onSessionCreated: async () => {
      // For updates, we just re-fetch the first page to get the new item
      // A better approach might be to prepend the new session if we had the data
      fetchSessions();
    },
  });

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    loadingMore,
    error,
    refetch: fetchSessions,
    loadMore,
    hasMore,
    connectionStatus,
  };
}
