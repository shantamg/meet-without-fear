import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionFilters as SessionFiltersType, SessionStatus } from '../../types';

interface SessionFiltersProps {
  filters: SessionFiltersType;
  onChange: (filters: SessionFiltersType) => void;
}

const STATUS_OPTIONS: SessionStatus[] = [
  'ACTIVE', 'WAITING', 'RESOLVED', 'ABANDONED', 'ARCHIVED', 'CREATED', 'INVITED', 'PAUSED', 'COMPLETED',
];

const STAGE_OPTIONS = [
  { value: 0, label: '0 Setup' },
  { value: 1, label: '1 Feel Heard' },
  { value: 2, label: '2 Perspective' },
  { value: 3, label: '3 Needs' },
  { value: 4, label: '4 Resolution' },
];

const DATE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
];

function hasActiveFilters(filters: SessionFiltersType): boolean {
  return !!(
    filters.search ||
    (filters.status && filters.status.length > 0) ||
    filters.type ||
    (filters.stage && filters.stage.length > 0) ||
    (filters.dateRange && filters.dateRange !== 'all')
  );
}

export function SessionFiltersBar({ filters, onChange }: SessionFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local search with filter prop changes
  useEffect(() => {
    setSearchValue(filters.search || '');
  }, [filters.search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value || undefined });
    }, 300);
  }, [filters, onChange]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const toggleStatus = (status: SessionStatus) => {
    const current = filters.status || [];
    const next = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onChange({ ...filters, status: next.length > 0 ? next : undefined });
  };

  const toggleStage = (stage: number) => {
    const current = filters.stage || [];
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage];
    onChange({ ...filters, stage: next.length > 0 ? next : undefined });
  };

  const clearFilters = () => {
    setSearchValue('');
    onChange({ sort: filters.sort, order: filters.order });
  };

  return (
    <div className="session-filters">
      <div className="filter-row">
        {/* Search */}
        <div className="filter-item filter-search">
          <input
            type="text"
            className="filter-input"
            placeholder="Search by name, email, ID..."
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Status Multi-Select */}
        <div className="filter-item">
          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
            selected={filters.status || []}
            onToggle={toggleStatus}
          />
        </div>

        {/* Type Select */}
        <div className="filter-item">
          <select
            className="filter-select"
            value={filters.type || ''}
            onChange={e => onChange({ ...filters, type: (e.target.value || undefined) as any })}
          >
            <option value="">All Types</option>
            <option value="PARTNER">Partner</option>
            <option value="INNER_WORK">Inner Thoughts</option>
          </select>
        </div>

        {/* Stage Multi-Select */}
        <div className="filter-item">
          <MultiSelect
            label="Stage"
            options={STAGE_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
            selected={filters.stage || []}
            onToggle={toggleStage}
            renderBadge={(value) => {
              const stage = value as number;
              return <span className={`filter-stage-dot stage-${stage}`} />;
            }}
          />
        </div>

        {/* Date Range */}
        <div className="filter-item">
          <select
            className="filter-select"
            value={filters.dateRange || 'all'}
            onChange={e => onChange({ ...filters, dateRange: e.target.value as any })}
          >
            {DATE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Clear */}
        {hasActiveFilters(filters) && (
          <button className="filter-clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

// -- Multi-Select Dropdown Component --

interface MultiSelectProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  renderBadge?: (value: T) => React.ReactNode;
}

function MultiSelect<T extends string | number>({ label, options, selected, onToggle, renderBadge }: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayLabel = selected.length > 0 ? `${label} (${selected.length})` : label;

  return (
    <div className="multi-select" ref={ref}>
      <button className="filter-select multi-select-trigger" onClick={() => setOpen(!open)}>
        {displayLabel}
        <span className="multi-select-arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="multi-select-dropdown">
          {options.map(opt => (
            <label key={String(opt.value)} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => onToggle(opt.value)}
              />
              {renderBadge && renderBadge(opt.value)}
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
