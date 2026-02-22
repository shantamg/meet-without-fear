import { useFilteredSessions } from '../hooks/useFilteredSessions';
import { SessionFiltersBar } from '../components/filters/SessionFilters';
import { SessionTable } from '../components/filters/SessionTable';
import { Pagination } from '../components/filters/Pagination';
import { SessionSortField } from '../types';

export function SessionListPage() {
  const {
    sessions,
    totalCount,
    loading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    totalPages,
  } = useFilteredSessions();

  const handleSort = (field: SessionSortField) => {
    if (filters.sort === field) {
      // Toggle order
      setFilters({ ...filters, order: filters.order === 'asc' ? 'desc' : 'asc' });
    } else {
      // Default order: cost desc, age desc, others asc
      const defaultOrder = field === 'cost' || field === 'age' ? 'desc' : 'asc';
      setFilters({ ...filters, sort: field, order: defaultOrder });
    }
  };

  return (
    <div className="session-list-page">
      <div className="session-list-header">
        <h1>Sessions</h1>
        <span className="session-count-badge">{totalCount}</span>
      </div>

      <SessionFiltersBar filters={filters} onChange={setFilters} />

      {loading && <div className="session-list-loading">Loading sessions...</div>}
      {error && <div className="session-list-error">{error}</div>}

      {!loading && !error && (
        <>
          <SessionTable
            sessions={sessions}
            sort={filters.sort}
            order={filters.order}
            onSort={handleSort}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={25}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
