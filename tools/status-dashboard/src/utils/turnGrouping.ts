import { BrainActivity } from '../types/activity';

export interface Turn {
  id: string;
  activities: BrainActivity[];
  timestamp: string;
  userId?: string;
  userMessageContent?: string;
}

export interface UserInfo {
  id: string;
  name: string;
  isInitiator: boolean;
}

/**
 * Groups activities into turns based on turnId.
 * Activities without a turnId are grouped by timestamp (minute).
 */
export function groupActivitiesIntoTurns(
  activities: BrainActivity[],
  users: { initiator: UserInfo | null; invitee: UserInfo | null }
): Turn[] {
  const groups: Turn[] = [];
  const turnMap = new Map<string, Turn>();

  activities.forEach(activity => {
    let turnId = activity.turnId;
    // If no turnId, try to find one in metadata
    if (!turnId && activity.metadata?.turnId) {
      turnId = activity.metadata.turnId;
    }
    if (!turnId) {
      // Fallback for system events or orphans
      turnId = `orphan-${Math.floor(new Date(activity.createdAt).getTime() / 60000)}`; // Group by minute
    }

    if (!turnMap.has(turnId)) {
      const newTurn: Turn = {
        id: turnId,
        activities: [],
        timestamp: activity.createdAt
      };
      turnMap.set(turnId, newTurn);
      groups.push(newTurn);
    }

    const turn = turnMap.get(turnId)!;
    turn.activities.push(activity);

    // Try to determine userId for the turn
    if (!turn.userId) {
      if (activity.metadata?.userId) {
        turn.userId = activity.metadata.userId;
      } else if (activity.turnId && activity.turnId.includes('-')) {
        // Check if any part matches user IDs
        if (users.initiator && activity.turnId.includes(users.initiator.id)) {
          turn.userId = users.initiator.id;
        } else if (users.invitee && activity.turnId.includes(users.invitee.id)) {
          turn.userId = users.invitee.id;
        }
      }
    }
  });

  // Sort turns by timestamp descending (newest first)
  return groups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Matches messages to turns based on timestamp proximity.
 */
export function matchMessagesToTurns(
  turns: Turn[],
  messages: any[]
): Turn[] {
  if (messages.length === 0) return turns;

  const updatedTurns = [...turns];
  const usedMessageIds = new Set<string>();

  // First pass: Try to assign messages to "Real" turns (with valid IDs)
  updatedTurns.forEach(turn => {
    if (turn.id.startsWith('orphan-')) return;

    const turnStart = new Date(turn.timestamp).getTime();

    const candidates = messages.filter(m => {
      if (usedMessageIds.has(m.id)) return false;
      const msgTime = new Date(m.timestamp).getTime();
      return Math.abs(msgTime - turnStart) < 30000;
    });

    if (candidates.length > 0) {
      const closest = candidates.reduce((prev, curr) => {
        const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - turnStart);
        const currDiff = Math.abs(new Date(curr.timestamp).getTime() - turnStart);
        return (currDiff < prevDiff) ? curr : prev;
      });
      turn.userMessageContent = closest.content;
      usedMessageIds.add(closest.id);
    }
  });

  // Second pass: Assign remaining messages to Orphan turns
  updatedTurns.forEach(turn => {
    if (!turn.id.startsWith('orphan-')) return;

    const turnStart = new Date(turn.timestamp).getTime();

    const candidates = messages.filter(m => {
      if (usedMessageIds.has(m.id)) return false;
      const msgTime = new Date(m.timestamp).getTime();
      return Math.abs(msgTime - turnStart) < 30000;
    });

    if (candidates.length > 0) {
      const closest = candidates.reduce((prev, curr) => {
        const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - turnStart);
        const currDiff = Math.abs(new Date(curr.timestamp).getTime() - turnStart);
        return (currDiff < prevDiff) ? curr : prev;
      });
      turn.userMessageContent = closest.content;
      usedMessageIds.add(closest.id);
    }
  });

  return updatedTurns;
}

/**
 * Splits turns into initiator and invitee turns.
 */
export function splitTurnsByUser(
  turns: Turn[],
  users: { initiator: UserInfo | null; invitee: UserInfo | null }
): { initiatorTurns: Turn[]; inviteeTurns: Turn[] } {
  const initiatorTurns: Turn[] = [];
  const inviteeTurns: Turn[] = [];

  turns.forEach(turn => {
    if (users.initiator && turn.userId === users.initiator.id) {
      initiatorTurns.push(turn);
    } else if (users.invitee && turn.userId === users.invitee.id) {
      inviteeTurns.push(turn);
    } else {
      // Unassigned - put in initiator as default column
      initiatorTurns.push(turn);
    }
  });

  return { initiatorTurns, inviteeTurns };
}
