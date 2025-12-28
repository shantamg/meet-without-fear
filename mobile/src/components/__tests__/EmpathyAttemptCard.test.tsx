/**
 * EmpathyAttemptCard Tests
 *
 * Tests for the empathy attempt display card used in Stage 2.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { EmpathyAttemptCard } from '../EmpathyAttemptCard';
import { colors } from '@/theme';

describe('EmpathyAttemptCard', () => {
  const defaultAttempt = 'I understand that you feel frustrated when...';

  describe('User Attempt (default)', () => {
    it('renders the attempt content', () => {
      render(<EmpathyAttemptCard attempt={defaultAttempt} />);
      expect(screen.getByText(defaultAttempt)).toBeTruthy();
    });

    it('shows "Your empathy attempt" label for user attempt', () => {
      render(<EmpathyAttemptCard attempt={defaultAttempt} />);
      expect(screen.getByText(/your empathy attempt/i)).toBeTruthy();
    });

    it('does not show partner styling for user attempt', () => {
      const { getByTestId } = render(
        <EmpathyAttemptCard attempt={defaultAttempt} testID="empathy-card" />
      );
      const card = getByTestId('empathy-card');
      // User cards have the default gray background
      expect(card.props.style).not.toContainEqual(
        expect.objectContaining({ borderColor: colors.accent })
      );
    });
  });

  describe('Partner Attempt', () => {
    it('renders partner attempt content', () => {
      render(<EmpathyAttemptCard attempt={defaultAttempt} isPartner />);
      expect(screen.getByText(defaultAttempt)).toBeTruthy();
    });

    it('shows partner label for partner attempt', () => {
      render(<EmpathyAttemptCard attempt={defaultAttempt} isPartner />);
      expect(screen.getByText(/partner's attempt to understand you/i)).toBeTruthy();
    });

    it('applies partner styling', () => {
      const { getByTestId } = render(
        <EmpathyAttemptCard attempt={defaultAttempt} isPartner testID="partner-card" />
      );
      const card = getByTestId('partner-card');
      // Partner cards have accent border styling
      expect(card.props.style).toContainEqual(expect.objectContaining({ borderColor: colors.accent }));
    });
  });

  describe('Edge Cases', () => {
    it('handles empty attempt string', () => {
      render(<EmpathyAttemptCard attempt="" />);
      expect(screen.getByText(/your empathy attempt/i)).toBeTruthy();
    });

    it('handles long attempt text', () => {
      const longAttempt =
        'I understand that you feel frustrated when things do not go as planned, ' +
        'and I can see how that would be really challenging for you. ' +
        'It seems like you value predictability and control, ' +
        'and when those are disrupted, it affects your sense of security.';
      render(<EmpathyAttemptCard attempt={longAttempt} />);
      expect(screen.getByText(longAttempt)).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('accepts custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <EmpathyAttemptCard attempt={defaultAttempt} style={customStyle} testID="styled-card" />
      );
      const card = getByTestId('styled-card');
      expect(card.props.style).toContainEqual(expect.objectContaining(customStyle));
    });
  });
});
