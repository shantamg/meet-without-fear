import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingBlockerCategory,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
  TendingFollowThroughStatus,
  TendingNeedResolutionStatus,
  TendingNextAction,
  TendingReminderScope,
} from '@meet-without-fear/shared';
import { TendingCheckinScreen } from '../TendingCheckinScreen';

const entry: TendingEntryDTO = {
  id: 'tending-1',
  sessionId: 'session-1',
  agreementId: 'agreement-1',
  type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
  scope: TendingEntryScope.SHARED,
  ownerUserId: null,
  optedInShared: false,
  status: TendingEntryStatus.OPEN,
  scheduledFor: '2026-05-13T00:00:00.000Z',
  openedAt: '2026-05-13T00:00:00.000Z',
  completedAt: null,
  summary: 'Check whether the shared next step helped.',
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  myResponse: null,
  responseCount: 0,
};

describe('TendingCheckinScreen', () => {
  it('asks whether to carry private between-period notes into check-in', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TendingCheckinScreen
        entries={[entry]}
        betweenPeriodNotes={[{
          id: 'note-1',
          sessionId: 'session-1',
          userId: 'user-1',
          content: 'I felt anxious after the agreement was set.',
          carryForwardSelected: false,
          consentToShareWithPartner: false,
          shareConsentAt: null,
          selectedForCheckinId: null,
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
        }]}
        onSubmit={onSubmit}
      />
    );

    expect(getByTestId('tending-checkin-step-privateNotes')).toBeTruthy();
    fireEvent.press(getByTestId('tending-include-note-note-1-include'));
    fireEvent.press(getByTestId('tending-share-note-note-1-share'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.includedBetweenPeriodNoteIds).toEqual(['note-1']);
    expect(payload.shareBetweenPeriodNoteIds).toEqual(['note-1']);
  });

  it('submits structured entry and need outcomes', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TendingCheckinScreen
        entries={[entry]}
        needs={[{ id: 'need-1', label: 'healthy, clean space' }]}
        onSubmit={onSubmit}
      />
    );

    expect(getByTestId('tending-checkin-step-followThrough')).toBeTruthy();
    fireEvent.press(getByTestId('tending-follow-through-tending-1-DID_NOT_HAPPEN'));
    fireEvent.changeText(getByTestId('tending-what-happened-tending-1'), 'It happened three times.');

    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-helpfulness-tending-1-DID_NOT_HELP'));
    fireEvent.press(getByTestId(`tending-blocker-tending-1-${TendingBlockerCategory.PARTNER_DID_NOT_DO_PART}`));
    fireEvent.changeText(getByTestId('tending-helped-need-tending-1'), 'The need stayed open.');

    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-need-resolution-need-1-STILL_OPEN'));
    fireEvent.changeText(getByTestId('tending-need-note-need-1'), 'Still not resolved.');

    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId(`tending-checkin-choice-${TendingNextAction.REOPEN_STRATEGY_WORK}`));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.orientations.whatComesNext.continueChoice).toBe(ContinueChoice.ANOTHER_ROUND);
    expect(payload.nextAction).toBe(TendingNextAction.REOPEN_STRATEGY_WORK);
    expect(payload.entryOutcomes[0]).toEqual(expect.objectContaining({
      tendingEntryId: 'tending-1',
      followThroughStatus: TendingFollowThroughStatus.DID_NOT_HAPPEN,
      blockerCategories: [TendingBlockerCategory.PARTNER_DID_NOT_DO_PART],
      whatHappened: 'It happened three times.',
    }));
    expect(payload.needOutcomes[0]).toEqual(expect.objectContaining({
      needId: 'need-1',
      resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
      note: 'Still not resolved.',
    }));
  });

  it('shows reminder controls for extension and submits private/shared reminders', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TendingCheckinScreen entries={[entry]} onSubmit={onSubmit} />
    );

    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    expect(getByTestId('tending-reminder-controls')).toBeTruthy();
    fireEvent.press(getByTestId('tending-reminder-preset-ONE_MONTH'));
    fireEvent.press(getByTestId('tending-reminder-cadence-WEEKLY'));
    fireEvent.press(getByTestId('tending-private-reminder'));
    fireEvent.press(getByTestId('tending-shared-reminder'));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.reminders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: TendingReminderScope.PRIVATE }),
        expect.objectContaining({ scope: TendingReminderScope.SHARED }),
      ])
    );
    expect(payload.reminders[0].cadence).toBe('WEEKLY');
    expect(payload.reminders[0].remindAt).toMatch(/T/);
  });

  it('submits adjustment details when choosing adjust commitment', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TendingCheckinScreen entries={[entry]} onSubmit={onSubmit} />
    );

    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId(`tending-blocker-tending-1-${TendingBlockerCategory.TOO_FREQUENT}`));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId(`tending-checkin-choice-${TendingNextAction.ADJUST_COMMITMENT}`));

    expect(getByTestId('tending-adjustment-controls')).toBeTruthy();
    fireEvent.changeText(getByTestId('tending-adjustment-text'), 'Try one planning check-in a month.');
    fireEvent.changeText(getByTestId('tending-adjustment-cadence'), 'Monthly');
    fireEvent.changeText(getByTestId('tending-adjustment-success'), 'It happens without anyone bracing.');
    fireEvent.changeText(getByTestId('tending-adjustment-reason'), 'Weekly was too frequent.');
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.nextAction).toBe(TendingNextAction.ADJUST_COMMITMENT);
    expect(payload.adjustments[0]).toEqual(expect.objectContaining({
      tendingEntryId: 'tending-1',
      privacyScope: TendingReminderScope.SHARED,
      revisedCommitmentText: 'Try one planning check-in a month.',
      revisedCadence: 'Monthly',
      revisedSuccessCriteria: 'It happens without anyone bracing.',
      reason: 'Weekly was too frequent.',
      blockerAddressed: [TendingBlockerCategory.TOO_FREQUENT],
    }));
  });

  it('expands partial closure into per-entry RESOLVED/CONTINUING toggles', () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <TendingCheckinScreen entries={[entry]} onSubmit={onSubmit} />
    );
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));

    expect(queryByTestId('tending-checkin-partial-closure')).toBeNull();
    fireEvent.press(getByTestId(`tending-checkin-choice-${TendingNextAction.PARTIAL_CLOSURE}`));
    expect(getByTestId('tending-checkin-partial-closure')).toBeTruthy();
    fireEvent.press(getByTestId('tending-checkin-resolution-tending-1-RESOLVED'));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.orientations.whatComesNext.continueChoice).toBe(ContinueChoice.PARTIAL_CLOSURE);
    expect(payload.orientations.whatComesNext.partialClosure['tending-1']).toBe(PartialClosureResolution.RESOLVED);
  });
});
