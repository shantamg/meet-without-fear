import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MessageRole,
  Stage4SubChatAnchor,
  Stage4SubChatDTO,
  Stage4SubChatMessageDTO,
  Stage4SubChatStatus,
} from '@meet-without-fear/shared';
import { Stage4SubChatDrawer } from '../Stage4SubChatDrawer';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const mockIcon = (props: Record<string, unknown>) =>
    React.createElement('Icon', props);
  return new Proxy({}, { get: () => mockIcon });
});

jest.mock('../SpeakerButton', () => {
  return { SpeakerButton: () => null };
});

jest.mock('../../hooks/useSpeech', () => ({
  useSpeech: () => ({
    isSpeaking: false,
    currentId: null,
    toggle: jest.fn(),
  }),
  useAutoSpeech: () => ({
    isAutoSpeechEnabled: false,
  }),
}));

function msg(
  overrides: Partial<Stage4SubChatMessageDTO> & { id: string }
): Stage4SubChatMessageDTO {
  return {
    role: MessageRole.AI,
    content: '',
    createdAt: '2026-05-12T00:00:00Z',
    candidate: null,
    ...overrides,
  };
}

function makeSubChat(
  overrides: Partial<Stage4SubChatDTO> = {}
): Stage4SubChatDTO {
  return {
    id: 'sub-1',
    sessionId: 'session-1',
    userId: 'user-1',
    anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
    anchorId: 'need-1',
    status: Stage4SubChatStatus.ACTIVE,
    createdAt: '2026-05-12T00:00:00Z',
    resolvedAt: null,
    messages: [msg({ id: 'm1', content: 'What feels stuck?' })],
    ...overrides,
  };
}

describe('Stage4SubChatDrawer', () => {
  it('renders the anchor label in the subtitle for NEEDS_BRAINSTORM', () => {
    const { getByText } = renderWithClient(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat()}
        anchorLabel="feeling like myself inside this marriage"
        onSendMessage={() => {}}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    expect(getByText(/feeling like myself inside this marriage/)).toBeTruthy();
  });

  it('shows the current proposal in the intro for PROPOSAL_REFINEMENT', () => {
    const { getByText } = renderWithClient(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
          anchorId: 'prop-1',
        })}
        initialProposalText="walk together each evening"
        onSendMessage={() => {}}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    expect(getByText(/walk together each evening/)).toBeTruthy();
  });

  it('forwards typed messages to onSendMessage', () => {
    const onSend = jest.fn();
    const { getByTestId } = renderWithClient(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat()}
        onSendMessage={onSend}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'hi');
    });
    act(() => {
      fireEvent.press(getByTestId('send-button'));
    });
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('renders the latest AI candidate in the card and calls onResolve with acceptedProposals for NEEDS_BRAINSTORM', () => {
    const onResolve = jest.fn();
    const { getByTestId, getByText } = renderWithClient(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          messages: [
            msg({
              id: 'm-old',
              content: 'How about a daily walk?',
              candidate: { description: 'a daily walk' },
            }),
            msg({ id: 'm-user', role: MessageRole.USER, content: 'shorter' }),
            msg({
              id: 'm-new',
              content: 'A 10-minute walk after dinner each night for one week.',
              candidate: {
                description: 'A 10-minute walk after dinner each night for one week.',
              },
            }),
          ],
        })}
        onSendMessage={() => {}}
        onResolve={onResolve}
        onClose={() => {}}
      />
    );
    expect(
      getByText('A 10-minute walk after dinner each night for one week.'),
    ).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-use-candidate'));
    });
    expect(onResolve).toHaveBeenCalledWith({
      acceptedProposals: [
        {
          description: 'A 10-minute walk after dinner each night for one week.',
          duration: null,
          measureOfSuccess: null,
        },
      ],
      updatedProposals: [],
    });
  });

  it('PROPOSAL_REFINEMENT: "Use this version" emits updatedProposals for the anchor proposal', () => {
    const onResolve = jest.fn();
    const { getByTestId } = renderWithClient(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
          anchorId: 'prop-1',
          messages: [
            msg({
              id: 'm1',
              content: 'Try a 20-minute version.',
              candidate: {
                proposalId: 'prop-1',
                description: 'walk together for 20 minutes',
              },
            }),
          ],
        })}
        initialProposalText="walk together each evening"
        onSendMessage={() => {}}
        onResolve={onResolve}
        onClose={() => {}}
      />
    );
    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-use-candidate'));
    });
    expect(onResolve).toHaveBeenCalledWith({
      acceptedProposals: [],
      updatedProposals: [
        {
          proposalId: 'prop-1',
          description: 'walk together for 20 minutes',
          duration: null,
          measureOfSuccess: null,
        },
      ],
    });
  });
});
