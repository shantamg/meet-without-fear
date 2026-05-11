import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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

    expect(screen.getByTestId('needs-drawer-header').props.children).toBe('Your Needs');
    expect(screen.getByText('Being heard')).toBeTruthy();
    expect(screen.getByText('Reliability')).toBeTruthy();
  });

  it('renders reveal mode with both partners needs side by side', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="reveal"
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
    expect(screen.getByText('Review both needs lists side by side, then validate whether they feel accurate.')).toBeTruthy();
  });

  it('uses neutral copy and accessibility labels for reveal actions', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="reveal"
        needs={needs}
        partnerNeeds={partnerNeeds}
        onValidateNeeds={jest.fn()}
        onNeedsNotValidYet={jest.fn()}
      />
    );

    expect(screen.getByText('Not reviewed yet')).toBeTruthy();
    expect(screen.queryByText('Not valid yet')).toBeNull();
    expect(screen.getByLabelText('Needs not reviewed yet')).toBeTruthy();
    expect(screen.getByLabelText('Validate needs')).toBeTruthy();
  });

  it('validates the side-by-side needs reveal from reveal mode', () => {
    const onValidateNeeds = jest.fn();
    const onNeedsNotValidYet = jest.fn();

    const { unmount } = render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="reveal"
        needs={needs}
        partnerNeeds={partnerNeeds}
        onValidateNeeds={onValidateNeeds}
        onNeedsNotValidYet={onNeedsNotValidYet}
      />
    );

    fireEvent.press(screen.getByTestId('needs-drawer-validate-needs'));
    expect(onValidateNeeds).toHaveBeenCalledTimes(1);

    unmount();

    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="reveal"
        needs={needs}
        partnerNeeds={partnerNeeds}
        onValidateNeeds={onValidateNeeds}
        onNeedsNotValidYet={onNeedsNotValidYet}
      />
    );
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

  it('sizes the sheet from its rendered host height', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="needs"
        needs={needs}
      />
    );

    fireEvent(screen.getByTestId('needs-drawer'), 'layout', {
      nativeEvent: { layout: { height: 620 } },
    });

    expect(StyleSheet.flatten(screen.getByTestId('needs-drawer-sheet').props.style).height).toBe(620);
    expect(StyleSheet.flatten(screen.getByTestId('needs-drawer-content').props.style).height).toBe(465);
  });

  it('limits backdrop presses to the area above the visible sheet', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="needs"
        needs={needs}
      />
    );

    fireEvent(screen.getByTestId('needs-drawer'), 'layout', {
      nativeEvent: { layout: { height: 620 } },
    });

    const backdropStyle = StyleSheet.flatten(screen.getByTestId('needs-drawer-backdrop').props.style);
    expect(backdropStyle.top).toBe(0);
    expect(backdropStyle.bottom).toBeUndefined();
    expect(backdropStyle.height).toBe(155);
  });

  it('keeps the sheet layered above the backdrop', () => {
    render(
      <NeedsDrawer
        visible
        onClose={jest.fn()}
        mode="needs"
        needs={needs}
      />
    );

    const sheetStyle = StyleSheet.flatten(screen.getByTestId('needs-drawer-sheet').props.style);
    expect(sheetStyle.zIndex).toBeGreaterThan(0);
  });

  it('closes when the user presses the backdrop', () => {
    const onClose = jest.fn();

    render(
      <NeedsDrawer
        visible
        onClose={onClose}
        mode="needs"
        needs={needs}
      />
    );

    fireEvent.press(screen.getByTestId('needs-drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
