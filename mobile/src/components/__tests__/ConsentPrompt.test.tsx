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
    onSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Content Display', () => {
    it('renders the title and description', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText(defaultProps.title)).toBeTruthy();
      expect(screen.getByText(defaultProps.description)).toBeTruthy();
    });

    it('shows all sharing options by default', () => {
      render(<ConsentPrompt {...defaultProps} />);
      expect(screen.getByText('Share full reflection')).toBeTruthy();
      expect(screen.getByText('Share summary only')).toBeTruthy();
      expect(screen.getByText('Share just the theme')).toBeTruthy();
      expect(screen.getByText('Keep private')).toBeTruthy();
    });

    it('shows simplified options when requested', () => {
      render(<ConsentPrompt {...defaultProps} simplified />);
      expect(screen.getByText('Share with partner')).toBeTruthy();
      expect(screen.getByText('Keep editing')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('allows selecting an option and confirming', () => {
      render(<ConsentPrompt {...defaultProps} />);

      fireEvent.press(screen.getByText('Share summary only'));
      fireEvent.press(screen.getByText('Confirm choice'));

      expect(defaultProps.onSelect).toHaveBeenCalledWith('summary');
    });
  });

  describe('Styling', () => {
    it('accepts custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <ConsentPrompt {...defaultProps} style={customStyle} testID='consent-prompt' />
      );
      const container = getByTestId('consent-prompt');
      expect(container.props.style).toContainEqual(expect.objectContaining(customStyle));
    });
  });
});
