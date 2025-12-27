/**
 * PastSessionCard Component Tests
 *
 * Tests for the past session card that shows completed session info in history list.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PastSessionCard } from '../PastSessionCard';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  CheckCircle: () => 'CheckCircleIcon',
}));

describe('PastSessionCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('Content Display', () => {
    it('shows session date', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Household responsibilities"
        />
      );

      expect(screen.getByText('Dec 15, 2024')).toBeTruthy();
    });

    it('shows session topic', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Household responsibilities"
        />
      );

      expect(screen.getByText('Household responsibilities')).toBeTruthy();
    });

    it('handles long topic text', () => {
      const longTopic =
        'Discussion about managing work-life balance and household chores';
      render(
        <PastSessionCard sessionId="session-123" date="Nov 28, 2024" topic={longTopic} />
      );

      expect(screen.getByText(longTopic)).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('navigates to session review on press', () => {
      render(
        <PastSessionCard
          sessionId="session-past-123"
          date="Dec 15, 2024"
          topic="Holiday planning"
        />
      );

      fireEvent.press(screen.getByText('Holiday planning'));

      expect(mockPush).toHaveBeenCalledWith('/session/session-past-123/review');
    });

    it('navigates when pressing anywhere on card', () => {
      render(
        <PastSessionCard
          sessionId="session-abc"
          date="Oct 10, 2024"
          topic="Budget discussion"
        />
      );

      fireEvent.press(screen.getByTestId('past-session-card'));

      expect(mockPush).toHaveBeenCalledWith('/session/session-abc/review');
    });
  });

  describe('Accessibility', () => {
    it('has accessible button role', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Household responsibilities"
        />
      );

      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('has descriptive accessibility label', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Household responsibilities"
        />
      );

      expect(
        screen.getByLabelText('Past session: Household responsibilities, Dec 15, 2024')
      ).toBeTruthy();
    });

    it('has accessibility hint for navigation', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Test topic"
        />
      );

      expect(screen.getByAccessibilityHint('Tap to view session review')).toBeTruthy();
    });
  });

  describe('TestID', () => {
    it('renders with testID for testing', () => {
      render(
        <PastSessionCard
          sessionId="session-123"
          date="Dec 15, 2024"
          topic="Test topic"
        />
      );

      expect(screen.getByTestId('past-session-card')).toBeTruthy();
    });
  });
});
