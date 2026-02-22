import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Session, SessionFilters, SessionSortField, SortOrder, SessionStatus } from '../types';
import { api } from '../services/api';

const PAGE_SIZE = 25;

interface UseFilteredSessionsResult {
  sessions: Session[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  filters: SessionFilters;
  setFilters: (filters: SessionFilters) => void;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  refetch: () => Promise<void>;
}

function parseFiltersFromParams(params: URLSearchParams): SessionFilters {
  const filters: SessionFilters = {};

  const search = params.get('search');
  if (search) filters.search = search;

  const status = params.get('status');
  if (status) filters.status = status.split(',') as SessionStatus[];

  const type = params.get('type');
  if (type === 'PARTNER' || type === 'INNER_WORK') filters.type = type;

  const stage = params.get('stage');
  if (stage) filters.stage = stage.split(',').map(Number).filter(n => !isNaN(n));

  const dateRange = params.get('dateRange');
  if (dateRange === 'today' || dateRange === '7d' || dateRange === '30d') filters.dateRange = dateRange;

  const sort = params.get('sort') as SessionSortField | null;
  if (sort) filters.sort = sort;

  const order = params.get('order') as SortOrder | null;
  if (order) filters.order = order;

  return filters;
}

function filtersToParams(filters: SessionFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status.length > 0) params.set('status', filters.status.join(','));
  if (filters.type) params.set('type', filters.type);
  if (filters.stage && filters.stage.length > 0) params.set('stage', filters.stage.join(','));
  if (filters.dateRange && filters.dateRange !== 'all') params.set('dateRange', filters.dateRange);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.order) params.set('order', filters.order);
  if (page > 1) params.set('page', String(page));

  return params;
}

export function useFilteredSessions(): UseFilteredSessionsResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);
  const page = useMemo(() => {
    const p = parseInt(searchParams.get('page') || '1', 10);
    return isNaN(p) || p < 1 ? 1 : p;
  }, [searchParams]);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch a large batch with filters applied server-side
      const data = await api.getSessions(undefined, filters, 500);
      setAllSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalCount = allSessions.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Clamp page
  const clampedPage = Math.min(page, totalPages);

  const sessions = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return allSessions.slice(start, start + PAGE_SIZE);
  }, [allSessions, clampedPage]);

  const setFilters = useCallback((newFilters: SessionFilters) => {
    setSearchParams(filtersToParams(newFilters, 1), { replace: true });
  }, [setSearchParams]);

  const setPage = useCallback((newPage: number) => {
    setSearchParams(filtersToParams(filters, newPage), { replace: true });
  }, [setSearchParams, filters]);

  return {
    sessions,
    totalCount,
    loading,
    error,
    filters,
    setFilters,
    page: clampedPage,
    setPage,
    totalPages,
    refetch: fetchSessions,
  };
}
