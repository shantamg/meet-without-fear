import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Session } from '../../types';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

interface QuickAction {
  label: string;
  path: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Go to Dashboard', path: '/' },
  { label: 'Go to Costs', path: '/costs' },
  { label: 'Go to Live Monitor', path: '/live' },
  { label: 'Go to Sessions', path: '/sessions' },
];

const RECENT_KEY = 'neural-monitor-recent-searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const recent = getRecentSearches().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches] = useState(getRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSessions([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSessions([]);
      return;
    }
    try {
      const { sessions: results } = await api.getSessions(undefined, { search: q }, 5);
      setSessions(results);
    } catch {
      setSessions([]);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIndex(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 200);
    },
    [search]
  );

  // Filtered quick actions
  const filteredActions = useMemo(() => {
    if (!query.trim()) return QUICK_ACTIONS;
    const lower = query.toLowerCase();
    return QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(lower));
  }, [query]);

  // Combined result items
  const allItems = useMemo(() => {
    const items: Array<{ type: 'session' | 'action' | 'recent'; label: string; id: string; path: string }> = [];

    sessions.forEach((s) => {
      const label = s.participants || s.title || s.id.slice(0, 8);
      items.push({ type: 'session', label, id: s.id, path: `/sessions/${s.id}` });
    });

    filteredActions.forEach((a) => {
      items.push({ type: 'action', label: a.label, id: a.path, path: a.path });
    });

    if (!query.trim()) {
      recentSearches.forEach((r) => {
        items.push({ type: 'recent', label: r, id: `recent-${r}`, path: '' });
      });
    }

    return items;
  }, [sessions, filteredActions, query, recentSearches]);

  const handleSelect = useCallback(
    (item: (typeof allItems)[number]) => {
      if (item.type === 'recent') {
        handleInputChange(item.label);
        return;
      }
      if (query.trim()) saveRecentSearch(query.trim());
      navigate(item.path);
      onClose();
    },
    [navigate, onClose, query, handleInputChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((p) => Math.min(allItems.length - 1, p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((p) => Math.max(0, p - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (allItems[selectedIndex]) {
          handleSelect(allItems[selectedIndex]);
        }
      }
    },
    [allItems, selectedIndex, handleSelect, onClose]
  );

  if (!open) return null;

  return (
    <div className="global-search-backdrop" onClick={onClose}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="global-search-input-wrapper">
          <span className="global-search-icon">{'\u2315'}</span>
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="Search sessions, actions..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <kbd className="global-search-kbd">Esc</kbd>
        </div>

        <div className="global-search-results">
          {sessions.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Sessions</div>
              {allItems
                .filter((item) => item.type === 'session')
                .map((item) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      className={`global-search-item${globalIdx === selectedIndex ? ' selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="search-item-icon">{'\u2630'}</span>
                      <span className="search-item-label">{item.label}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {filteredActions.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Quick Actions</div>
              {allItems
                .filter((item) => item.type === 'action')
                .map((item) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      className={`global-search-item${globalIdx === selectedIndex ? ' selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="search-item-icon">{'\u2192'}</span>
                      <span className="search-item-label">{item.label}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {!query.trim() && recentSearches.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Recent Searches</div>
              {allItems
                .filter((item) => item.type === 'recent')
                .map((item) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      className={`global-search-item${globalIdx === selectedIndex ? ' selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="search-item-icon">{'\u29BB'}</span>
                      <span className="search-item-label">{item.label}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {query.trim() && sessions.length === 0 && filteredActions.length === 0 && (
            <div className="global-search-empty">No results found</div>
          )}
        </div>
      </div>
    </div>
  );
}
