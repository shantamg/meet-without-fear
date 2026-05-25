import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MessageRole, NeedCategory } from '@meet-without-fear/shared';
import {
  createNeedRefinementMessage,
  NeedRefinementDrawer,
} from '../NeedRefinementDrawer';

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

const need = {
  id: 'need-1',
  need: 'To feel taken seriously when I say something matters to me',
  category: NeedCategory.RECOGNITION,
  description: 'To feel taken seriously when I say something matters to me',
  evidence: [],
  confirmed: true,
  aiConfidence: 0.9,
};

describe('NeedRefinementDrawer', () => {
  it('renders the existing need as the first draft card and sends chat messages', () => {
    const onSend = jest.fn();
    const onClose = jest.fn();
    const { getAllByText, getByText, getByTestId } = render(
      <NeedRefinementDrawer
        visible
        need={need}
        sessionId="session-1"
        messages={[]}
        onSendMessage={onSend}
        onApplyPlan={() => {}}
        onClose={onClose}
      />
    );

    expect(getByText("Here's the current version. You can use it as-is, or tell me what you'd like to make clearer.")).toBeTruthy();
    expect(getByText('Need')).toBeTruthy();
    expect(getAllByText(/To feel taken seriously when I say something matters to me/).length).toBeGreaterThan(0);

    act(() => {
      fireEvent.press(getByTestId('need-refinement-drawer-use-version'));
    });
    expect(onClose).toHaveBeenCalled();

    act(() => {
      fireEvent.changeText(getByTestId('chat-input'), 'make it more specific');
    });
    act(() => {
      fireEvent.press(getByTestId('send-button'));
    });

    expect(onSend).toHaveBeenCalledWith('make it more specific');
  });

  it('shows a proposed need and applies its plan', () => {
    const onApplyPlan = jest.fn();
    const plan = {
      summary: 'This makes it more concrete.',
      operations: [{
        type: 'updateNeedText' as const,
        needId: need.id,
        newText: 'To be taken seriously when I set a personal boundary',
        newCategory: NeedCategory.RECOGNITION,
      }],
      affectedNeeds: [{
        needId: need.id,
        before: { text: need.need, category: NeedCategory.RECOGNITION },
        after: {
          text: 'To be taken seriously when I set a personal boundary',
          category: NeedCategory.RECOGNITION,
        },
        operation: 'text_change' as const,
      }],
    };

    const { getByText, getByTestId } = render(
      <NeedRefinementDrawer
        visible
        need={need}
        sessionId="session-1"
        messages={[
          createNeedRefinementMessage({
            id: 'ai-1',
            sessionId: 'session-1',
            role: MessageRole.AI,
            content: plan.summary,
            plan,
          }),
        ]}
        onSendMessage={() => {}}
        onApplyPlan={onApplyPlan}
        onClose={() => {}}
      />
    );

    expect(getByText(/To be taken seriously when I set a personal boundary/)).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('need-refinement-drawer-use-version'));
    });

    expect(onApplyPlan).toHaveBeenCalledWith(plan);
  });

  it('keeps the seeded current need before later refinement proposals', () => {
    const plan = {
      summary: 'Updating the need to be more specific.',
      operations: [{
        type: 'updateNeedText' as const,
        needId: need.id,
        newText: 'To feel taken seriously when I express a personal boundary',
        newCategory: NeedCategory.RECOGNITION,
      }],
      affectedNeeds: [{
        needId: need.id,
        before: { text: need.need, category: NeedCategory.RECOGNITION },
        after: {
          text: 'To feel taken seriously when I express a personal boundary',
          category: NeedCategory.RECOGNITION,
        },
        operation: 'text_change' as const,
      }],
    };

    const { getByTestId } = render(
      <NeedRefinementDrawer
        visible
        need={need}
        sessionId="session-1"
        messages={[
          createNeedRefinementMessage({
            id: 'ai-1',
            sessionId: 'session-1',
            role: MessageRole.AI,
            content: plan.summary,
            plan,
            timestamp: '2026-05-20T21:00:00.000Z',
          }),
        ]}
        onSendMessage={() => {}}
        onApplyPlan={() => {}}
        onClose={() => {}}
      />
    );

    const listData = getByTestId('chat-message-list').props.data;
    expect(listData[0].content).toBe(
      "Here's the current version. You can use it as-is, or tell me what you'd like to make clearer."
    );
    expect(listData[1].content).toBe('Updating the need to be more specific.');
  });
});
