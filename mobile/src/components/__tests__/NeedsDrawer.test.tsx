import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NeedsDrawer } from '../NeedsDrawer';

describe('NeedsDrawer', () => {
  const needs = [
    { id: 'need-1', category: 'Respect', need: 'Being heard', confirmed: true },
    { id: 'need-2', category: 'Trust', need: 'Reliability', confirmed: true },
  ];

  const partnerNeeds = [
    { id: 'partner-need-1', category: 'Autonomy', need: 'Room to choose', confirmed: true },
    { id: 'partner-need-2', category: 'Care', need: 'Gentler timing', confirmed: true },
  ];

  it('renders needs mode with identified needs', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="needs"
        needs={needs}
      />
    );

    expect(screen.getByText('Your Needs')).toBeTruthy();
    expect(screen.getByText('Being heard')).toBeTruthy();
    expect(screen.getByText('Reliability')).toBeTruthy();
  });

  it('renders comparison mode with both partners needs side by side', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="comparison"
        needs={needs}
        partnerNeeds={partnerNeeds}
        partnerName="Darryl"
      />
    );

    expect(screen.getByText('Needs Side by Side')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Darryl')).toBeTruthy();
    expect(screen.getByText('Being heard')).toBeTruthy();
    expect(screen.getByText('Room to choose')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    render(
      <NeedsDrawer
        visible={false}
        onClose={jest.fn()}
        mode="needs"
        needs={needs}
      />
    );

    expect(screen.queryByText('Your Needs')).toBeNull();
  });
});
