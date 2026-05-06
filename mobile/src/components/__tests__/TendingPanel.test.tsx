import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  AgreementStatus,
  AgreementType,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4OutcomeDTO,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  TendingEntryDTO,
  TendingEntryStatus,
  TendingEntryType,
} from '@meet-without-fear/shared';
import { TendingPanel } from '../TendingPanel';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const mockIcon = (props: Record<string, unknown>) =>
    React.createElement('Icon', props);
  return new Proxy(
    {},
    {
      get: () => mockIcon,
    }
  );
});

const openEntry: TendingEntryDTO = {
  id: 'tending-1',
  sessionId: 'session-1',
  agreementId: 'agreement-1',
  type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
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

const agreement = {
  id: 'agreement-1',
  strategyId: 'proposal-1',
  description: 'Take turns naming impact before problem solving.',
  type: AgreementType.MICRO_EXPERIMENT,
  duration: 'Two weeks',
  measureOfSuccess: 'Both people can finish hard talks calmer.',
  status: AgreementStatus.AGREED,
  agreedByMe: true,
  agreedByPartner: true,
  agreedAt: '2026-05-06T00:00:00.000Z',
  followUpDate: '2026-05-13T00:00:00.000Z',
};

const noSharedOutcome: Stage4OutcomeDTO = {
  kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
  reason: Stage4ClosureReason.NO_OVERLAP,
  summary: 'No shared experiment was right to try yet.',
  agreements: [],
  individualCommitments: [
    {
      id: 'commitment-1',
      kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      description: 'I will pause before responding.',
      ownerLabel: 'You',
      needsAddressed: [],
      duration: null,
      measureOfSuccess: null,
      status: Stage4ProposalStatus.ACTIVE,
    },
  ],
  openNeeds: [
    {
      id: 'need-1',
      label: 'Trust after conflict',
      source: 'BOTH',
      note: 'Still open.',
    },
  ],
  closedAt: '2026-05-06T00:00:00.000Z',
};

describe('TendingPanel', () => {
  const defaultProps = {
    entries: [openEntry],
    agreements: [agreement],
    outcome: null,
    onCreateReentry: jest.fn(),
    onSubmitResponse: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an open scheduled check-in with agreement context', () => {
    render(<TendingPanel {...defaultProps} />);

    expect(screen.getByText('The Tending')).toBeTruthy();
    expect(screen.getByText('Agreement check-in')).toBeTruthy();
    expect(screen.getByText('Take turns naming impact before problem solving.')).toBeTruthy();
    expect(screen.getByText('Success: Both people can finish hard talks calmer.')).toBeTruthy();
  });

  it('submits a check-in review with status and continuation choice', () => {
    render(<TendingPanel {...defaultProps} />);

    fireEvent.press(screen.getByText('Worked'));
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByLabelText('Tending reflection'), 'This helped this week.');
    fireEvent.press(screen.getByTestId('submit-tending-response'));

    expect(defaultProps.onSubmitResponse).toHaveBeenCalledWith('tending-1', {
      status: 'WORKED',
      reflection: 'This helped this week.',
      continueChoice: 'CONTINUE',
    });
  });

  it('opens passive re-entry for no-shared-agreement outcomes', () => {
    render(
      <TendingPanel
        {...defaultProps}
        entries={[]}
        agreements={[]}
        outcome={noSharedOutcome}
      />
    );

    expect(screen.getByText('No scheduled shared check-in')).toBeTruthy();
    expect(screen.getByText('I will pause before responding.')).toBeTruthy();
    expect(screen.getByText('Trust after conflict')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Passive re-entry intent'), 'I want to revisit the open need.');
    fireEvent.press(screen.getByTestId('create-tending-reentry'));

    expect(defaultProps.onCreateReentry).toHaveBeenCalledWith('I want to revisit the open need.');
  });
});
