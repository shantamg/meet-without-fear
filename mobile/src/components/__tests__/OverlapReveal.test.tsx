/**
 * OverlapReveal Component Tests
 *
 * Tests for the overlap reveal component that shows possible shared steps.
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

    expect(screen.getByText(/both marked worth discussing/i)).toBeTruthy();
  });

  it('shows possible shared steps header', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.getByText(/possible shared steps/i)).toBeTruthy();
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

    expect(screen.getByText(/different preferences/i)).toBeTruthy();
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
    expect(screen.getByText(/no shared next step/i)).toBeTruthy();
  });

  it('frames overlap as worth discussing rather than an agreement', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.getAllByText(/worth discussing/i).length).toBeGreaterThan(0);
  });

  it('does not show unique section when no unique choices', () => {
    render(
      <OverlapReveal
        overlapping={overlappingStrategies}
        uniqueToMe={[]}
        uniqueToPartner={[]}
      />
    );

    expect(screen.queryByText(/different preferences/i)).toBeNull();
  });

  it('hides the create next-step button for strategies that already have agreements', () => {
    render(
      <OverlapReveal
        overlapping={[overlappingStrategies[0]]}
        uniqueToMe={[]}
        uniqueToPartner={[]}
        onCreateAgreement={jest.fn()}
        existingAgreementStrategyIds={['strategy-1']}
      />
    );

    expect(screen.queryByTestId('create-agreement-button')).toBeNull();
    expect(screen.getByText('Next step already proposed.')).toBeTruthy();
  });
});
