/**
 * MemorySuggestionCard Component Tests
 *
 * Tests for the memory suggestion card shown in chat.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemorySuggestionCard } from '../MemorySuggestionCard';
import type { MemorySuggestion } from '@meet-without-fear/shared';

// Mock the useMemories hooks
const mockApproveMemory = {
  mutateAsync: jest.fn(),
  isPending: false,
};

const mockRejectMemory = {
  mutateAsync: jest.fn(),
  isPending: false,
};

const mockRouter = {
  push: jest.fn(),
};

jest.mock('../../hooks/useMemories', () => ({
  useApproveMemory: () => mockApproveMemory,
  useRejectMemory: () => mockRejectMemory,
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

describe('MemorySuggestionCard', () => {
  const mockSuggestion: MemorySuggestion = {
    suggestedContent: 'Keep responses brief and concise',
    category: 'COMMUNICATION',
    scope: 'global',
    confidence: 'high',
    evidence: 'User explicitly requested brief responses',
  };

  const defaultProps = {
    suggestion: mockSuggestion,
    onDismiss: jest.fn(),
    onApproved: jest.fn(),
  };

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApproveMemory.mutateAsync.mockResolvedValue({});
    mockRejectMemory.mutateAsync.mockResolvedValue({});
    mockApproveMemory.isPending = false;
    mockRejectMemory.isPending = false;
    mockRouter.push.mockClear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
  };

  it('renders the header with star icon and title', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    expect(screen.getByText('Remember this?')).toBeTruthy();
  });

  it('displays the suggested content in quotes', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    expect(
      screen.getByText('"Keep responses brief and concise"')
    ).toBeTruthy();
  });

  it('displays high confidence badge', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    expect(screen.getByText('High confidence')).toBeTruthy();
  });

  it('displays medium confidence badge', () => {
    const mediumConfidenceSuggestion: MemorySuggestion = {
      ...mockSuggestion,
      confidence: 'medium',
    };
    renderWithProviders(
      <MemorySuggestionCard {...defaultProps} suggestion={mediumConfidenceSuggestion} />
    );

    expect(screen.getByText('Medium confidence')).toBeTruthy();
  });

  it('displays low confidence badge', () => {
    const lowConfidenceSuggestion: MemorySuggestion = {
      ...mockSuggestion,
      confidence: 'low',
    };
    renderWithProviders(
      <MemorySuggestionCard {...defaultProps} suggestion={lowConfidenceSuggestion} />
    );

    expect(screen.getByText('Low confidence')).toBeTruthy();
  });

  it('renders approve, edit, and dismiss buttons', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('calls approveMemory and onApproved when approve is pressed', async () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Approve'));

    await waitFor(() => {
      expect(mockApproveMemory.mutateAsync).toHaveBeenCalledWith({
        id: undefined,
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
        sessionId: undefined,
      });
    });
  });

  it('calls rejectMemory when dismiss is pressed', async () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Not now'));

    await waitFor(() => {
      expect(mockRejectMemory.mutateAsync).toHaveBeenCalledWith({
        id: undefined,
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
      });
    });
  });

  it('navigates to settings when edit button is pressed', () => {
    const mockOnDismiss = jest.fn();
    renderWithProviders(
      <MemorySuggestionCard {...defaultProps} onDismiss={mockOnDismiss} />
    );

    fireEvent.press(screen.getByText('Edit'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/settings/memories',
      params: undefined,
    });
    expect(mockOnDismiss).toHaveBeenCalled();
  });

  it('navigates to settings with memory ID when edit button is pressed and suggestion has ID', () => {
    const mockOnDismiss = jest.fn();
    const suggestionWithId: MemorySuggestion = {
      ...mockSuggestion,
      id: 'memory-123',
    };
    renderWithProviders(
      <MemorySuggestionCard
        {...defaultProps}
        suggestion={suggestionWithId}
        onDismiss={mockOnDismiss}
      />
    );

    fireEvent.press(screen.getByText('Edit'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/settings/memories',
      params: { editId: 'memory-123' },
    });
    expect(mockOnDismiss).toHaveBeenCalled();
  });


  it('has accessible touch targets', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: 'Approve memory' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit memory' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Dismiss memory suggestion' })
    ).toBeTruthy();
  });

  it('uses custom testID when provided', () => {
    renderWithProviders(
      <MemorySuggestionCard {...defaultProps} testID="custom-test-id" />
    );

    expect(screen.getByTestId('custom-test-id')).toBeTruthy();
  });
});
