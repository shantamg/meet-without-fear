import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VariableSizeList as VList, ListChildComponentProps } from 'react-window';
import { useSessionActivity } from '../../hooks/useSessionActivity';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SessionDetailHeader } from './SessionDetailHeader';
import { SplitView } from './SplitView';
import { TurnView } from './TurnView';
import { SessionCostTab } from './SessionCostTab';
import { SessionPromptsTab } from './SessionPromptsTab';
import { Turn } from '../../utils/turnGrouping';
import { PlaybackControls } from '../playback/PlaybackControls';
import { PlaybackOverlay } from '../playback/PlaybackOverlay';

type TabId = 'timeline' | 'context' | 'cost' | 'prompts';

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('timeline');

  // Playback state
  const [playbackActive, setPlaybackActive] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);

  // Keyboard navigation state
  const [focusedTurnIndex, setFocusedTurnIndex] = useState(-1);
  const [focusedColumn, setFocusedColumn] = useState<'left' | 'right'>('left');

  // Expand/collapse state for virtualized turns
  const [expandedTurnIds, setExpandedTurnIds] = useState<Set<number>>(new Set());
  const listRef = useRef<VList>(null);

  const {
    loading,
    error,
    summary,
    connectionStatus,
    users,
    turns,
    activities,
    initiatorTurns,
    inviteeTurns,
    hasTwoUsers,
    sessionData,
  } = useSessionActivity(sessionId);

  // Chronological turns for playback (oldest first)
  const chronologicalTurns = useMemo(
    () => [...turns].reverse(),
    [turns]
  );

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying || !playbackActive) return;
    const interval = setInterval(() => {
      setCurrentTurn((prev) => {
        if (prev >= chronologicalTurns.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, playbackSpeed * 1000);
    return () => clearInterval(interval);
  }, [isPlaying, playbackActive, playbackSpeed, chronologicalTurns.length]);

  const handleTogglePlayback = useCallback(() => {
    if (!playbackActive) {
      setPlaybackActive(true);
      setCurrentTurn(0);
      setIsPlaying(true);
    } else {
      setPlaybackActive(false);
      setIsPlaying(false);
      setCurrentTurn(0);
    }
  }, [playbackActive]);

  // Expand/collapse functions
  const toggleTurnExpanded = useCallback((index: number) => {
    setExpandedTurnIds(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const expandAllTurns = useCallback(() => {
    setExpandedTurnIds(new Set(turns.map((_, i) => i)));
  }, [turns]);

  const collapseAllTurns = useCallback(() => {
    setExpandedTurnIds(new Set());
  }, []);

  // Recalculate virtualized heights when expand state changes
  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [expandedTurnIds]);

  // Scroll to focused turn when navigating with j/k
  useEffect(() => {
    if (focusedTurnIndex >= 0) {
      listRef.current?.scrollToItem(focusedTurnIndex);
    }
  }, [focusedTurnIndex]);

  // Active turn list for keyboard nav
  const activeTurnList = useMemo(() => {
    if (hasTwoUsers) {
      return focusedColumn === 'left' ? initiatorTurns : inviteeTurns;
    }
    return turns;
  }, [hasTwoUsers, focusedColumn, initiatorTurns, inviteeTurns, turns]);

  // Keyboard shortcuts
  const shortcuts = useMemo(() => {
    const map = new Map<string, () => void>();

    if (playbackActive) {
      // Playback shortcuts
      map.set(' ', () => setIsPlaying((p) => !p));
      map.set('ArrowLeft', () =>
        setCurrentTurn((p) => Math.max(0, p - 1))
      );
      map.set('ArrowRight', () =>
        setCurrentTurn((p) =>
          Math.min(chronologicalTurns.length - 1, p + 1)
        )
      );
    } else if (activeTab === 'timeline') {
      // Turn navigation
      map.set('j', () =>
        setFocusedTurnIndex((p) =>
          Math.min(activeTurnList.length - 1, p + 1)
        )
      );
      map.set('k', () =>
        setFocusedTurnIndex((p) => Math.max(0, p - 1))
      );

      // Column switching (split view)
      if (hasTwoUsers) {
        map.set('h', () => setFocusedColumn('left'));
        map.set('l', () => setFocusedColumn('right'));
      }

      // Expand/collapse via React state (works with virtualization)
      map.set('Enter', () => {
        if (focusedTurnIndex >= 0) {
          toggleTurnExpanded(focusedTurnIndex);
        }
      });

      map.set('e', () => {
        expandAllTurns();
      });

      map.set('c', () => {
        collapseAllTurns();
      });

      map.set('p', () => {
        setActiveTab('prompts');
      });
    }

    return map;
  }, [
    playbackActive,
    activeTab,
    activeTurnList.length,
    hasTwoUsers,
    focusedTurnIndex,
    chronologicalTurns.length,
    toggleTurnExpanded,
    expandAllTurns,
    collapseAllTurns,
  ]);

  useKeyboardShortcuts(shortcuts);

  if (loading) return <div className="loading">Loading Brain Activity...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const handleTabClick = (tab: TabId) => {
    if (tab === 'context') {
      navigate(`/sessions/${sessionId}/context`);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="session-detail">
      <SessionDetailHeader
        sessionId={sessionId || ''}
        connectionStatus={connectionStatus}
        summary={summary}
        session={sessionData}
      />

      {/* Sub-tab navigation */}
      <div className="session-tabs">
        {(['timeline', 'context', 'cost', 'prompts'] as TabId[]).map((tab) => (
          <button
            key={tab}
            className={`session-tab ${activeTab === tab && tab !== 'context' ? 'active' : ''}`}
            onClick={() => handleTabClick(tab)}
          >
            {tab === 'timeline' && 'Timeline'}
            {tab === 'context' && 'Context \u2192'}
            {tab === 'cost' && 'Cost'}
            {tab === 'prompts' && 'Prompts'}
          </button>
        ))}

        {activeTab === 'timeline' && chronologicalTurns.length > 0 && (
          <button
            className={`session-tab playback-toggle${playbackActive ? ' active' : ''}`}
            onClick={handleTogglePlayback}
          >
            {playbackActive ? '\u23F9 Stop' : '\u25B6 Play'}
          </button>
        )}
      </div>

      {/* Playback Controls */}
      {playbackActive && activeTab === 'timeline' && (
        <PlaybackControls
          turns={chronologicalTurns}
          currentTurn={currentTurn}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onFirst={() => setCurrentTurn(0)}
          onPrev={() => setCurrentTurn((p) => Math.max(0, p - 1))}
          onNext={() =>
            setCurrentTurn((p) =>
              Math.min(chronologicalTurns.length - 1, p + 1)
            )
          }
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSpeedChange={setPlaybackSpeed}
          onSeek={setCurrentTurn}
        />
      )}

      {/* Tab Content */}
      {activeTab === 'timeline' && (
        <>
          {playbackActive ? (
            <PlaybackOverlay
              turns={chronologicalTurns}
              currentTurn={currentTurn}
              userName={users.initiator?.name || 'User'}
            />
          ) : hasTwoUsers && users.initiator && users.invitee ? (
            <SplitView
              initiator={users.initiator}
              invitee={users.invitee}
              initiatorTurns={initiatorTurns}
              inviteeTurns={inviteeTurns}
            />
          ) : (
            <VirtualizedTurnsFeed
              turns={turns}
              userName={users.initiator?.name || 'User'}
              focusedTurnIndex={focusedTurnIndex}
              expandedTurnIds={expandedTurnIds}
              listRef={listRef}
            />
          )}
        </>
      )}

      {activeTab === 'cost' && (
        <SessionCostTab activities={activities} summary={summary} />
      )}

      {activeTab === 'prompts' && (
        <SessionPromptsTab activities={activities} sessionId={sessionId || ''} />
      )}
    </div>
  );
}

function VirtualizedTurnsFeed({ turns, userName, focusedTurnIndex, expandedTurnIds, listRef }: {
  turns: Turn[];
  userName: string;
  focusedTurnIndex: number;
  expandedTurnIds: Set<number>;
  listRef: React.RefObject<VList | null>;
}) {
  const rowHeightCache = useRef<Map<number, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight || 600);
    }
  }, []);

  const getItemSize = useCallback((index: number): number => {
    if (rowHeightCache.current.has(index)) {
      return rowHeightCache.current.get(index)!;
    }
    const turn = turns[index];
    return 80 + (turn?.activities?.length || 1) * 50;
  }, [turns]);

  const setRowHeight = useCallback((index: number, height: number) => {
    if (rowHeightCache.current.get(index) !== height) {
      rowHeightCache.current.set(index, height);
      listRef.current?.resetAfterIndex(index, false);
    }
  }, [listRef]);

  useEffect(() => {
    rowHeightCache.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [turns.length, listRef]);

  if (turns.length === 0) {
    return <div className="turns-feed" />;
  }

  return (
    <div className="turns-feed" ref={containerRef} style={{ height: 'calc(100vh - 220px)' }}>
      <VList
        ref={listRef}
        height={containerHeight}
        width="100%"
        itemCount={turns.length}
        itemSize={getItemSize}
        overscanCount={3}
      >
        {({ index, style }: ListChildComponentProps) => (
          <div style={style as React.CSSProperties}>
            <MeasuredTurnRow
              index={index}
              turn={turns[index]}
              userName={userName}
              isFocused={index === focusedTurnIndex}
              isExpanded={expandedTurnIds.has(index)}
              onMeasure={setRowHeight}
            />
          </div>
        )}
      </VList>
    </div>
  );
}

function MeasuredTurnRow({ index, turn, userName, isFocused, isExpanded, onMeasure }: {
  index: number;
  turn: Turn;
  userName: string;
  isFocused: boolean;
  isExpanded: boolean;
  onMeasure: (index: number, height: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      const height = rowRef.current.getBoundingClientRect().height;
      onMeasure(index, height);
    }
  }, [index, onMeasure, isExpanded]);

  return (
    <div ref={rowRef} className={isFocused ? 'turn-focused' : ''}>
      <TurnView turn={turn} userName={userName} isExpanded={isExpanded} />
    </div>
  );
}

export default SessionDetail;
