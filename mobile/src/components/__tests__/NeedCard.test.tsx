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
