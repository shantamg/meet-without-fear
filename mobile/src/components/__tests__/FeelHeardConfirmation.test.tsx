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
    onContinue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders continue button', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText('Not yet')).toBeTruthy();
  });

  it('renders confirm button', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText('I feel heard')).toBeTruthy();
  });

  it('calls onContinue when continue is pressed', () => {
    const onContinue = jest.fn();
    render(<FeelHeardConfirmation onConfirm={jest.fn()} onContinue={onContinue} />);
    fireEvent.press(screen.getByText('Not yet'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('calls onConfirm when confirm is pressed', () => {
    const onConfirm = jest.fn();
    render(<FeelHeardConfirmation onConfirm={onConfirm} onContinue={jest.fn()} />);
    fireEvent.press(screen.getByText('I feel heard'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
