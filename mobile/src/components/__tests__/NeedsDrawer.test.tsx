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

  it('reveals both needs lists side by side for validation', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="common-ground"
        needs={needs}
        partnerNeeds={partnerNeeds}
        partnerName="Darryl"
        onConfirmCommonGround={jest.fn()}
      />
    );

    expect(screen.getByText('Review Needs Together')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Darryl')).toBeTruthy();
    expect(screen.getByText('Being heard')).toBeTruthy();
    expect(screen.getByText('Room to choose')).toBeTruthy();
    expect(screen.getByText('Validate needs')).toBeTruthy();
  });

  it('does not show common-ground badge or copy in the validation reveal', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="common-ground"
        needs={needs}
        partnerNeeds={partnerNeeds}
        partnerName="Darryl"
        onConfirmCommonGround={jest.fn()}
      />
    );

    expect(screen.queryByText('Common Ground')).toBeNull();
    expect(screen.queryByText('Shared')).toBeNull();
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('validates the needs reveal through the existing confirmation handler', () => {
    const onConfirmCommonGround = jest.fn();

    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="common-ground"
        needs={needs}
        partnerNeeds={partnerNeeds}
        partnerName="Darryl"
        onConfirmCommonGround={onConfirmCommonGround}
      />
    );

    fireEvent.press(screen.getByText('Validate needs'));

    expect(onConfirmCommonGround).toHaveBeenCalledTimes(1);
  });

  it('lets the user mark the reveal as not valid yet', () => {
    const onNeedsNotValidYet = jest.fn();

    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="common-ground"
        needs={needs}
        partnerNeeds={partnerNeeds}
        partnerName="Darryl"
        onConfirmCommonGround={jest.fn()}
        onNeedsNotValidYet={onNeedsNotValidYet}
      />
    );

    fireEvent.press(screen.getByText('Not valid yet'));

    expect(onNeedsNotValidYet).toHaveBeenCalledTimes(1);
  });
});
