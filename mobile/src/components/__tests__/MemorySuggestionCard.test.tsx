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

jest.mock('../../hooks/useMemories', () => ({
  useApproveMemory: () => mockApproveMemory,
  useRejectMemory: () => mockRejectMemory,
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
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
        sessionId: undefined,
        editedContent: undefined,
      });
    });
  });

  it('calls rejectMemory when dismiss is pressed', async () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Not now'));

    await waitFor(() => {
      expect(mockRejectMemory.mutateAsync).toHaveBeenCalledWith({
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
      });
    });
  });

  it('shows edit input when edit button is pressed', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));

    expect(screen.getByTestId('memory-suggestion-card-edit-input')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('hides action buttons when in edit mode', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));

    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Not now')).toBeNull();
  });

  it('cancels edit and returns to normal view', () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));
    fireEvent.press(screen.getByText('Cancel'));

    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.queryByTestId('memory-suggestion-card-edit-input')).toBeNull();
  });

  it('saves edited content when save is pressed', async () => {
    renderWithProviders(<MemorySuggestionCard {...defaultProps} />);

    fireEvent.press(screen.getByText('Edit'));

    const input = screen.getByTestId('memory-suggestion-card-edit-input');
    fireEvent.changeText(input, 'Modified content');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockApproveMemory.mutateAsync).toHaveBeenCalledWith({
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
        sessionId: undefined,
        editedContent: 'Modified content',
      });
    });
  });

  it('passes sessionId for session-scoped memories', async () => {
    const sessionScopedSuggestion: MemorySuggestion = {
      ...mockSuggestion,
      scope: 'session',
    };
    renderWithProviders(
      <MemorySuggestionCard
        {...defaultProps}
        suggestion={sessionScopedSuggestion}
        sessionId="session-123"
      />
    );

    fireEvent.press(screen.getByText('Approve'));

    await waitFor(() => {
      expect(mockApproveMemory.mutateAsync).toHaveBeenCalledWith({
        suggestedContent: 'Keep responses brief and concise',
        category: 'COMMUNICATION',
        sessionId: 'session-123',
        editedContent: undefined,
      });
    });
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
