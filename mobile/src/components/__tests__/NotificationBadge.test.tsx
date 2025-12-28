/**
 * NotificationBadge Component Tests
 */

import { render, screen } from '@testing-library/react-native';
import { NotificationBadge } from '../NotificationBadge';

describe('NotificationBadge', () => {
  describe('visibility', () => {
    it('should not render when count is 0', () => {
      render(<NotificationBadge count={0} />);
      expect(screen.queryByTestId('notification-badge')).toBeNull();
    });

    it('should not render when count is negative', () => {
      render(<NotificationBadge count={-1} />);
      expect(screen.queryByTestId('notification-badge')).toBeNull();
    });

    it('should render when count is greater than 0', () => {
      render(<NotificationBadge count={1} />);
      expect(screen.getByTestId('notification-badge')).toBeTruthy();
    });
  });

  describe('count display', () => {
    it('should display the exact count for numbers 1-9', () => {
      render(<NotificationBadge count={5} />);
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('should display 9+ for counts greater than 9', () => {
      render(<NotificationBadge count={10} />);
      expect(screen.getByText('9+')).toBeTruthy();
    });

    it('should display 9+ for very large counts', () => {
      render(<NotificationBadge count={999} />);
      expect(screen.getByText('9+')).toBeTruthy();
    });

    it('should display 9 exactly when count is 9', () => {
      render(<NotificationBadge count={9} />);
      expect(screen.getByText('9')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('should have correct accessibility label for single notification', () => {
      render(<NotificationBadge count={1} />);
      const badge = screen.getByTestId('notification-badge');
      expect(badge.props.accessibilityLabel).toBe('1 unread notifications');
    });

    it('should have correct accessibility label for multiple notifications', () => {
      render(<NotificationBadge count={5} />);
      const badge = screen.getByTestId('notification-badge');
      expect(badge.props.accessibilityLabel).toBe('5 unread notifications');
    });

    it('should have correct accessibility role', () => {
      render(<NotificationBadge count={1} />);
      const badge = screen.getByTestId('notification-badge');
      expect(badge.props.accessibilityRole).toBe('text');
    });
  });

  describe('customization', () => {
    it('should accept custom testID', () => {
      render(<NotificationBadge count={1} testID="custom-badge" />);
      expect(screen.getByTestId('custom-badge')).toBeTruthy();
    });
  });
});
