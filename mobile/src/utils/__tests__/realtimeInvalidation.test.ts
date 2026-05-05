import { messageKeys, notificationKeys, sessionKeys, stageKeys } from '../../hooks/queryKeys';
import {
  getStage2RealtimeInvalidationQueryKeys,
  getStage3RealtimeInvalidationQueryKeys,
  getStage4RealtimeInvalidationQueryKeys,
} from '../realtimeInvalidation';

describe('realtime invalidation key sets', () => {
  const sessionId = 'session-1';

  it('covers Stage 2 dependent state and message caches', () => {
    expect(getStage2RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.empathyStatus(sessionId),
      stageKeys.partnerEmpathy(sessionId),
      stageKeys.empathyDraft(sessionId),
      stageKeys.progress(sessionId),
      sessionKeys.state(sessionId),
      messageKeys.infinite(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });

  it('covers Stage 3 needs reveal, progress, session, and message caches', () => {
    expect(getStage3RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.needs(sessionId),
      stageKeys.needsComparison(sessionId),
      stageKeys.progress(sessionId),
      sessionKeys.state(sessionId),
      messageKeys.infinite(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });

  it('covers Stage 4 strategy, agreement, progress, session, and message caches', () => {
    expect(getStage4RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.strategies(sessionId),
      stageKeys.strategiesReveal(sessionId),
      stageKeys.agreements(sessionId),
      stageKeys.progress(sessionId),
      sessionKeys.state(sessionId),
      messageKeys.infinite(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });
});
