/**
 * Compact Screen Tests
 *
 * Tests for the Stage 0 Curiosity Compact screen.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompactScreen from '../compact';

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'session-123' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  Stack: {
    Screen: () => null,
  },
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  ArrowRight: () => 'ArrowRightIcon',
  Save: () => 'SaveIcon',
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useCompactStatus and useSignCompact
const mockUseCompactStatus = jest.fn();
const mockSignCompact = jest.fn();
const mockUseSignCompact = jest.fn();

jest.mock('../../../../../src/hooks/useStages', () => ({
  useCompactStatus: () => mockUseCompactStatus(),
  useSignCompact: () => mockUseSignCompact(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(component: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
}

describe('CompactScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSignCompact.mockReturnValue({
      mutate: mockSignCompact,
      isPending: false,
    });
  });

  describe('loading state', () => {
    it('shows loading state while fetching compact status', () => {
      mockUseCompactStatus.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithProviders(<CompactScreen />);

      expect(screen.getByText('Loading...')).toBeTruthy();
    });
  });

  describe('not signed state', () => {
    beforeEach(() => {
      mockUseCompactStatus.mockReturnValue({
        data: {
          mySigned: false,
          mySignedAt: null,
          partnerSigned: false,
          partnerSignedAt: null,
          canAdvance: false,
        },
        isLoading: false,
      });
    });

    it('shows CuriosityCompact component when user has not signed', () => {
      renderWithProviders(<CompactScreen />);

      expect(screen.getByText('The Curiosity Compact')).toBeTruthy();
    });

    it('shows compact terms', () => {
      renderWithProviders(<CompactScreen />);

      expect(
        screen.getByText(/approach this process with curiosity/i)
      ).toBeTruthy();
    });

    it('requires checkbox before signing', () => {
      renderWithProviders(<CompactScreen />);

      const signButton = screen.getByText(/sign and begin/i);
      expect(signButton).toBeDisabled();
    });

    it('enables sign button when checkbox is checked', () => {
      renderWithProviders(<CompactScreen />);

      fireEvent.press(screen.getByTestId('agree-checkbox'));
      const signButton = screen.getByText(/sign and begin/i);
      expect(signButton).not.toBeDisabled();
    });

    it('calls signCompact mutation when sign button pressed', async () => {
      mockSignCompact.mockImplementation((_, options) => {
        options?.onSuccess?.({ signed: true, partnerSigned: false, canAdvance: false });
      });

      renderWithProviders(<CompactScreen />);

      fireEvent.press(screen.getByTestId('agree-checkbox'));
      fireEvent.press(screen.getByText(/sign and begin/i));

      await waitFor(() => {
        expect(mockSignCompact).toHaveBeenCalledWith(
          { sessionId: 'session-123' },
          expect.any(Object)
        );
      });
    });
  });

  describe('waiting state', () => {
    beforeEach(() => {
      mockUseCompactStatus.mockReturnValue({
        data: {
          mySigned: true,
          mySignedAt: '2024-01-01T00:00:00Z',
          partnerSigned: false,
          partnerSignedAt: null,
          canAdvance: false,
        },
        isLoading: false,
      });
    });

    it('shows WaitingRoom when user signed but partner has not', () => {
      renderWithProviders(<CompactScreen />);

      expect(screen.getByTestId('waiting-indicator')).toBeTruthy();
      expect(
        screen.getByText(/waiting for your partner to sign the compact/i)
      ).toBeTruthy();
    });
  });

  describe('both signed state', () => {
    beforeEach(() => {
      mockUseCompactStatus.mockReturnValue({
        data: {
          mySigned: true,
          mySignedAt: '2024-01-01T00:00:00Z',
          partnerSigned: true,
          partnerSignedAt: '2024-01-01T00:01:00Z',
          canAdvance: true,
        },
        isLoading: false,
      });
    });

    it('navigates to chat when both have signed', () => {
      renderWithProviders(<CompactScreen />);

      expect(mockReplace).toHaveBeenCalledWith('/session/session-123/chat');
    });
  });

  describe('sign mutation success with canAdvance', () => {
    beforeEach(() => {
      mockUseCompactStatus.mockReturnValue({
        data: {
          mySigned: false,
          mySignedAt: null,
          partnerSigned: true,
          partnerSignedAt: '2024-01-01T00:00:00Z',
          canAdvance: false,
        },
        isLoading: false,
      });
    });

    it('navigates to chat when signing completes and canAdvance is true', async () => {
      mockSignCompact.mockImplementation((_, options) => {
        options?.onSuccess?.({
          signed: true,
          signedAt: '2024-01-01T00:01:00Z',
          partnerSigned: true,
          canAdvance: true,
        });
      });

      renderWithProviders(<CompactScreen />);

      fireEvent.press(screen.getByTestId('agree-checkbox'));
      fireEvent.press(screen.getByText(/sign and begin/i));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/session/session-123/chat');
      });
    });
  });
});
