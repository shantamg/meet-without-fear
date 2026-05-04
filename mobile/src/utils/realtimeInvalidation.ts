import { messageKeys, notificationKeys, sessionKeys, stageKeys } from '../hooks/queryKeys';

export function getStage2RealtimeInvalidationQueryKeys(sessionId: string) {
  return [
    stageKeys.empathyStatus(sessionId),
    stageKeys.partnerEmpathy(sessionId),
    stageKeys.empathyDraft(sessionId),
    stageKeys.progress(sessionId),
    sessionKeys.state(sessionId),
    messageKeys.infinite(sessionId),
    stageKeys.pendingActions(sessionId),
    notificationKeys.badgeCount(),
  ];
}

export function getStage3RealtimeInvalidationQueryKeys(sessionId: string) {
  return [
    stageKeys.needs(sessionId),
    stageKeys.needsComparison(sessionId),
    stageKeys.progress(sessionId),
    sessionKeys.state(sessionId),
    messageKeys.infinite(sessionId),
    stageKeys.pendingActions(sessionId),
    notificationKeys.badgeCount(),
  ];
}
