/**
 * StrategyCard Component Tests
 *
 * Tests for the strategy card component that displays unlabeled strategies.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StrategyCard } from '../StrategyCard';

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

describe('StrategyCard', () => {
  const mockStrategy = {
    id: 'strategy-1',
    description: 'Take turns speaking without interruption for 5 minutes each',
    duration: '2 weeks',
  };

  it('renders strategy description', () => {
    render(<StrategyCard strategy={mockStrategy} />);

    expect(
      screen.getByText(
        'Take turns speaking without interruption for 5 minutes each'
      )
    ).toBeTruthy();
  });

  it('renders duration when provided', () => {
    render(<StrategyCard strategy={mockStrategy} />);

    expect(screen.getByText('2 weeks')).toBeTruthy();
  });

  it('does not render duration when not provided', () => {
    const strategyWithoutDuration = { ...mockStrategy, duration: undefined };
    render(<StrategyCard strategy={strategyWithoutDuration} />);

    expect(screen.queryByText('2 weeks')).toBeNull();
  });

  it('shows unselected state by default', () => {
    render(<StrategyCard strategy={mockStrategy} onSelect={() => {}} />);

    // Should have a selectable indicator but not show rank
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('shows selected state with rank number', () => {
    render(
      <StrategyCard
        strategy={mockStrategy}
        selected={true}
        rank={1}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('1')).toBeTruthy();
  });

  it('calls onSelect when pressed', () => {
    const onSelectMock = jest.fn();
    render(<StrategyCard strategy={mockStrategy} onSelect={onSelectMock} />);

    fireEvent.press(
      screen.getByText(
        'Take turns speaking without interruption for 5 minutes each'
      )
    );

    expect(onSelectMock).toHaveBeenCalled();
  });

  it('is not pressable when onSelect is not provided', () => {
    render(<StrategyCard strategy={mockStrategy} />);

    // The component should render but not be interactive
    expect(
      screen.getByText(
        'Take turns speaking without interruption for 5 minutes each'
      )
    ).toBeTruthy();
  });

  it('shows overlap styling when isOverlap is true', () => {
    render(<StrategyCard strategy={mockStrategy} isOverlap={true} />);

    // The overlap badge should be present
    expect(screen.getByTestId('overlap-badge')).toBeTruthy();
  });

  it('does not show overlap badge when isOverlap is false', () => {
    render(<StrategyCard strategy={mockStrategy} isOverlap={false} />);

    expect(screen.queryByTestId('overlap-badge')).toBeNull();
  });

  it('does not show attribution (no "you suggested" or "partner suggested")', () => {
    render(<StrategyCard strategy={mockStrategy} />);

    expect(screen.queryByText(/you suggested/i)).toBeNull();
    expect(screen.queryByText(/partner suggested/i)).toBeNull();
    expect(screen.queryByText(/suggested by/i)).toBeNull();
  });
});
