import { Stage, EmpathyStatus } from '@meet-without-fear/shared';

type EmpathyAttemptLike = {
  status?: EmpathyStatus | string | null;
  content?: string | null;
} | null | undefined;

export interface ShareOfferFetchEligibilityInput {
  sessionId?: string;
  accessDenied?: boolean;
  currentStage?: Stage | number;
  ownEmpathyAlreadyConsented?: boolean;
  ownEmpathyAttempt?: EmpathyAttemptLike;
}

export function hasSubmittedOwnEmpathy(input: ShareOfferFetchEligibilityInput): boolean {
  return (
    input.ownEmpathyAlreadyConsented === true ||
    !!input.ownEmpathyAttempt?.content ||
    !!input.ownEmpathyAttempt?.status
  );
}

export function shouldFetchShareOffer(input: ShareOfferFetchEligibilityInput): boolean {
  return (
    !!input.sessionId &&
    input.accessDenied !== true &&
    input.currentStage === Stage.PERSPECTIVE_STRETCH
  );
}
