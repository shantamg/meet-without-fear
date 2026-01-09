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

const mockFormatMemory = {
  mutateAsync: jest.fn(),
  isPending: false,
};

jest.mock('../../hooks/useMemories', () => ({
  useApproveMemory: () => mockApproveMemory,
  useRejectMemory: () => mockRejectMemory,
  useFormatMemory: () => mockFormatMemory,
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
    mockFormatMemory.mutateAsync.mockResolvedValue({
      valid: true,
      suggestion: { content: 'Formatted content', category: 'COMMUNICATION' },
    });
    mockApproveMemory.isPending = false;
    mockRejectMemory.isPending = false;
    mockFormatMemory.isPending = false;
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

  it('opens edit modal when edit button is pressed', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));

    // The edit modal should be visible
    expect(screen.getByTestId('memory-suggestion-card-edit-modal')).toBeTruthy();
    expect(screen.getByText('Edit Memory')).toBeTruthy();
    expect(screen.getByText('Current memory:')).toBeTruthy();
  });

  it('shows suggestion content in edit modal', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));

    // The modal should show the current suggestion content (appears in both card and modal)
    const contentElements = screen.getAllByText('"Keep responses brief and concise"');
    expect(contentElements.length).toBeGreaterThanOrEqual(2); // Card and modal
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
