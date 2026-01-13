import React, { useRef, useEffect } from 'react';
import { Turn, UserInfo } from '../../utils/turnGrouping';
import { TurnView } from './TurnView';

interface SplitViewProps {
  initiator: UserInfo;
  invitee: UserInfo;
  initiatorTurns: Turn[];
  inviteeTurns: Turn[];
}

export function SplitView({ initiator, invitee, initiatorTurns, inviteeTurns }: SplitViewProps) {
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const prevTurnCountRef = useRef({ initiator: 0, invitee: 0 });
  const isInitialLoadRef = useRef(true);

  // Auto-scroll when new turns arrive
  useEffect(() => {
    if (isInitialLoadRef.current) {
      prevTurnCountRef.current = { initiator: initiatorTurns.length, invitee: inviteeTurns.length };
      isInitialLoadRef.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (initiatorTurns.length > prevTurnCountRef.current.initiator) {
        leftColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (inviteeTurns.length > prevTurnCountRef.current.invitee) {
        rightColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      prevTurnCountRef.current = { initiator: initiatorTurns.length, invitee: inviteeTurns.length };
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [initiatorTurns.length, inviteeTurns.length]);

  return (
    <div className="split-view-container">
      {/* Left Column - Initiator */}
      <div className="user-column initiator-column">
        <div className="column-header">
          <span className="user-avatar">👤</span>
          <span className="user-name">{initiator.name}</span>
          <span className="user-role">Initiator</span>
        </div>
        <div className="column-turns" ref={leftColumnRef}>
          {initiatorTurns.map(turn => (
            <TurnView key={turn.id} turn={turn} userName={initiator.name} />
          ))}
          {initiatorTurns.length === 0 && <div className="empty-column">No activity</div>}
        </div>
      </div>

      {/* Right Column - Invitee */}
      <div className="user-column invitee-column">
        <div className="column-header">
          <span className="user-avatar">👤</span>
          <span className="user-name">{invitee.name}</span>
          <span className="user-role">Invitee</span>
        </div>
        <div className="column-turns" ref={rightColumnRef}>
          {inviteeTurns.map(turn => (
            <TurnView key={turn.id} turn={turn} userName={invitee.name} />
          ))}
          {inviteeTurns.length === 0 && <div className="empty-column">No activity</div>}
        </div>
      </div>
    </div>
  );
}
