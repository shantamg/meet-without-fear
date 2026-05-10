import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';

import { InnerWorkHubScreen } from '../InnerWorkHubScreen';

const mockUseInnerThoughtsSessions = jest.fn();

jest.mock('../../hooks', () => ({
  useInnerThoughtsSessions: () => mockUseInnerThoughtsSessions(),
}));

jest.mock('../../components/HeaderBackButton', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    HeaderBackButton: ({ onPress }: { onPress?: () => void }) => (
      <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel="Back">
        <Text>Back</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../theme', () => {
  const actual = jest.requireActual('../../theme');
  return {
    ...actual,
    useAppAppearance: () => ({
      preference: 'light',
      scheme: 'light',
      palette: actual.appPalettes.light,
      setPreference: jest.fn(),
    }),
  };
});

const session: InnerWorkSessionSummaryDTO = {
  id: 'inner-session-1',
  title: 'Sorting through the argument',
  theme: 'Repair',
  summary: 'Thinking through what happened last night.',
  messageCount: 4,
  createdAt: '2026-05-10T10:00:00.000Z',
  updatedAt: '2026-05-10T10:10:00.000Z',
  linkedPartnerSessionId: null,
};

describe('InnerWorkHubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseInnerThoughtsSessions.mockReturnValue({
      data: { sessions: [session] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('starts a new session directly from the hub', () => {
    const onStartNewSession = jest.fn();

    render(<InnerWorkHubScreen onStartNewSession={onStartNewSession} />);

    fireEvent.press(screen.getByText('New Session'));

    expect(onStartNewSession).toHaveBeenCalledTimes(1);
  });

  it('opens a selected session directly from the hub list', () => {
    const onOpenSession = jest.fn();

    render(<InnerWorkHubScreen onOpenSession={onOpenSession} />);

    fireEvent.press(screen.getByText('May 10, 2026'));

    expect(onOpenSession).toHaveBeenCalledWith('inner-session-1');
  });
});
