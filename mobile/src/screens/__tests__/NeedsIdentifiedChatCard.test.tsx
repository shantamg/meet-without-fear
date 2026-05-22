import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  deriveChapterMarkers,
  getEmpathyValidationCardStatus,
  isLocalEmpathyValidationCurrent,
  NeedsIdentifiedChatCard,
} from '../UnifiedSessionScreen';
import { Stage } from '@meet-without-fear/shared';

jest.mock('../../lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiClient: {},
  default: {},
  del: jest.fn(),
  get: jest.fn(),
  getAuthToken: jest.fn(),
  getE2EAuthHeaders: jest.fn(),
  isE2EAuthMode: jest.fn(() => false),
  patch: jest.fn(),
  post: jest.fn(),
  setTokenProvider: jest.fn(),
}));

const needs = [
  { id: 'need-1', category: 'SAFETY', need: 'Enough safety to tell the truth' },
  { id: 'need-2', category: 'AUTONOMY', need: 'Trusting my own read' },
];

describe('NeedsIdentifiedChatCard', () => {
  it('exposes confirmed needs as an actionable share button', () => {
    const onReview = jest.fn();

    render(
      <NeedsIdentifiedChatCard
        needs={needs}
        status="confirmed"
        compact
        onReview={onReview}
      />
    );

    const action = screen.getByLabelText('Share confirmed needs');
    expect(action.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Share')).toBeTruthy();

    fireEvent.press(action);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('keeps validation feedback distinct from positive empathy confirmation', () => {
    expect(getEmpathyValidationCardStatus({ locallySentFeedback: true })).toBe('feedback-given');
    expect(getEmpathyValidationCardStatus({ locallyAccepted: true })).toBe('validated');
    expect(getEmpathyValidationCardStatus({ serverValidated: true, locallySentFeedback: true })).toBe('validated');
  });

  it('expires local empathy feedback when the partner statement is revised', () => {
    expect(isLocalEmpathyValidationCurrent(
      { attemptId: 'attempt-1', revisionCount: 1, statusVersion: 4 },
      { id: 'attempt-1', revisionCount: 1, statusVersion: 4 }
    )).toBe(true);

    expect(isLocalEmpathyValidationCurrent(
      { attemptId: 'attempt-1', revisionCount: 1, statusVersion: 4 },
      { id: 'attempt-1', revisionCount: 2, statusVersion: 5 }
    )).toBe(false);
  });
});

describe('deriveChapterMarkers', () => {
  it('anchors Your Story to the Witness stage start when the opening prompt is stored as onboarding', () => {
    const messages: Parameters<typeof deriveChapterMarkers>[0] = [
      {
        id: 'opening-prompt',
        role: 'AI',
        content: "I'd like to hear your side now.",
        timestamp: '2026-05-14T04:51:59.395Z',
        stage: Stage.ONBOARDING,
      },
      {
        id: 'first-witness-response',
        role: 'USER',
        content: 'I actually think the work has been going pretty well.',
        timestamp: '2026-05-14T04:53:43.402Z',
        stage: Stage.WITNESS,
      },
    ];

    const markers = deriveChapterMarkers(
      messages,
      { [Stage.WITNESS]: '2026-05-14T04:51:56.139Z' }
    );

    expect(markers).toEqual([
      expect.objectContaining({
        id: 'stage-chapter-1',
        timestamp: '2026-05-14T04:51:56.139Z',
        metadata: expect.objectContaining({ stageName: 'Your Story' }),
      }),
    ]);
  });
});
