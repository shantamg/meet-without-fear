/**
 * StrategyRanking Component Tests
 *
 * Tests for the private ranking interface.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StrategyRanking } from '../StrategyRanking';

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

describe('StrategyRanking', () => {
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
    {
      id: 'strategy-4',
      description: 'Write appreciation notes to each other',
    },
  ];

  const defaultProps = {
    strategies: mockStrategies,
    onSubmit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows private ranking interface', () => {
    render(<StrategyRanking {...defaultProps} />);

    expect(screen.getByText(/rank your top choices/i)).toBeTruthy();
  });

  it('explains that rankings are private', () => {
    render(<StrategyRanking {...defaultProps} />);

    expect(
      screen.getByText(/partner will not see your picks until/i)
    ).toBeTruthy();
  });

  it('renders all strategies for ranking', () => {
    render(<StrategyRanking {...defaultProps} />);

    expect(
      screen.getByText('Take turns speaking without interruption')
    ).toBeTruthy();
    expect(
      screen.getByText('Schedule a weekly check-in conversation')
    ).toBeTruthy();
    expect(
      screen.getByText('Practice active listening exercises')
    ).toBeTruthy();
    expect(
      screen.getByText('Write appreciation notes to each other')
    ).toBeTruthy();
  });

  it('allows selecting up to 3 strategies', () => {
    render(<StrategyRanking {...defaultProps} />);

    // Select first strategy
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    expect(screen.getByText('1/3 selected')).toBeTruthy();

    // Select second strategy
    fireEvent.press(
      screen.getByText('Schedule a weekly check-in conversation')
    );
    expect(screen.getByText('2/3 selected')).toBeTruthy();

    // Select third strategy
    fireEvent.press(screen.getByText('Practice active listening exercises'));
    expect(screen.getByText('3/3 selected')).toBeTruthy();
  });

  it('shows rank numbers on selected strategies', () => {
    render(<StrategyRanking {...defaultProps} />);

    // Select strategies in order
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    fireEvent.press(
      screen.getByText('Schedule a weekly check-in conversation')
    );
    fireEvent.press(screen.getByText('Practice active listening exercises'));

    // Should show rank numbers 1, 2, 3
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('allows deselecting a strategy', () => {
    render(<StrategyRanking {...defaultProps} />);

    // Select a strategy
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    expect(screen.getByText('1/3 selected')).toBeTruthy();

    // Deselect it
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    expect(screen.getByText('0/3 selected')).toBeTruthy();
  });

  it('prevents selecting more than 3 strategies', () => {
    render(<StrategyRanking {...defaultProps} />);

    // Select 3 strategies
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    fireEvent.press(
      screen.getByText('Schedule a weekly check-in conversation')
    );
    fireEvent.press(screen.getByText('Practice active listening exercises'));

    // Try to select a 4th
    fireEvent.press(
      screen.getByText('Write appreciation notes to each other')
    );

    // Should still be 3
    expect(screen.getByText('3/3 selected')).toBeTruthy();
  });

  it('disables submit button when no selections', () => {
    render(<StrategyRanking {...defaultProps} />);

    const submitButton = screen.getByText(/submit my ranking/i);
    fireEvent.press(submitButton);

    // onSubmit should not be called
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with ranked strategy IDs', () => {
    render(<StrategyRanking {...defaultProps} />);

    // Select strategies in order
    fireEvent.press(
      screen.getByText('Take turns speaking without interruption')
    );
    fireEvent.press(
      screen.getByText('Schedule a weekly check-in conversation')
    );
    fireEvent.press(screen.getByText('Practice active listening exercises'));

    // Submit
    fireEvent.press(screen.getByText(/submit my ranking/i));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith([
      'strategy-1',
      'strategy-2',
      'strategy-3',
    ]);
  });
});
