/**
 * ShareTopicPanel Component Tests
 *
 * Tests for the Phase 1 share topic suggestion panel.
 * This panel appears when the reconciler suggests sharing additional context.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ShareTopicPanel } from '../ShareTopicPanel';

describe('ShareTopicPanel', () => {
  const defaultProps = {
    visible: true,
    onPress: jest.fn(),
    action: 'OFFER_SHARING' as const,
    partnerName: 'Partner',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders when visible is true', () => {
      render(<ShareTopicPanel {...defaultProps} />);
      expect(screen.getByTestId('share-topic-panel')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      render(<ShareTopicPanel {...defaultProps} visible={false} />);
      expect(screen.queryByTestId('share-topic-panel')).toBeNull();
    });
  });

  describe('content', () => {
    it('displays the suggestion text with partner name', () => {
      render(<ShareTopicPanel {...defaultProps} />);
      expect(screen.getByText('Help Partner understand you better')).toBeTruthy();
    });

    it('displays correct name when partnerName changes', () => {
      render(<ShareTopicPanel {...defaultProps} partnerName="Alex" />);
      expect(screen.getByText('Help Alex understand you better')).toBeTruthy();
    });
  });

  describe('interaction', () => {
    it('calls onPress when tapped', () => {
      const onPress = jest.fn();
      render(<ShareTopicPanel {...defaultProps} onPress={onPress} />);
      fireEvent.press(screen.getByTestId('share-topic-panel'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('action differentiation', () => {
    it('renders with OFFER_SHARING action', () => {
      render(<ShareTopicPanel {...defaultProps} action="OFFER_SHARING" />);
      expect(screen.getByTestId('share-topic-panel')).toBeTruthy();
    });

    it('renders with OFFER_OPTIONAL action', () => {
      render(<ShareTopicPanel {...defaultProps} action="OFFER_OPTIONAL" />);
      expect(screen.getByTestId('share-topic-panel')).toBeTruthy();
    });
  });
});
