import { SessionStatus } from '@meet-without-fear/shared';
import { shouldShowSessionEntryMoodCheck, SessionEntryMoodCheckInputs } from '../sessionEntryMoodCheck';

function createInputs(overrides: Partial<SessionEntryMoodCheckInputs> = {}): SessionEntryMoodCheckInputs {
  return {
    activeOverlay: null,
    hasCompletedMoodCheck: false,
    isE2EMode: false,
    isInOnboardingUnsigned: false,
    isLoading: false,
    loadingCompact: false,
    moodCheckLoading: false,
    sessionStatus: SessionStatus.ACTIVE,
    ...overrides,
  };
}

describe('shouldShowSessionEntryMoodCheck', () => {
  it('shows the mood check for a normal active session entry', () => {
    expect(shouldShowSessionEntryMoodCheck(createInputs())).toBe(true);
  });

  it('suppresses the mood check in E2E mode', () => {
    expect(shouldShowSessionEntryMoodCheck(createInputs({ isE2EMode: true }))).toBe(false);
  });

  it('suppresses the mood check for resolved and abandoned sessions', () => {
    expect(shouldShowSessionEntryMoodCheck(createInputs({ sessionStatus: SessionStatus.RESOLVED }))).toBe(false);
    expect(shouldShowSessionEntryMoodCheck(createInputs({ sessionStatus: SessionStatus.ABANDONED }))).toBe(false);
  });
});
