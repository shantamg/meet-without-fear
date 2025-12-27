/**
 * StrategyPool Component Tests
 *
 * Tests for the strategy pool component that displays unlabeled strategies.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StrategyPool } from '../StrategyPool';

// Mock lucide-react-native icons
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

describe('StrategyPool', () => {
  const mockStrategies = [
    {
      id: 'strategy-1',
      description: 'Take turns speaking without interruption',
      duration: '2 weeks',
    },
    {
      id: 'strategy-2',
      description: 'Schedule a weekly check-in conversation',
      duration: '1 month',
    },
    {
      id: 'strategy-3',
      description: 'Practice active listening exercises',
    },
  ];

  const defaultProps = {
    strategies: mockStrategies,
    onRequestMore: jest.fn(),
    onReady: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows strategy pool without attribution', () => {
    render(<StrategyPool {...defaultProps} />);

    // Verify strategies shown without "You suggested" or "Partner suggested"
    expect(screen.queryByText(/you suggested/i)).toBeNull();
    expect(screen.queryByText(/partner suggested/i)).toBeNull();
  });

  it('renders all strategies in the pool', () => {
    render(<StrategyPool {...defaultProps} />);

    expect(
      screen.getByText('Take turns speaking without interruption')
    ).toBeTruthy();
    expect(
      screen.getByText('Schedule a weekly check-in conversation')
    ).toBeTruthy();
    expect(
      screen.getByText('Practice active listening exercises')
    ).toBeTruthy();
  });

  it('displays header text explaining unlabeled strategies', () => {
    render(<StrategyPool {...defaultProps} />);

    expect(
      screen.getByText(/strategies are shown without attribution/i)
    ).toBeTruthy();
  });

  it('allows requesting more AI suggestions', () => {
    render(<StrategyPool {...defaultProps} />);

    const moreButton = screen.getByText(/generate more ideas/i);
    expect(moreButton).toBeTruthy();

    fireEvent.press(moreButton);
    expect(defaultProps.onRequestMore).toHaveBeenCalled();
  });

  it('shows generating state when isGenerating is true', () => {
    render(<StrategyPool {...defaultProps} isGenerating={true} />);

    expect(screen.getByText(/generating/i)).toBeTruthy();
  });

  it('allows proceeding to ranking', () => {
    render(<StrategyPool {...defaultProps} />);

    const readyButton = screen.getByText(/rank my choices/i);
    expect(readyButton).toBeTruthy();

    fireEvent.press(readyButton);
    expect(defaultProps.onReady).toHaveBeenCalled();
  });

  it('renders empty state when no strategies', () => {
    render(<StrategyPool {...defaultProps} strategies={[]} />);

    // Should still show the header and buttons
    expect(screen.getByText(/generate more ideas/i)).toBeTruthy();
  });
});
