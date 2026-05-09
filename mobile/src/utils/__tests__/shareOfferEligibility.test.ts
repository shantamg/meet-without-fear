import { Stage } from '@meet-without-fear/shared';
import { hasSubmittedOwnEmpathy, shouldFetchShareOffer } from '../shareOfferEligibility';

describe('shareOfferEligibility', () => {
  it('does not fetch a share offer before the user submits their own empathy attempt', () => {
    expect(shouldFetchShareOffer({
      sessionId: 'session-1',
      accessDenied: false,
      currentStage: Stage.PERSPECTIVE_STRETCH,
      ownEmpathyAlreadyConsented: false,
      ownEmpathyAttempt: null,
    })).toBe(false);
  });

  it('fetches a share offer in Stage 2 after the user has consented to share empathy', () => {
    expect(shouldFetchShareOffer({
      sessionId: 'session-1',
      accessDenied: false,
      currentStage: Stage.PERSPECTIVE_STRETCH,
      ownEmpathyAlreadyConsented: true,
      ownEmpathyAttempt: null,
    })).toBe(true);
  });

  it('treats a persisted empathy attempt as submitted even when draft data is unavailable', () => {
    expect(hasSubmittedOwnEmpathy({
      ownEmpathyAttempt: {
        status: 'ANALYZING',
        content: 'I think they felt trapped and unheard.',
      },
    })).toBe(true);
  });

  it('keeps the share offer query disabled outside eligible session state', () => {
    expect(shouldFetchShareOffer({
      sessionId: undefined,
      currentStage: Stage.PERSPECTIVE_STRETCH,
      ownEmpathyAlreadyConsented: true,
    })).toBe(false);

    expect(shouldFetchShareOffer({
      sessionId: 'session-1',
      accessDenied: true,
      currentStage: Stage.PERSPECTIVE_STRETCH,
      ownEmpathyAlreadyConsented: true,
    })).toBe(false);

    expect(shouldFetchShareOffer({
      sessionId: 'session-1',
      accessDenied: false,
      currentStage: Stage.WITNESS,
      ownEmpathyAlreadyConsented: true,
    })).toBe(false);
  });
});

