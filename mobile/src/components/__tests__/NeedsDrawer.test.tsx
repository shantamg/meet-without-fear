import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
    expect(screen.getByText('Review both needs lists side by side. What do you notice?')).toBeTruthy();
  });

  it('validates the side-by-side needs reveal from comparison mode', () => {
    const onValidateNeeds = jest.fn();
    const onNeedsNotValidYet = jest.fn();

    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="comparison"
        needs={needs}
        partnerNeeds={partnerNeeds}
        onValidateNeeds={onValidateNeeds}
        onNeedsNotValidYet={onNeedsNotValidYet}
      />
    );

    fireEvent.press(screen.getByTestId('needs-drawer-validate-needs'));
    expect(onValidateNeeds).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('needs-drawer-not-valid-yet'));
    expect(onNeedsNotValidYet).toHaveBeenCalledTimes(1);
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
