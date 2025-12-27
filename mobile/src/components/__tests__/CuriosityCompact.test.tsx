/**
 * CuriosityCompact Component Tests
 *
 * Tests for the Stage 0 curiosity compact signing component.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { CuriosityCompact } from '../CuriosityCompact';

// Mock the useSignCompact hook
const mockSignCompact = jest.fn();
jest.mock('../../hooks/useStages', () => ({
  useSignCompact: () => ({
    mutate: mockSignCompact,
    isPending: false,
  }),
}));

describe('CuriosityCompact', () => {
  const defaultProps = {
    sessionId: '123',
    onSign: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders compact terms', () => {
    render(<CuriosityCompact {...defaultProps} />);
    expect(screen.getByText(/approach this process with curiosity/i)).toBeTruthy();
  });

  it('renders the title', () => {
    render(<CuriosityCompact {...defaultProps} />);
    expect(screen.getByText('The Curiosity Compact')).toBeTruthy();
  });

  it('renders commitment items', () => {
    render(<CuriosityCompact {...defaultProps} />);
    expect(screen.getByText(/allow the AI to guide the pace/i)).toBeTruthy();
    expect(screen.getByText(/share honestly within my private space/i)).toBeTruthy();
  });

  it('renders understanding items', () => {
    render(<CuriosityCompact {...defaultProps} />);
    expect(screen.getByText(/the AI will not judge who is right or wrong/i)).toBeTruthy();
    expect(screen.getByText(/my raw thoughts remain private/i)).toBeTruthy();
  });

  it('requires checkbox before signing', () => {
    render(<CuriosityCompact {...defaultProps} />);
    const signButton = screen.getByText(/sign and begin/i);
    expect(signButton).toBeDisabled();
  });

  it('enables sign button when checkbox checked', () => {
    render(<CuriosityCompact {...defaultProps} />);
    fireEvent.press(screen.getByTestId('agree-checkbox'));
    const signButton = screen.getByText(/sign and begin/i);
    expect(signButton).not.toBeDisabled();
  });

  it('calls signCompact when signed', async () => {
    const onSign = jest.fn();
    mockSignCompact.mockImplementation((_, options) => {
      options?.onSuccess?.();
    });

    render(<CuriosityCompact sessionId="123" onSign={onSign} />);
    fireEvent.press(screen.getByTestId('agree-checkbox'));
    fireEvent.press(screen.getByText(/sign and begin/i));

    await waitFor(() => {
      expect(mockSignCompact).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onSign).toHaveBeenCalled();
    });
  });

  it('shows questions button', () => {
    render(<CuriosityCompact {...defaultProps} />);
    expect(screen.getByText(/i have questions/i)).toBeTruthy();
  });
});
