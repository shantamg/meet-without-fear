import { SessionStatus } from '@meet-without-fear/shared';

export interface SessionEntryMoodCheckInputs {
  activeOverlay?: unknown;
  hasCompletedMoodCheck: boolean;
  isE2EMode: boolean;
  isInOnboardingUnsigned: boolean;
  isLoading: boolean;
  loadingCompact: boolean;
  moodCheckLoading: boolean;
  sessionStatus?: SessionStatus;
}

export function shouldShowSessionEntryMoodCheck({
  activeOverlay,
  hasCompletedMoodCheck,
  isE2EMode,
  isInOnboardingUnsigned,
  isLoading,
  loadingCompact,
  moodCheckLoading,
  sessionStatus,
}: SessionEntryMoodCheckInputs): boolean {
  if (isE2EMode) return false;
  if (isLoading) return false;
  if (moodCheckLoading) return false;
  if (loadingCompact) return false;
  if (isInOnboardingUnsigned) return false;
  if (hasCompletedMoodCheck) return false;
  if (activeOverlay) return false;
  if (sessionStatus === SessionStatus.RESOLVED || sessionStatus === SessionStatus.ABANDONED) return false;

  return true;
}
