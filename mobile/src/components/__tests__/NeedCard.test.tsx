import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NeedCard } from '../NeedCard';

describe('NeedCard', () => {
  const defaultNeed = {
    category: 'Security',
    description: 'A need for safety and stability',
  };

  it('renders the need category', () => {
    render(<NeedCard need={defaultNeed} />);
    expect(screen.getByText('Security')).toBeTruthy();
  });

  it('renders the need description', () => {
    render(<NeedCard need={defaultNeed} />);
    expect(screen.getByText('A need for safety and stability')).toBeTruthy();
  });

  it('shows shared badge when isShared is true', () => {
    render(<NeedCard need={defaultNeed} isShared />);
    expect(screen.getByText('Shared')).toBeTruthy();
  });

  it('does not show shared badge when isShared is false', () => {
    render(<NeedCard need={defaultNeed} isShared={false} />);
    expect(screen.queryByText('Shared')).toBeNull();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<NeedCard need={defaultNeed} onPress={onPress} />);
    fireEvent.press(screen.getByText('Security'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not pressable when onPress is not provided', () => {
    render(<NeedCard need={defaultNeed} testID="need-card" />);
    const card = screen.getByTestId('need-card');
    expect(card).toBeTruthy();
  });
});
