import { MessageRole } from '@meet-without-fear/shared';
import type { EmpathyAttemptDTO, MessageDTO } from '@meet-without-fear/shared';

const EMPATHY_ATTEMPT_MESSAGE_TIMESTAMP_TOLERANCE_MS = 10_000;

function parseTimestamp(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) ? time : null;
}

type EmpathyMessageLike = Pick<MessageDTO, 'id' | 'role' | 'senderId' | 'content' | 'timestamp'>;

export function isSameEmpathyAttemptMessage(
  message: EmpathyMessageLike,
  sourceUserId: string | null | undefined,
  attempt: Pick<EmpathyAttemptDTO, 'content' | 'sharedAt'>,
): boolean {
  if (
    message.role !== MessageRole.EMPATHY_STATEMENT ||
    message.senderId !== sourceUserId ||
    message.content !== attempt.content
  ) {
    return false;
  }

  if (message.timestamp === attempt.sharedAt) {
    return true;
  }

  const messageTime = parseTimestamp(message.timestamp);
  const sharedTime = parseTimestamp(attempt.sharedAt);
  if (messageTime === null || sharedTime === null) {
    return false;
  }

  return Math.abs(messageTime - sharedTime) <= EMPATHY_ATTEMPT_MESSAGE_TIMESTAMP_TOLERANCE_MS;
}

export function hasNewerDistinctEmpathyStatement(
  message: EmpathyMessageLike,
  empathyStatements: EmpathyMessageLike[],
): boolean {
  const messageTime = parseTimestamp(message.timestamp);
  if (messageTime === null) return false;

  return empathyStatements.some((candidate) => {
    if (candidate.id === message.id || candidate.content === message.content) {
      return false;
    }

    const candidateTime = parseTimestamp(candidate.timestamp);
    return candidateTime !== null && candidateTime > messageTime;
  });
}
