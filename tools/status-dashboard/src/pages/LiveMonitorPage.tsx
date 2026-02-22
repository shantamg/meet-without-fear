import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VariableSizeList as VList, ListChildComponentProps } from 'react-window';
import { BrainActivity } from '../types';
import { useAblyConnection } from '../hooks/useAblyConnection';
import { getActivityIcon, getActivityPreview } from '../utils/activityDisplay';
import { formatDuration } from '../utils/formatters';
import { ModelBadge } from '../components/metrics/ModelBadge';
import { FormattedPrice } from '../components/session/FormattedPrice';
import { EventRenderer } from '../components/events/EventRenderer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { playErrorSound } from '../utils/notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveEvent {
  id: string;
  sessionId: string;
  sessionName?: string;
  activity: BrainActivity;
  receivedAt: Date;
}

type FilterMode = 'all' | 'llm' | 'errors';

const MAX_EVENTS = 500;
const ACTIVITY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function shortSessionId(id: string): string {
  return id.slice(0, 8);
}

/** Deterministic color for a session id */
function sessionColor(id: string): string {
  const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function matchesFilter(event: LiveEvent, filter: FilterMode): boolean {
  if (filter === 'all') return true;
  if (filter === 'llm') return event.activity.activityType === 'LLM_CALL';
  if (filter === 'errors') return event.activity.status === 'FAILED';
  return true;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ConnectionDot: React.FC<{ status: string }> = ({ status }) => {
  let color = '#ef4444';
  let label = 'Disconnected';
  if (status === 'connected') { color = '#4ade80'; label = 'Connected'; }
  else if (status === 'connecting') { color = '#fbbf24'; label = 'Reconnecting'; }
  else if (status === 'error') { color = '#ef4444'; label = 'Error'; }
  return (
    <span className="live-connection-status">
      <span className="live-connection-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
};

interface SessionTabProps {
  id: string;
  name: string;
  active: boolean;
  hasRecentActivity: boolean;
  onClick: () => void;
  onClose?: () => void;
}

const SessionTab: React.FC<SessionTabProps> = React.memo(({ id, name, active, hasRecentActivity, onClick, onClose }) => (
  <button
    className={`live-session-tab ${active ? 'active' : ''}`}
    onClick={onClick}
    title={id}
  >
    {hasRecentActivity && <span className="live-tab-pulse" />}
    <span className="live-tab-label">{name}</span>
    {onClose && (
      <span
        className="live-tab-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        &times;
      </span>
    )}
  </button>
));

interface EventCardProps {
  event: LiveEvent;
  expanded: boolean;
  justUpdated?: boolean;
  onToggle: () => void;
}

const EventCard: React.FC<EventCardProps> = React.memo(({ event, expanded, justUpdated, onToggle }) => {
  const { activity } = event;
  const preview = getActivityPreview(activity);
  const icon = getActivityIcon(activity.activityType);
  const isPending = activity.status === 'PENDING';
  const isFailed = activity.status === 'FAILED';

  // Color the left border by activity type
  const borderColor = isFailed
    ? '#ef4444'
    : activity.activityType === 'LLM_CALL'
      ? '#3b82f6'
      : activity.activityType === 'EMBEDDING'
        ? '#8b5cf6'
        : activity.activityType === 'RETRIEVAL'
          ? '#f59e0b'
          : 'var(--border)';

  return (
    <div
      className={`live-event-card ${isPending ? 'pending' : ''} ${isFailed ? 'error' : ''} ${justUpdated ? 'flash' : ''}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="live-event-header" onClick={onToggle}>
        <span className="live-event-timestamp">{formatTimestamp(event.receivedAt)}</span>

        <span className="live-event-session-dot" style={{ background: sessionColor(event.sessionId) }} />
        <span className="live-event-session-name">{event.sessionName || shortSessionId(event.sessionId)}</span>

        <span className="live-event-icon">{icon}</span>
        <span className="live-event-title">{preview.name}</span>

        {activity.model && <ModelBadge model={activity.model} />}

        {activity.durationMs > 0 && (
          <span className="live-event-duration">{formatDuration(activity.durationMs)}</span>
        )}

        {activity.cost > 0 && (
          <span className="live-event-cost"><FormattedPrice value={activity.cost} /></span>
        )}

        <span className={`live-event-status ${activity.status.toLowerCase()}`}>
          {isPending && <span className="spinner">↻</span>}
          {activity.status === 'COMPLETED' && <span className="icon-success">✓</span>}
          {isFailed && <span className="icon-error">✕</span>}
        </span>

        {preview.preview && (
          <span className="live-event-preview" title={preview.preview}>{preview.preview}</span>
        )}

        <span className="live-event-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="live-event-expanded">
          <EventRenderer activity={activity} defaultExpanded />
        </div>
      )}
    </div>
  );
});

const MeasuredEventRow: React.FC<{
  index: number;
  event: LiveEvent;
  expanded: boolean;
  justUpdated: boolean;
  onToggle: () => void;
  onMeasure: (index: number, height: number) => void;
}> = React.memo(({ index, event, expanded, justUpdated, onToggle, onMeasure }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      const height = rowRef.current.getBoundingClientRect().height;
      onMeasure(index, height);
    }
  }, [index, expanded, onMeasure]);

  return (
    <div ref={rowRef}>
      <EventCard
        event={event}
        expanded={expanded}
        justUpdated={justUpdated}
        onToggle={onToggle}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveMonitorPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [buffer, setBuffer] = useState<LiveEvent[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewEventsBtn, setShowNewEventsBtn] = useState(false);
  const [sessionTabs, setSessionTabs] = useState<Map<string, { name: string; lastActivity: number }>>(new Map());
  const [closedTabs, setClosedTabs] = useState<Set<string>>(new Set());
  const [containerHeight, setContainerHeight] = useState(600);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const scrollCheckTimeout = useRef<number | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const justUpdatedIds = useRef<Set<string>>(new Set());
  const listRef = useRef<VList>(null);
  const rowHeightCache = useRef<Map<number, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container height with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight || 600);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height || 600);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ably connection
  const handleBrainActivity = useCallback((data: any) => {
    const activity: BrainActivity = data;
    const liveEvent: LiveEvent = {
      id: activity.id,
      sessionId: activity.sessionId,
      activity,
      receivedAt: new Date(),
    };

    // Play error sound on FAILED activities
    if (activity.status === 'FAILED' && soundEnabledRef.current) {
      playErrorSound();
    }

    if (isPaused) {
      setBuffer((prev) => [...prev, liveEvent]);
      return;
    }

    setEvents((prev) => {
      // Check if this is an update to an existing event (PENDING → COMPLETED)
      const existingIdx = prev.findIndex((e) => e.id === activity.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...liveEvent, receivedAt: prev[existingIdx].receivedAt };
        justUpdatedIds.current.add(activity.id);
        setTimeout(() => justUpdatedIds.current.delete(activity.id), 1500);
        return updated;
      }
      // New event – prepend and cap
      const next = [liveEvent, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });

    // Update session tabs
    setSessionTabs((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(activity.sessionId);
      updated.set(activity.sessionId, {
        name: existing?.name || shortSessionId(activity.sessionId),
        lastActivity: Date.now(),
      });
      return updated;
    });
  }, [isPaused]);

  const { status, connectionState, isConnected, reconnect, missedEventCount, clearMissedCount } = useAblyConnection({
    onBrainActivity: handleBrainActivity,
  });

  // Resume: flush buffer
  const handleResume = useCallback(() => {
    setIsPaused(false);
    setEvents((prev) => {
      const merged = [...buffer, ...prev];
      return merged.length > MAX_EVENTS ? merged.slice(0, MAX_EVENTS) : merged;
    });
    setBuffer([]);
  }, [buffer]);

  // Virtualized list: row height estimation + measurement
  const getItemSize = useCallback((index: number): number => {
    if (rowHeightCache.current.has(index)) {
      return rowHeightCache.current.get(index)!;
    }
    // Estimate: collapsed ~80px, expanded ~400px
    return 80;
  }, []);

  const setRowHeight = useCallback((index: number, height: number) => {
    if (rowHeightCache.current.get(index) !== height) {
      rowHeightCache.current.set(index, height);
      listRef.current?.resetAfterIndex(index, false);
    }
  }, []);

  // Auto-scroll: scroll to index 0 (newest) when enabled
  useEffect(() => {
    if (!autoScroll) return;
    listRef.current?.scrollToItem(0, 'start');
  }, [events, autoScroll]);

  // Scroll position detection (debounced) via VList onScroll
  const handleVirtualScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    if (scrollCheckTimeout.current) clearTimeout(scrollCheckTimeout.current);
    scrollCheckTimeout.current = window.setTimeout(() => {
      if (scrollOffset > 50) {
        setAutoScroll(false);
        setShowNewEventsBtn(true);
      } else {
        setAutoScroll(true);
        setShowNewEventsBtn(false);
      }
    }, 100);
  }, []);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToItem(0, 'start');
    setAutoScroll(true);
    setShowNewEventsBtn(false);
  }, []);

  // Refresh "recent activity" dots periodically
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeTab !== 'all') {
      result = result.filter((e) => e.sessionId === activeTab);
    }
    return result.filter((e) => matchesFilter(e, filter));
  }, [events, activeTab, filter]);

  // Reset height cache when filtered events change
  useEffect(() => {
    rowHeightCache.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [filteredEvents.length]);

  const eventCount = events.length;
  const now = Date.now();

  return (
    <div className="live-monitor">
      {/* Reconnecting Banner */}
      {connectionState === 'reconnecting' && (
        <div style={{
          background: '#92400e',
          color: '#fbbf24',
          padding: '0.5rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          <span className="spinner">↻</span>
          Reconnecting...
          <button className="live-btn" onClick={reconnect} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
            Retry Now
          </button>
        </div>
      )}

      {connectionState === 'disconnected' && status === 'error' && (
        <div style={{
          background: '#7f1d1d',
          color: '#fca5a5',
          padding: '0.5rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          Connection lost.
          <button className="live-btn" onClick={reconnect} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
            Reconnect
          </button>
        </div>
      )}

      {/* Missed events recovery banner */}
      {missedEventCount > 0 && (
        <div style={{
          background: '#1e3a5f',
          color: '#93c5fd',
          padding: '0.4rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          Recovered {missedEventCount} event{missedEventCount !== 1 ? 's' : ''} missed during disconnection
          <button
            className="live-btn"
            onClick={clearMissedCount}
            style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="live-header">
        <div className="live-header-left">
          <ConnectionDot status={status} />
          <span className="live-event-counter">{eventCount} events received</span>
        </div>
        <div className="live-header-right">
          <select
            className="live-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
          >
            <option value="all">All Events</option>
            <option value="llm">LLM Calls Only</option>
            <option value="errors">Errors Only</option>
          </select>

          <button
            className={`live-btn${soundEnabled ? ' live-btn-active' : ''}`}
            onClick={() => setSoundEnabled(prev => !prev)}
            title={soundEnabled ? 'Disable error sound' : 'Enable error sound'}
          >
            {soundEnabled ? '\uD83D\uDD14' : '\uD83D\uDD15'} Sound
          </button>

          {isPaused ? (
            <button className="live-btn live-btn-resume" onClick={handleResume}>
              ▶ Resume{buffer.length > 0 ? ` (${buffer.length} buffered)` : ''}
            </button>
          ) : (
            <button className="live-btn live-btn-pause" onClick={() => setIsPaused(true)}>
              ⏸ Pause
            </button>
          )}
        </div>
      </div>

      {/* Session Tabs */}
      <div className="live-tabs">
        <button
          className={`live-session-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Sessions
        </button>
        {Array.from(sessionTabs.entries())
          .filter(([id]) => !closedTabs.has(id))
          .map(([id, info]) => (
            <SessionTab
              key={id}
              id={id}
              name={info.name}
              active={activeTab === id}
              hasRecentActivity={now - info.lastActivity < ACTIVITY_TIMEOUT_MS}
              onClick={() => setActiveTab(id)}
              onClose={() => {
                setClosedTabs((prev) => new Set(prev).add(id));
                if (activeTab === id) setActiveTab('all');
              }}
            />
          ))}
      </div>

      {/* Event Stream (virtualized) */}
      <ErrorBoundary fallback={
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '0.5rem' }}>Stream disconnected</p>
          <button
            className="live-btn"
            onClick={() => window.location.reload()}
          >
            Reconnect
          </button>
        </div>
      }>
        <div className="live-feed" ref={containerRef}>
          {filteredEvents.length === 0 ? (
            <div className="live-empty">
              {isConnected
                ? 'Waiting for events...'
                : 'Connect to start receiving events'}
            </div>
          ) : (
            <VList
              ref={listRef}
              height={containerHeight}
              width="100%"
              itemCount={filteredEvents.length}
              itemSize={getItemSize}
              overscanCount={5}
              onScroll={handleVirtualScroll}
            >
              {({ index, style }: ListChildComponentProps) => {
                const event = filteredEvents[index];
                return (
                  <div style={style as React.CSSProperties}>
                    <MeasuredEventRow
                      index={index}
                      event={event}
                      expanded={expandedEvent === event.id}
                      justUpdated={justUpdatedIds.current.has(event.id)}
                      onToggle={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                      onMeasure={setRowHeight}
                    />
                  </div>
                );
              }}
            </VList>
          )}
        </div>
      </ErrorBoundary>

      {/* New events floating button */}
      {showNewEventsBtn && (
        <button className="live-new-events-btn" onClick={scrollToTop}>
          ↓ New events
        </button>
      )}

      {/* Footer */}
      <div className="live-footer">
        <label className="live-auto-scroll-label">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => {
              setAutoScroll(e.target.checked);
              if (e.target.checked) scrollToTop();
            }}
          />
          Auto-scroll
        </label>
        {isPaused && buffer.length > 0 && (
          <span className="live-buffer-count">{buffer.length} events buffered</span>
        )}
      </div>
    </div>
  );
}
