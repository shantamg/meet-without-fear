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

  it('renders the question', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText('Do you feel fully heard?')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText(/take your time/i)).toBeTruthy();
  });

  it('renders continue button', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText(/not yet, I have more to share/i)).toBeTruthy();
  });

  it('renders confirm button', () => {
    render(<FeelHeardConfirmation {...defaultProps} />);
    expect(screen.getByText(/yes, I feel heard/i)).toBeTruthy();
  });

  it('calls onContinue when continue is pressed', () => {
    const onContinue = jest.fn();
    render(<FeelHeardConfirmation onConfirm={jest.fn()} onContinue={onContinue} />);
    fireEvent.press(screen.getByText(/not yet, I have more to share/i));
    expect(onContinue).toHaveBeenCalled();
  });

  it('calls onConfirm when confirm is pressed', () => {
    const onConfirm = jest.fn();
    render(<FeelHeardConfirmation onConfirm={onConfirm} onContinue={jest.fn()} />);
    fireEvent.press(screen.getByText(/yes, I feel heard/i));
    expect(onConfirm).toHaveBeenCalled();
  });
});
