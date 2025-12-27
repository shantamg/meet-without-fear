/**
 * ConsentPrompt Tests
 *
 * Tests for the consent prompt component used before sharing sensitive data.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ConsentPrompt } from '../ConsentPrompt';

describe('ConsentPrompt', () => {
  const defaultProps = {
    title: 'Share your attempt?',
    description: 'Your partner will see this.',
    onConsent: jest.fn(),
    onDecline: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Content Display', () => {
    it('renders the title', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText(defaultProps.title)).toBeTruthy();
    });

    it('renders the description', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText(defaultProps.description)).toBeTruthy();
    });

    it('shows default consent label', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText('Yes, share this')).toBeTruthy();
    });

    it('shows default decline label', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText('Not yet')).toBeTruthy();
    });

    it('shows custom consent label', () => {
      render(<ConsentPrompt {...defaultProps} consentLabel="I agree" />);
      expect(screen.getByText('I agree')).toBeTruthy();
    });

    it('shows custom decline label', () => {
      render(<ConsentPrompt {...defaultProps} declineLabel="Go back" />);
      expect(screen.getByText('Go back')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('calls onConsent when consent button is pressed', () => {
      render(<ConsentPrompt {...defaultProps} />);
      const consentButton = screen.getByText('Yes, share this');
      fireEvent.press(consentButton);
      expect(defaultProps.onConsent).toHaveBeenCalledTimes(1);
    });

    it('calls onDecline when decline button is pressed', () => {
      render(<ConsentPrompt {...defaultProps} />);
      const declineButton = screen.getByText('Not yet');
      fireEvent.press(declineButton);
      expect(defaultProps.onDecline).toHaveBeenCalledTimes(1);
    });

    it('does not call onConsent when decline is pressed', () => {
      render(<ConsentPrompt {...defaultProps} />);
      const declineButton = screen.getByText('Not yet');
      fireEvent.press(declineButton);
      expect(defaultProps.onConsent).not.toHaveBeenCalled();
    });

    it('does not call onDecline when consent is pressed', () => {
      render(<ConsentPrompt {...defaultProps} />);
      const consentButton = screen.getByText('Yes, share this');
      fireEvent.press(consentButton);
      expect(defaultProps.onDecline).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible buttons', () => {
      render(<ConsentPrompt {...defaultProps} />);
      const consentButton = screen.getByText('Yes, share this');
      const declineButton = screen.getByText('Not yet');
      expect(consentButton.props.accessibilityRole || 'button').toBe('button');
      expect(declineButton.props.accessibilityRole || 'button').toBe('button');
    });
  });

  describe('Styling', () => {
    it('accepts custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <ConsentPrompt {...defaultProps} style={customStyle} testID="consent-prompt" />
      );
      const container = getByTestId('consent-prompt');
      expect(container.props.style).toContainEqual(expect.objectContaining(customStyle));
    });
  });

  describe('Edge Cases', () => {
    it('handles long title text', () => {
      const longTitle = 'Are you sure you want to share your empathy attempt with your partner?';
      render(<ConsentPrompt {...defaultProps} title={longTitle} />);
      expect(screen.getByText(longTitle)).toBeTruthy();
    });

    it('handles long description text', () => {
      const longDescription =
        'Your partner will be able to see your attempt to understand their perspective. ' +
        'They can provide feedback on how accurate your understanding feels to them.';
      render(<ConsentPrompt {...defaultProps} description={longDescription} />);
      expect(screen.getByText(longDescription)).toBeTruthy();
    });
  });
});
