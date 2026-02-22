import { useMemo } from 'react';
import { Turn } from '../../utils/turnGrouping';
import { TurnView } from '../session/TurnView';

interface PlaybackOverlayProps {
  turns: Turn[];
  currentTurn: number;
  userName: string;
  /** When set, renders two-column split view */
  partnerSession?: {
    initiatorId: string;
    initiatorName: string;
    inviteeId: string;
    inviteeName: string;
  };
}

export function PlaybackOverlay({ turns, currentTurn, userName, partnerSession }: PlaybackOverlayProps) {
  // Show only turns up to (and including) current playback position
  const visibleTurns = useMemo(
    () => turns.slice(0, currentTurn + 1),
    [turns, currentTurn]
  );

  if (partnerSession) {
    return <SplitPlayback visibleTurns={visibleTurns} currentTurn={currentTurn} partnerSession={partnerSession} />;
  }

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

function SplitPlayback({ visibleTurns, currentTurn, partnerSession }: {
  visibleTurns: Turn[];
  currentTurn: number;
  partnerSession: NonNullable<PlaybackOverlayProps['partnerSession']>;
}) {
  const { initiatorTurns, inviteeTurns } = useMemo(() => {
    const init: Turn[] = [];
    const inv: Turn[] = [];
    visibleTurns.forEach(turn => {
      if (turn.userId === partnerSession.inviteeId) {
        inv.push(turn);
      } else {
        init.push(turn);
      }
    });
    return { initiatorTurns: init, inviteeTurns: inv };
  }, [visibleTurns, partnerSession.initiatorId, partnerSession.inviteeId]);

  const currentTurnObj = visibleTurns[currentTurn];

  return (
    <div className="playback-overlay">
      <div className="playback-split-view">
        <div className="playback-split-column">
          <div className="column-header">
            <span className="user-avatar">{'\u{1F464}'}</span>
            <span className="user-name">{partnerSession.initiatorName}</span>
          </div>
          <div className="turns-feed">
            {initiatorTurns.map(turn => (
              <div
                key={turn.id}
                className={`playback-turn-wrapper${currentTurnObj && turn.id === currentTurnObj.id ? ' playback-current-turn' : ''}`}
              >
                <TurnView turn={turn} userName={partnerSession.initiatorName} />
              </div>
            ))}
            {initiatorTurns.length === 0 && <div className="empty-column">No activity yet</div>}
          </div>
        </div>
        <div className="playback-split-column">
          <div className="column-header">
            <span className="user-avatar">{'\u{1F464}'}</span>
            <span className="user-name">{partnerSession.inviteeName}</span>
          </div>
          <div className="turns-feed">
            {inviteeTurns.map(turn => (
              <div
                key={turn.id}
                className={`playback-turn-wrapper${currentTurnObj && turn.id === currentTurnObj.id ? ' playback-current-turn' : ''}`}
              >
                <TurnView turn={turn} userName={partnerSession.inviteeName} />
              </div>
            ))}
            {inviteeTurns.length === 0 && <div className="empty-column">No activity yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
