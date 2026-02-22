import { useMemo } from 'react';
import { Turn } from '../../utils/turnGrouping';
import { TurnView } from '../session/TurnView';

interface PlaybackOverlayProps {
  turns: Turn[];
  currentTurn: number;
  userName: string;
}

export function PlaybackOverlay({ turns, currentTurn, userName }: PlaybackOverlayProps) {
  // Show only turns up to (and including) current playback position
  const visibleTurns = useMemo(
    () => turns.slice(0, currentTurn + 1),
    [turns, currentTurn]
  );

  return (
    <div className="playback-overlay">
      <div className="turns-feed">
        {visibleTurns.map((turn, i) => (
          <div
            key={turn.id}
            className={`playback-turn-wrapper${i === currentTurn ? ' playback-current-turn' : ''}`}
          >
            <TurnView turn={turn} userName={userName} />
          </div>
        ))}
      </div>
    </div>
  );
}
