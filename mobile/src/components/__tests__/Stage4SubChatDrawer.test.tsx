import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  MessageRole,
  Stage4SubChatAnchor,
  Stage4SubChatDTO,
  Stage4SubChatStatus,
} from '@meet-without-fear/shared';
import { Stage4SubChatDrawer } from '../Stage4SubChatDrawer';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const mockIcon = (props: Record<string, unknown>) =>
    React.createElement('Icon', props);
  return new Proxy({}, { get: () => mockIcon });
});

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
    messages: [
      { id: 'm1', role: MessageRole.AI, content: 'What feels stuck?', createdAt: 'x' },
    ],
    ...overrides,
  };
}

describe('Stage4SubChatDrawer', () => {
  it('renders NEEDS_BRAINSTORM with a drafts cluster (no proposal-edit area)', () => {
    const { getByTestId, queryByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat()}
        anchorLabel="feeling like myself inside this marriage"
        onSendMessage={() => {}}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    expect(getByTestId('stage4-subchat-drawer-drafts')).toBeTruthy();
    expect(queryByTestId('stage4-subchat-drawer-proposal-edit')).toBeNull();
    expect(getByTestId('stage4-subchat-drawer-header').props.children).toContain(
      'feeling like myself'
    );
  });

  it('renders PROPOSAL_REFINEMENT with the proposal-edit cluster', () => {
    const { getByTestId, queryByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
          anchorId: 'prop-1',
        })}
        anchorLabel="walk together"
        initialProposalText="walk together each evening"
        onSendMessage={() => {}}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    expect(getByTestId('stage4-subchat-drawer-proposal-edit')).toBeTruthy();
    expect(queryByTestId('stage4-subchat-drawer-drafts')).toBeNull();
  });

  it('renders NO_OVERLAP with both clusters', () => {
    const { getByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          anchorKind: Stage4SubChatAnchor.NO_OVERLAP,
          anchorId: null,
        })}
        onSendMessage={() => {}}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    expect(getByTestId('stage4-subchat-drawer-drafts')).toBeTruthy();
    expect(getByTestId('stage4-subchat-drawer-proposal-edit-optional')).toBeTruthy();
  });

  it('Accept queues a draft; Save & close calls onResolve with acceptedProposals', () => {
    const onResolve = jest.fn();
    const { getByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat()}
        onSendMessage={() => {}}
        onResolve={onResolve}
        onClose={() => {}}
      />
    );
    act(() => {
      fireEvent.changeText(
        getByTestId('stage4-subchat-drawer-draft-input'),
        'a walk each evening'
      );
    });
    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-draft-accept'));
    });
    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-save'));
    });
    expect(onResolve).toHaveBeenCalledWith({
      acceptedProposals: [{ description: 'a walk each evening' }],
      updatedProposals: [],
    });
  });

  it('PROPOSAL_REFINEMENT Save & close emits updatedProposals for the anchor proposal', () => {
    const onResolve = jest.fn();
    const { getByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat({
          anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
          anchorId: 'prop-1',
        })}
        initialProposalText="walk together each evening"
        onSendMessage={() => {}}
        onResolve={onResolve}
        onClose={() => {}}
      />
    );
    act(() => {
      fireEvent.changeText(
        getByTestId('stage4-subchat-drawer-proposal-input'),
        'walk together for 20 minutes'
      );
    });
    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-save'));
    });
    expect(onResolve).toHaveBeenCalledWith({
      acceptedProposals: [],
      updatedProposals: [
        { proposalId: 'prop-1', description: 'walk together for 20 minutes' },
      ],
    });
  });

  it('forwards typed messages to onSendMessage', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(
      <Stage4SubChatDrawer
        visible
        subChat={makeSubChat()}
        onSendMessage={onSend}
        onResolve={() => {}}
        onClose={() => {}}
      />
    );
    act(() => {
      fireEvent.changeText(getByTestId('stage4-subchat-drawer-input'), 'hi');
    });
    act(() => {
      fireEvent.press(getByTestId('stage4-subchat-drawer-send'));
    });
    expect(onSend).toHaveBeenCalledWith('hi');
  });
});
