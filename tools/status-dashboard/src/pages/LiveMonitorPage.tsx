import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrainActivity } from '../types';
import { useAblyConnection } from '../hooks/useAblyConnection';
import { getActivityIcon, getActivityPreview } from '../utils/activityDisplay';
import { formatDuration } from '../utils/formatters';
import { ModelBadge } from '../components/metrics/ModelBadge';
import { FormattedPrice } from '../components/session/FormattedPrice';
import { EventRenderer } from '../components/events/EventRenderer';

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
  onToggle: () => void;
}

const EventCard: React.FC<EventCardProps> = React.memo(({ event, expanded, onToggle }) => {
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
      className={`live-event-card ${isPending ? 'pending' : ''} ${isFailed ? 'error' : ''} ${event.activity.status === 'COMPLETED' && (event as any)._justUpdated ? 'flash' : ''}`}
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

  const feedRef = useRef<HTMLDivElement>(null);
  const scrollCheckTimeout = useRef<number | null>(null);
  const justUpdatedIds = useRef<Set<string>>(new Set());

  // Ably connection
  const handleBrainActivity = useCallback((data: any) => {
    const activity: BrainActivity = data;
    const liveEvent: LiveEvent = {
      id: activity.id,
      sessionId: activity.sessionId,
      activity,
      receivedAt: new Date(),
    };

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

  const { status, isConnected } = useAblyConnection({
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

  // Auto-scroll
  useEffect(() => {
    if (!autoScroll || !feedRef.current) return;
    // Scroll to top since we render newest first
    feedRef.current.scrollTop = 0;
  }, [events, autoScroll]);

  // Scroll position detection (debounced)
  const handleScroll = useCallback(() => {
    if (scrollCheckTimeout.current) clearTimeout(scrollCheckTimeout.current);
    scrollCheckTimeout.current = window.setTimeout(() => {
      if (!feedRef.current) return;
      const { scrollTop } = feedRef.current;
      // If scrolled away from top (newest), disable auto-scroll
      if (scrollTop > 50) {
        setAutoScroll(false);
        setShowNewEventsBtn(true);
      } else {
        setAutoScroll(true);
        setShowNewEventsBtn(false);
      }
    }, 100);
  }, []);

  const scrollToTop = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  const eventCount = events.length;
  const now = Date.now();

  return (
    <div className="live-monitor">
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

      {/* Event Stream */}
      <div className="live-feed" ref={feedRef} onScroll={handleScroll}>
        {filteredEvents.length === 0 ? (
          <div className="live-empty">
            {isConnected
              ? 'Waiting for events...'
              : 'Connect to start receiving events'}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              expanded={expandedEvent === event.id}
              onToggle={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
            />
          ))
        )}
      </div>

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
