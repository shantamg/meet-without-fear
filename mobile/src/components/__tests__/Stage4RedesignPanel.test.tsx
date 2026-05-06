import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  AgreementStatus,
  AgreementType,
  GetStage4StateResponse,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4Phase,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { Stage4RedesignPanel } from '../Stage4RedesignPanel';

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

const baseState: GetStage4StateResponse = {
  phase: Stage4Phase.SELECTION,
  inventory: {
    sharedProposals: [
      {
        id: 'proposal-1',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        description: 'Take turns naming the impact before problem solving.',
        needsAddressed: [
          { id: 'need-1', label: 'Feeling heard', coverage: 'COVERED' },
        ],
        duration: 'Two weeks',
        measureOfSuccess: 'Both people can finish a hard talk calmer.',
        status: Stage4ProposalStatus.ACTIVE,
        myDecision: Stage4SelectionDecision.WILLING,
      },
    ],
    individualCommitments: [
      {
        id: 'proposal-2',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        description: 'I will pause when my voice gets sharp.',
        ownerLabel: 'You',
        needsAddressed: [],
        duration: null,
        measureOfSuccess: null,
        status: Stage4ProposalStatus.ACTIVE,
        myDecision: Stage4SelectionDecision.NEEDS_DISCUSSION,
      },
    ],
    unaddressedNeeds: [
      {
        id: 'need-2',
        label: 'Trust after conflict',
        source: 'BOTH',
        note: 'No active proposal fully covers this yet.',
      },
    ],
    removedProposalCount: 0,
    updatedAt: '2026-05-06T00:00:00.000Z',
  },
  coverageAudit: {
    covered: [
      {
        id: 'coverage-1',
        label: 'Feeling heard',
        source: 'BOTH',
        coveringProposalIds: ['proposal-1'],
        note: null,
      },
    ],
    partial: [],
    open: [
      {
        id: 'coverage-2',
        label: 'Trust after conflict',
        source: 'BOTH',
        coveringProposalIds: [],
        note: 'No active proposal fully covers this yet.',
      },
    ],
    updatedAt: '2026-05-06T00:00:00.000Z',
  },
  mySelections: [],
  partnerSelectionStatus: 'NOT_STARTED',
  outcome: null,
  tendingPreview: null,
};

describe('Stage4RedesignPanel', () => {
  const defaultProps = {
    state: baseState,
    partnerName: 'Eve',
    onSelectProposal: jest.fn(),
    onCloseStage4: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders proposal inventory and needs coverage cards', () => {
    render(<Stage4RedesignPanel {...defaultProps} />);

    expect(screen.getByText('Proposal inventory')).toBeTruthy();
    expect(screen.getByText('Take turns naming the impact before problem solving.')).toBeTruthy();
    expect(screen.getByText('I will pause when my voice gets sharp.')).toBeTruthy();
    expect(screen.getByText('Needs coverage')).toBeTruthy();
    expect(screen.getByText('Feeling heard')).toBeTruthy();
    expect(screen.getAllByText('Trust after conflict').length).toBeGreaterThan(0);
  });

  it('keeps partner selections private before both submit', () => {
    render(<Stage4RedesignPanel {...defaultProps} />);

    expect(screen.getByText('Eve choices stay private until they submit.')).toBeTruthy();
    expect(screen.getAllByText('Private').length).toBeGreaterThan(0);
  });

  it('submits proposal-level willingness selections', () => {
    render(<Stage4RedesignPanel {...defaultProps} />);

    fireEvent.press(screen.getAllByText('Not willing')[0]);

    expect(defaultProps.onSelectProposal).toHaveBeenCalledWith(
      'proposal-1',
      Stage4SelectionDecision.NOT_WILLING
    );
  });

  it('enables shared-agreement closure only when mutual willingness is visible', () => {
    const state: GetStage4StateResponse = {
      ...baseState,
      phase: Stage4Phase.OUTCOME_REVIEW,
      partnerSelectionStatus: 'SUBMITTED',
      inventory: {
        ...baseState.inventory,
        sharedProposals: [
          {
            ...baseState.inventory.sharedProposals[0],
            partnerDecisionVisible: Stage4SelectionDecision.WILLING,
          },
        ],
      },
    };

    render(<Stage4RedesignPanel {...defaultProps} state={state} />);

    fireEvent.press(screen.getByText('Close with shared agreement'));

    expect(defaultProps.onCloseStage4).toHaveBeenCalledWith(
      Stage4ClosureKind.SHARED_AGREEMENT,
      Stage4ClosureReason.MUTUAL_SELECTION
    );
  });

  it('renders no-shared-agreement outcome as a valid close', () => {
    const state: GetStage4StateResponse = {
      ...baseState,
      phase: Stage4Phase.CLOSED_NO_SHARED_AGREEMENT,
      outcome: {
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.NO_OVERLAP,
        summary: 'No shared experiment was right to try yet.',
        agreements: [],
        individualCommitments: [],
        openNeeds: baseState.inventory.unaddressedNeeds,
        closedAt: '2026-05-06T00:00:00.000Z',
      },
    };

    render(<Stage4RedesignPanel {...defaultProps} state={state} />);

    expect(screen.getByText('No shared agreement outcome')).toBeTruthy();
    expect(screen.getByText('No shared experiment was right to try yet.')).toBeTruthy();
    expect(screen.getByText('This is a valid close. Passive Tending re-entry remains available.')).toBeTruthy();
  });

  it('renders shared agreement outcome details', () => {
    const state: GetStage4StateResponse = {
      ...baseState,
      phase: Stage4Phase.CLOSED_SHARED_AGREEMENT,
      outcome: {
        kind: Stage4ClosureKind.SHARED_AGREEMENT,
        reason: Stage4ClosureReason.MUTUAL_SELECTION,
        summary: 'Both people chose one shared experiment.',
        agreements: [
          {
            id: 'agreement-1',
            strategyId: 'proposal-1',
            description: 'Take turns naming the impact before problem solving.',
            type: AgreementType.MICRO_EXPERIMENT,
            duration: 'Two weeks',
            measureOfSuccess: 'Both people can finish a hard talk calmer.',
            status: AgreementStatus.AGREED,
            agreedByMe: true,
            agreedByPartner: true,
            agreedAt: '2026-05-06T00:00:00.000Z',
            followUpDate: null,
          },
        ],
        individualCommitments: [],
        openNeeds: [],
        closedAt: '2026-05-06T00:00:00.000Z',
      },
    };

    render(<Stage4RedesignPanel {...defaultProps} state={state} />);

    expect(screen.getByText('Shared agreement outcome')).toBeTruthy();
    expect(screen.getByText('Both people chose one shared experiment.')).toBeTruthy();
  });
});
