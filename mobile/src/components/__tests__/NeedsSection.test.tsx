import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NeedsSection } from '../NeedsSection';

describe('NeedsSection', () => {
  const mockNeeds = [
    { id: '1', category: 'Security', description: 'Need for safety' },
    { id: '2', category: 'Connection', description: 'Need for closeness' },
    { id: '3', category: 'Autonomy', description: 'Need for independence' },
  ];

  it('renders the section title', () => {
    render(<NeedsSection title="Your Identified Needs" needs={mockNeeds} />);
    expect(screen.getByText('Your Identified Needs')).toBeTruthy();
  });

  it('renders all needs', () => {
    render(<NeedsSection title="Needs" needs={mockNeeds} />);
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Connection')).toBeTruthy();
    expect(screen.getByText('Autonomy')).toBeTruthy();
  });

  it('renders empty section when no needs provided', () => {
    render(<NeedsSection title="Empty Section" needs={[]} />);
    expect(screen.getByText('Empty Section')).toBeTruthy();
  });
});
