import { useState, useEffect, useCallback } from 'react';
import { CostAnalytics } from '../types/costs';
import { api } from '../services/api';

type Period = '24h' | '7d' | '30d';

interface UseCostAnalyticsResult {
  data: CostAnalytics | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCostAnalytics(period: Period): UseCostAnalyticsResult {
  const [data, setData] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getCosts({ period });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  return { data, loading, error, refetch: fetchCosts };
}
