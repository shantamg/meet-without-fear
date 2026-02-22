import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { PromptDetail } from '../types/prompt';

interface UsePromptDetailResult {
  data: PromptDetail | null;
  loading: boolean;
  error: string | null;
}

export function usePromptDetail(activityId: string | undefined): UsePromptDetailResult {
  const [data, setData] = useState<PromptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetch() {
      try {
        setLoading(true);
        setError(null);
        const result = await api.getPromptDetail(activityId!);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load prompt detail');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetch();

    return () => {
      cancelled = true;
    };
  }, [activityId]);

  return { data, loading, error };
}
