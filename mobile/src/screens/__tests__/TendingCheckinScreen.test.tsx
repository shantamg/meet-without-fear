import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
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
  it('walks through three sequential steps and submits the payload', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TendingCheckinScreen entries={[entry]} onSubmit={onSubmit} />
    );

    // Step 1 dot visible.
    expect(getByTestId('tending-checkin-step-whatWorked')).toBeTruthy();
    expect(getByTestId('tending-checkin-entry-tending-1')).toBeTruthy();
    fireEvent.changeText(getByTestId('tending-checkin-reflection'), 'small wins');

    // Step 2.
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.changeText(getByTestId('tending-checkin-reflection'), 'still stuck');

    // Step 3 — all five choices render.
    fireEvent.press(getByTestId('tending-checkin-next'));
    [
      ContinueChoice.ANOTHER_ROUND,
      ContinueChoice.EXTEND,
      ContinueChoice.NEW_PROCESS,
      ContinueChoice.PARTIAL_CLOSURE,
      ContinueChoice.FULL_CLOSURE,
    ].forEach((c) => {
      expect(getByTestId(`tending-checkin-choice-${c}`)).toBeTruthy();
    });

    fireEvent.press(getByTestId('tending-checkin-choice-FULL_CLOSURE'));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.whatComesNext.continueChoice).toBe(ContinueChoice.FULL_CLOSURE);
    expect(payload.whatWorked.reflection).toBe('small wins');
    expect(payload.whereMoreSupport.reflection).toBe('still stuck');
  });

  it('expands partial-closure into per-entry RESOLVED/CONTINUING toggles', () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <TendingCheckinScreen entries={[entry]} onSubmit={onSubmit} />
    );
    fireEvent.press(getByTestId('tending-checkin-next'));
    fireEvent.press(getByTestId('tending-checkin-next'));

    expect(queryByTestId('tending-checkin-partial-closure')).toBeNull();
    fireEvent.press(getByTestId('tending-checkin-choice-PARTIAL_CLOSURE'));
    expect(getByTestId('tending-checkin-partial-closure')).toBeTruthy();
    fireEvent.press(getByTestId('tending-checkin-resolution-tending-1-RESOLVED'));
    fireEvent.press(getByTestId('tending-checkin-submit'));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.whatComesNext.continueChoice).toBe(ContinueChoice.PARTIAL_CLOSURE);
    expect(payload.whatComesNext.partialClosure['tending-1']).toBe(PartialClosureResolution.RESOLVED);
  });
});
