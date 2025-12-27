/**
 * AgreementCard Component Tests
 *
 * Tests for the agreement confirmation card.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AgreementCard } from '../AgreementCard';

describe('AgreementCard', () => {
  const mockAgreement = {
    experiment: 'Take turns speaking without interruption for 5 minutes each',
    duration: '2 weeks',
    successMeasure: 'Both partners feel heard after each conversation',
    checkInDate: 'January 15, 2025',
  };

  const defaultProps = {
    agreement: mockAgreement,
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders micro-experiment agreement title', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(screen.getByText(/micro-experiment agreement/i)).toBeTruthy();
  });

  it('displays the experiment description', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(
      screen.getByText(
        'Take turns speaking without interruption for 5 minutes each'
      )
    ).toBeTruthy();
  });

  it('displays the duration', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(screen.getByText('2 weeks')).toBeTruthy();
    expect(screen.getByText(/duration/i)).toBeTruthy();
  });

  it('displays the success measure', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(
      screen.getByText('Both partners feel heard after each conversation')
    ).toBeTruthy();
    expect(screen.getByText(/success measure/i)).toBeTruthy();
  });

  it('displays the check-in date when provided', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(screen.getByText('January 15, 2025')).toBeTruthy();
  });

  it('does not display check-in section when not provided', () => {
    const agreementWithoutCheckIn = { ...mockAgreement, checkInDate: undefined };
    render(
      <AgreementCard {...defaultProps} agreement={agreementWithoutCheckIn} />
    );

    expect(screen.queryByText('January 15, 2025')).toBeNull();
  });

  it('has a confirm button', () => {
    render(<AgreementCard {...defaultProps} />);

    expect(screen.getByText(/confirm agreement/i)).toBeTruthy();
  });

  it('calls onConfirm when confirm button is pressed', () => {
    render(<AgreementCard {...defaultProps} />);

    fireEvent.press(screen.getByText(/confirm agreement/i));

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });
});
