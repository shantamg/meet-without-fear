import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CommonGroundCard } from '../CommonGroundCard';

describe('CommonGroundCard', () => {
  const sharedNeeds = [
    { category: 'Security', description: 'Both want stability' },
    { category: 'Connection', description: 'Both value closeness' },
  ];

  it('renders the title', () => {
    render(<CommonGroundCard sharedNeeds={sharedNeeds} />);
    expect(screen.getByText('Shared Needs Discovered')).toBeTruthy();
  });

  it('renders all shared needs', () => {
    render(<CommonGroundCard sharedNeeds={sharedNeeds} />);
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Both want stability')).toBeTruthy();
    expect(screen.getByText('Connection')).toBeTruthy();
    expect(screen.getByText('Both value closeness')).toBeTruthy();
  });

  it('renders insight when provided', () => {
    const insight = 'You both deeply value feeling safe with each other';
    render(<CommonGroundCard sharedNeeds={sharedNeeds} insight={insight} />);
    expect(screen.getByText(insight)).toBeTruthy();
  });

  it('does not render insight section when not provided', () => {
    render(<CommonGroundCard sharedNeeds={sharedNeeds} />);
    expect(screen.queryByTestId('insight-box')).toBeNull();
  });

  it('renders empty state when no shared needs', () => {
    render(<CommonGroundCard sharedNeeds={[]} />);
    expect(screen.getByText('Shared Needs Discovered')).toBeTruthy();
  });
});
