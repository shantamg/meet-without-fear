import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { SuggestedAction } from '@meet-without-fear/shared';

import { SuggestedActionButtons } from '../SuggestedActionButtons';
import { appPalettes } from '../../theme';

jest.mock('../../theme', () => {
  const actual = jest.requireActual('../../theme');
  return {
    ...actual,
    useAppAppearance: () => ({
      preference: 'light',
      scheme: 'light',
      palette: actual.appPalettes.light,
      setPreference: jest.fn(),
    }),
  };
});

const actions: SuggestedAction[] = [
  {
    type: 'start_partner_session',
    label: 'Start a conversation with Alex',
    personName: 'Alex',
    context: 'The user is ready to talk with Alex.',
  },
  {
    type: 'add_gratitude',
    label: 'Capture a gratitude note',
    context: 'The user named something they appreciate.',
  },
];

describe('SuggestedActionButtons', () => {
  it('renders compact appearance-aware action rows', () => {
    render(
      <SuggestedActionButtons
        actions={actions}
        onActionPress={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    const action = screen.getByLabelText('Start a conversation with Alex');
    const flattenedStyle = StyleSheet.flatten(action.props.style);

    expect(screen.getByText('Suggested next steps')).toBeTruthy();
    expect(flattenedStyle.borderRadius).toBe(8);
    expect(flattenedStyle.backgroundColor).toBe(appPalettes.light.bgElev);
    expect(flattenedStyle.flexDirection).toBe('row');
  });

  it('calls action and dismiss handlers', () => {
    const onActionPress = jest.fn();
    const onDismiss = jest.fn();

    render(
      <SuggestedActionButtons
        actions={actions}
        onActionPress={onActionPress}
        onDismiss={onDismiss}
      />
    );

    fireEvent.press(screen.getByLabelText('Start a conversation with Alex'));
    fireEvent.press(screen.getByLabelText('Dismiss suggested next steps'));

    expect(onActionPress).toHaveBeenCalledWith(actions[0]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
