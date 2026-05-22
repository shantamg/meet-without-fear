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
  TendingCoordinationCycleDTO,
  TendingCoordinationStatus,
  TendingEntryDTO,
  TendingEntryScope,
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

const waitingCoordinationCycle: TendingCoordinationCycleDTO = {
  id: 'coordination-1',
  sessionId: 'session-1',
  status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
  entryIds: ['tending-1'],
  participantUserIds: ['user-1', 'user-2'],
  submittedUserIds: ['user-1'],
  responseDeadlineAt: '2026-05-27T00:00:00.000Z',
  resolvedAt: null,
  resultSummary: 'Held privately.',
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
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
    onStartCheckin: jest.fn(),
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

  it('launches the rich check-in route instead of submitting the legacy review', () => {
    render(<TendingPanel {...defaultProps} />);

    fireEvent.press(screen.getByTestId('start-tending-checkin'));

    expect(defaultProps.onStartCheckin).toHaveBeenCalledWith('tending-1');
    expect(defaultProps.onSubmitResponse).not.toHaveBeenCalled();
  });

  it('shows held-private copy while waiting for partner coordination', () => {
    render(
      <TendingPanel
        {...defaultProps}
        entries={[{
          ...openEntry,
          status: TendingEntryStatus.PARTIAL,
          myResponse: {
            id: 'response-1',
            tendingEntryId: 'tending-1',
            userId: 'user-1',
            checkinId: 'checkin-1',
            status: 'CHECKIN',
            reflection: null,
            continueChoice: 'EXTEND',
            submittedAt: '2026-05-13T00:00:00.000Z',
          },
          responseCount: 1,
        }]}
        coordinationCycles={[waitingCoordinationCycle]}
      />
    );

    expect(screen.getByTestId('tending-coordination-status')).toBeTruthy();
    expect(screen.getByText('Held privately')).toBeTruthy();
    expect(screen.getByText(/We'll hold shared choices privately/)).toBeTruthy();
    expect(screen.getByText('Your review is saved.')).toBeTruthy();
  });

  it('shows resolved coordination summary when both sides have submitted', () => {
    render(
      <TendingPanel
        {...defaultProps}
        coordinationCycles={[{
          ...waitingCoordinationCycle,
          status: TendingCoordinationStatus.RESOLVED,
          submittedUserIds: ['user-1', 'user-2'],
          resolvedAt: '2026-05-14T00:00:00.000Z',
          resultSummary: 'Both participants chose extension. Shared Tending entries continue.',
        }]}
      />
    );

    expect(screen.getByText('Coordination')).toBeTruthy();
    expect(screen.getByText('Both participants chose extension. Shared Tending entries continue.')).toBeTruthy();
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

  describe('parseSummaryLines rendering', () => {
    it('renders a standard Label: value line', () => {
      render(
        <TendingPanel
          {...defaultProps}
          entries={[{ ...openEntry, summary: 'Open needs: Trust and communication' }]}
          agreements={[]}
        />
      );
      expect(screen.getByText('Open needs')).toBeTruthy();
      expect(screen.getByText('Trust and communication')).toBeTruthy();
    });

    it('renders Stage 4 closed as ... line with Closure label', () => {
      render(
        <TendingPanel
          {...defaultProps}
          entries={[{ ...openEntry, summary: 'Stage 4 closed as RESOLVED: Found common ground' }]}
          agreements={[]}
        />
      );
      expect(screen.getByText('Closure')).toBeTruthy();
      expect(screen.getByText('Found common ground')).toBeTruthy();
    });

    it('renders a semicolon-delimited line as bullet items', () => {
      render(
        <TendingPanel
          {...defaultProps}
          entries={[{ ...openEntry, summary: 'Shared agreements: A; B; C' }]}
          agreements={[]}
        />
      );
      expect(screen.getByText('Shared agreements')).toBeTruthy();
      expect(screen.getByText('\u2022 A')).toBeTruthy();
      expect(screen.getByText('\u2022 B')).toBeTruthy();
      expect(screen.getByText('\u2022 C')).toBeTruthy();
    });

    it('renders nothing for null summary', () => {
      render(
        <TendingPanel
          {...defaultProps}
          entries={[{ ...openEntry, summary: null }]}
          agreements={[]}
        />
      );
      expect(screen.queryByText('Open needs')).toBeNull();
      expect(screen.queryByText('Closure')).toBeNull();
    });

    it('filters out the Passive Tending re-entry context. header line', () => {
      render(
        <TendingPanel
          {...defaultProps}
          entries={[
            {
              ...openEntry,
              summary: 'Passive Tending re-entry context.\nOpen needs: Trust',
            },
          ]}
          agreements={[]}
        />
      );
      expect(screen.queryByText('Passive Tending re-entry context.')).toBeNull();
      expect(screen.getByText('Open needs')).toBeTruthy();
      expect(screen.getByText('Trust')).toBeTruthy();
    });
  });
});
