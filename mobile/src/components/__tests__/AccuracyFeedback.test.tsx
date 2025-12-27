/**
 * AccuracyFeedback Tests
 *
 * Tests for the accuracy feedback component used in Stage 2 validation phase.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AccuracyFeedback } from '../AccuracyFeedback';

describe('AccuracyFeedback', () => {
  const defaultProps = {
    onAccurate: jest.fn(),
    onPartiallyAccurate: jest.fn(),
    onInaccurate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Content Display', () => {
    it('shows the question prompt', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('How accurate is this?')).toBeTruthy();
    });

    it('shows accurate option', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('This feels accurate')).toBeTruthy();
    });

    it('shows accurate subtext', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('I feel understood')).toBeTruthy();
    });

    it('shows partially accurate option', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('Partially accurate')).toBeTruthy();
    });

    it('shows partially accurate subtext', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('Some parts are right, some need adjustment')).toBeTruthy();
    });

    it('shows inaccurate option', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('This misses the mark')).toBeTruthy();
    });

    it('shows inaccurate subtext', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      expect(screen.getByText('I want to provide feedback')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('calls onAccurate when accurate button is pressed', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const accurateButton = screen.getByText('This feels accurate');
      fireEvent.press(accurateButton);
      expect(defaultProps.onAccurate).toHaveBeenCalledTimes(1);
    });

    it('calls onPartiallyAccurate when partial button is pressed', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const partialButton = screen.getByText('Partially accurate');
      fireEvent.press(partialButton);
      expect(defaultProps.onPartiallyAccurate).toHaveBeenCalledTimes(1);
    });

    it('calls onInaccurate when inaccurate button is pressed', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const inaccurateButton = screen.getByText('This misses the mark');
      fireEvent.press(inaccurateButton);
      expect(defaultProps.onInaccurate).toHaveBeenCalledTimes(1);
    });

    it('only calls the selected callback', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const accurateButton = screen.getByText('This feels accurate');
      fireEvent.press(accurateButton);
      expect(defaultProps.onAccurate).toHaveBeenCalledTimes(1);
      expect(defaultProps.onPartiallyAccurate).not.toHaveBeenCalled();
      expect(defaultProps.onInaccurate).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible accurate button', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const accurateButton = screen.getByLabelText('This feels accurate');
      expect(accurateButton).toBeTruthy();
    });

    it('has accessible partially accurate button', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const partialButton = screen.getByLabelText('Partially accurate');
      expect(partialButton).toBeTruthy();
    });

    it('has accessible inaccurate button', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const inaccurateButton = screen.getByLabelText('This misses the mark');
      expect(inaccurateButton).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('accepts custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <AccuracyFeedback {...defaultProps} style={customStyle} testID="accuracy-feedback" />
      );
      const container = getByTestId('accuracy-feedback');
      expect(container.props.style).toContainEqual(expect.objectContaining(customStyle));
    });
  });

  describe('Visual Hierarchy', () => {
    it('renders all three buttons', () => {
      render(<AccuracyFeedback {...defaultProps} />);
      const buttons = [
        screen.getByText('This feels accurate'),
        screen.getByText('Partially accurate'),
        screen.getByText('This misses the mark'),
      ];
      buttons.forEach((button) => expect(button).toBeTruthy());
    });
  });
});
