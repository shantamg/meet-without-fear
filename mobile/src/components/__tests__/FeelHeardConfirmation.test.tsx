/**
 * FeelHeardConfirmation Component Tests
 *
 * Tests for the Stage 1 feel heard confirmation component.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FeelHeardConfirmation } from '../FeelHeardConfirmation';

describe('FeelHeardConfirmation', () => {
  const defaultProps = {
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders confirm button', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText('I feel heard')).toBeTruthy();
  });

  it('calls onConfirm when confirm is pressed', () => {
    const onConfirm = jest.fn();
    render(<FeelHeardConfirmation onConfirm={onConfirm} />);
    fireEvent.press(screen.getByText('I feel heard'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
