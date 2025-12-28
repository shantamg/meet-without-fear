/**
 * WaitingRoom Component Tests
 *
 * Tests for the waiting room component displayed while waiting for partner.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { WaitingRoom } from '../WaitingRoom';

describe('WaitingRoom', () => {
  it('displays the waiting message', () => {
    render(
      <WaitingRoom message="Waiting for your partner to submit their ranking" />
    );

    expect(
      screen.getByText('Waiting for your partner to submit their ranking')
    ).toBeTruthy();
  });

  it('displays partner name when provided', () => {
    render(
      <WaitingRoom
        message="Waiting for your partner to submit their ranking"
        partnerName="Jane"
      />
    );

    expect(screen.getAllByText(/jane/i).length).toBeGreaterThan(0);
  });

  it('shows a loading indicator', () => {
    render(<WaitingRoom message="Waiting..." />);

    expect(screen.getByTestId('waiting-indicator')).toBeTruthy();
  });

  it('handles missing partner name gracefully', () => {
    render(
      <WaitingRoom message="Waiting for your partner to submit their ranking" />
    );

    // Should still render the message
    expect(
      screen.getByText('Waiting for your partner to submit their ranking')
    ).toBeTruthy();
  });
});
