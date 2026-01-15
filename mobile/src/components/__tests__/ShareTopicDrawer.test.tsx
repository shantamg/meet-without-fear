/**
 * ShareTopicDrawer Component Tests
 *
 * Tests for the Phase 1 share topic drawer.
 * This full-screen drawer shows the suggested topic to share about
 * and allows the user to accept or decline.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ShareTopicDrawer } from '../ShareTopicDrawer';

// Mock Alert.alert to test confirmation dialog
jest.spyOn(Alert, 'alert');

describe('ShareTopicDrawer', () => {
  const defaultProps = {
    visible: true,
    guesserName: 'Partner',
    suggestedShareFocus: 'your feelings about the recent conflict',
    action: 'OFFER_SHARING' as const,
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders when visible is true', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByTestId('share-topic-drawer')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      render(<ShareTopicDrawer {...defaultProps} visible={false} />);
      expect(screen.queryByTestId('share-topic-drawer')).toBeNull();
    });
  });

  describe('content - OFFER_SHARING', () => {
    it('displays intro text with guesser name', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByText(/Our internal reconciler has reviewed what Partner is imagining you are feeling/)).toBeTruthy();
    });

    it('displays OFFER_SHARING language suffix', () => {
      render(<ShareTopicDrawer {...defaultProps} action="OFFER_SHARING" />);
      expect(screen.getByText(/you share more about:/)).toBeTruthy();
    });

    it('displays SUGGESTED FOCUS label', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByText('SUGGESTED FOCUS')).toBeTruthy();
    });

    it('displays the suggested share focus topic', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByText('your feelings about the recent conflict')).toBeTruthy();
    });

    it('displays accept button', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByText('Yes, help me share')).toBeTruthy();
    });

    it('displays decline button', () => {
      render(<ShareTopicDrawer {...defaultProps} />);
      expect(screen.getByText('No thanks')).toBeTruthy();
    });
  });

  describe('content - OFFER_OPTIONAL', () => {
    it('displays OFFER_OPTIONAL language suffix', () => {
      render(<ShareTopicDrawer {...defaultProps} action="OFFER_OPTIONAL" />);
      expect(screen.getByText(/you might consider sharing about:/)).toBeTruthy();
    });
  });

  describe('language differentiation (US-2)', () => {
    it('uses "you share more about:" for OFFER_SHARING', () => {
      render(<ShareTopicDrawer {...defaultProps} action="OFFER_SHARING" />);
      const introText = screen.getByText(/and has suggested that/);
      expect(introText).toBeTruthy();
      expect(screen.getByText(/you share more about:/)).toBeTruthy();
      expect(screen.queryByText(/you might consider sharing about:/)).toBeNull();
    });

    it('uses "you might consider sharing about:" for OFFER_OPTIONAL', () => {
      render(<ShareTopicDrawer {...defaultProps} action="OFFER_OPTIONAL" />);
      expect(screen.getByText(/you might consider sharing about:/)).toBeTruthy();
      expect(screen.queryByText(/you share more about:/)).toBeNull();
    });
  });

  describe('accept interaction', () => {
    it('calls onAccept when accept button is pressed (caller handles closing)', () => {
      const onAccept = jest.fn();
      const onClose = jest.fn();
      render(<ShareTopicDrawer {...defaultProps} onAccept={onAccept} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('share-topic-accept'));

      // Only onAccept is called - the caller handles closing the drawer after async operation completes
      expect(onAccept).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('decline interaction (US-4)', () => {
    it('shows confirmation alert when decline is pressed', () => {
      render(<ShareTopicDrawer {...defaultProps} />);

      fireEvent.press(screen.getByTestId('share-topic-decline'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Are you sure?',
        'Sharing this could help Partner understand you better.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Go back', style: 'cancel' }),
          expect.objectContaining({ text: 'Skip sharing', style: 'destructive' }),
        ])
      );
    });

    it('calls onDecline and onClose when decline is confirmed', () => {
      const onDecline = jest.fn();
      const onClose = jest.fn();
      render(<ShareTopicDrawer {...defaultProps} onDecline={onDecline} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('share-topic-decline'));

      // Get the alert callback and simulate confirming
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find((btn: { text: string }) => btn.text === 'Skip sharing');
      confirmButton.onPress();

      expect(onDecline).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onDecline when decline is cancelled', () => {
      const onDecline = jest.fn();
      const onClose = jest.fn();
      render(<ShareTopicDrawer {...defaultProps} onDecline={onDecline} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('share-topic-decline'));

      // Get the alert callback - cancel button has no onPress, so nothing happens
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const cancelButton = alertCall[2].find((btn: { text: string }) => btn.text === 'Go back');

      // Cancel button just has style: 'cancel', no onPress callback
      expect(cancelButton.style).toBe('cancel');
      expect(onDecline).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('close interaction', () => {
    it('calls onClose when close button is pressed', () => {
      const onClose = jest.fn();
      render(<ShareTopicDrawer {...defaultProps} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('share-topic-close'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      render(<ShareTopicDrawer {...defaultProps} isLoading={true} />);

      // Accept button should show loading indicator, not text
      expect(screen.queryByText('Yes, help me share')).toBeNull();
    });

    it('disables buttons when isLoading is true', () => {
      render(<ShareTopicDrawer {...defaultProps} isLoading={true} />);

      const acceptButton = screen.getByTestId('share-topic-accept');
      const declineButton = screen.getByTestId('share-topic-decline');

      // Buttons should be disabled when loading
      expect(acceptButton.props.accessibilityState?.disabled).toBe(true);
      expect(declineButton.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
