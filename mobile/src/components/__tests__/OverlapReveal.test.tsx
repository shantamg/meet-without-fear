/**
 * OverlapReveal Component Tests
 *
 * Tests for the overlap reveal component that shows shared priorities.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OverlapReveal } from '../OverlapReveal';

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

describe('OverlapReveal', () => {
  const overlappingStrategies = [
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
  ];

  const uniqueToMe = [
    {
      id: 'strategy-3',
      description: 'Practice active listening exercises',
    },
  ];

  const uniqueToPartner = [
    {
      id: 'strategy-4',
      description: 'Write appreciation notes to each other',
    },
  ];

  it('reveals overlap after both rank', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.getByText(/you both chose/i)).toBeTruthy();
  });

  it('shows shared priorities header', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.getByText(/shared priorities/i)).toBeTruthy();
  });

  it('renders overlapping strategies', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(
      screen.getByText('Take turns speaking without interruption')
    ).toBeTruthy();
    expect(
      screen.getByText('Schedule a weekly check-in conversation')
    ).toBeTruthy();
  });

  it('shows unique selections section when there are unique choices', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={uniqueToMe}
        uniqueToPartner={uniqueToPartner}
      />
    );

    expect(screen.getByText(/only one of you chose/i)).toBeTruthy();
    expect(
      screen.getByText('Practice active listening exercises')
    ).toBeTruthy();
    expect(
      screen.getByText('Write appreciation notes to each other')
    ).toBeTruthy();
  });

  it('handles no overlap gracefully', () => {
    render(
      <OverlapReveal
        overlapping={[]}
        uniqueToMe={uniqueToMe}
        uniqueToPartner={uniqueToPartner}
      />
    );

    expect(screen.getByText(/no direct overlap/i)).toBeTruthy();
    expect(screen.getByText(/that is okay/i)).toBeTruthy();
  });

  it('shows positive messaging for common ground', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.getByText(/common ground found/i)).toBeTruthy();
  });

  it('does not show unique section when no unique choices', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.queryByText(/only one of you chose/i)).toBeNull();
  });
});
